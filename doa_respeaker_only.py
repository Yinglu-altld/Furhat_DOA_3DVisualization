import argparse
import json
import math
import queue
import time

import numpy as np
import sounddevice as sd

from respeaker_config import ARRAY_PRESETS, pick_respeaker_device, resolve_preset_args


def wrap(a):
    return ((a + 180.0) % 360.0) - 180.0


def cdelta(a, b):
    return wrap(b - a)


def cblend(a, b, alpha):
    return wrap(a + alpha * cdelta(a, b))


def lblend(a, b, alpha):
    return a + alpha * (b - a)


def aggregate_energy(per_mic_energy, mode):
    if mode == "median":
        return float(np.median(per_mic_energy))
    if mode == "max":
        return float(np.max(per_mic_energy))
    return float(np.mean(per_mic_energy))


def per_mic_energy_from_frame(block, idx, sample_dtype):
    raw = block[:, idx].astype(np.float64, copy=False)
    dt = str(sample_dtype)
    if dt == "int16":
        mics_f = raw * (1.0 / 32768.0)
        legacy_energy_scale = 32768.0
    elif dt == "int32":
        mics_f = raw * (1.0 / 2147483648.0)
        legacy_energy_scale = 32768.0
    else:
        mics_f = raw
        legacy_energy_scale = 32768.0
    return np.mean(np.abs(mics_f), axis=0) * legacy_energy_scale


def to_float_mics(block, idx, sample_dtype):
    raw = block[:, idx].astype(np.float64, copy=False)
    dt = str(sample_dtype)
    if dt == "int16":
        return raw * (1.0 / 32768.0)
    if dt == "int32":
        return raw * (1.0 / 2147483648.0)
    return raw


def _gcc_phat_tau(sig, refsig, fs_hz, max_tau_s):
    n = int(sig.shape[0] + refsig.shape[0])
    nfft = 1
    while nfft < n:
        nfft <<= 1
    sig_f = np.fft.rfft(sig, n=nfft)
    ref_f = np.fft.rfft(refsig, n=nfft)
    cross = sig_f * np.conj(ref_f)
    cross /= np.maximum(np.abs(cross), 1e-12)
    cc = np.fft.irfft(cross, n=nfft)
    max_shift = min(int(fs_hz * max_tau_s), nfft // 2)
    if max_shift <= 1:
        return 0.0, 0.0
    cc = np.concatenate((cc[-max_shift:], cc[: max_shift + 1]))
    peak_i = int(np.argmax(np.abs(cc)))
    shift = peak_i - max_shift
    tau_s = float(shift) / float(fs_hz)
    peak_v = float(np.abs(cc[peak_i]))
    return tau_s, peak_v


def estimate_direction_3d(frame_mics, mic_xyz_m, fs_hz, speed_of_sound):
    """Estimate unit direction vector from multichannel frame via GCC-PHAT TDOA LSQ."""
    n_mics = int(frame_mics.shape[1])
    if n_mics < 4 or mic_xyz_m.shape[0] != n_mics:
        return None
    # Remove per-channel DC bias to stabilize TDOA peaks.
    frame_mics = frame_mics - np.mean(frame_mics, axis=0, keepdims=True)
    pairs = []
    b = []
    peaks = []
    for i in range(n_mics):
        for j in range(i + 1, n_mics):
            baseline = mic_xyz_m[j] - mic_xyz_m[i]
            dist = float(np.linalg.norm(baseline))
            if dist <= 1e-6:
                continue
            tau_s, peak_v = _gcc_phat_tau(frame_mics[:, j], frame_mics[:, i], fs_hz, dist / speed_of_sound)
            pairs.append(baseline)
            b.append(speed_of_sound * tau_s)
            peaks.append(peak_v)
    if len(pairs) < 3:
        return None
    A = np.asarray(pairs, dtype=np.float64)
    y = np.asarray(b, dtype=np.float64)
    w = np.asarray(peaks, dtype=np.float64)
    if np.all(w <= 1e-9):
        w = np.ones_like(w)
    w = np.sqrt(np.maximum(w, 1e-9))
    Aw = A * w[:, None]
    yw = y * w
    try:
        u, _, _, _ = np.linalg.lstsq(Aw, yw, rcond=None)
    except np.linalg.LinAlgError:
        return None
    nrm = float(np.linalg.norm(u))
    if not np.isfinite(nrm) or nrm <= 1e-9:
        return None
    u = u / nrm
    residual = A @ u - y
    rmse = float(np.sqrt(np.mean(residual * residual)))
    peak_mean = float(np.mean(peaks)) if peaks else 0.0
    # Confidence combines TDOA fit error and correlation peak strength.
    conf_fit = max(0.0, 1.0 - (rmse / 0.05))
    conf_peak = min(1.0, peak_mean / 0.25)
    conf = max(0.0, min(1.0, 0.65 * conf_fit + 0.35 * conf_peak))
    # TDOA sign convention is incoming-wave; export outgoing source vector.
    u = -u
    return float(u[0]), float(u[1]), float(u[2]), conf


def default_xvf3800_mic_xyz_m(half_edge_m: float = 0.019) -> np.ndarray:
    """Approximate 4-mic square on XZ when AEC_MIC_ARRAY_GEO is unavailable."""
    d = float(half_edge_m)
    return np.array(
        [[d, 0.0, d], [-d, 0.0, d], [-d, 0.0, -d], [d, 0.0, -d]],
        dtype=np.float64,
    )


def axis_labels(x, y, z, deadband):
    planar_mag = math.hypot(x, z)
    if planar_mag < deadband:
        planar = "CENTER"
    elif abs(x) >= abs(z):
        planar = "+X" if x >= 0.0 else "-X"
    else:
        planar = "+Z" if z >= 0.0 else "-Z"

    if abs(y) < deadband:
        elev = "PLANE"
    else:
        elev = "+Y" if y >= 0.0 else "-Y"
    return planar, elev


def normalize3(x, y, z):
    norm = math.sqrt((x * x) + (y * y) + (z * z))
    if norm <= 1e-9:
        return 0.0, 0.0, 1.0
    return x / norm, y / norm, z / norm


def project_direction(dir_x, dir_y, dir_z, sphere_xyz, mode, target_distance_m, plane_y_m):
    if mode == "unit":
        return {
            "x": float(dir_x),
            "y": float(dir_y),
            "z": float(dir_z),
            "projection_mode": "unit",
            "projection_valid": True,
            "projection_distance_m": 1.0,
        }

    if mode == "plane-y":
        if abs(dir_y) > 1e-6:
            t = float(plane_y_m) / float(dir_y)
            if t > 0.0:
                return {
                    "x": float(t * dir_x),
                    "y": float(plane_y_m),
                    "z": float(t * dir_z),
                    "projection_mode": "plane-y",
                    "projection_valid": True,
                    "projection_distance_m": float(t),
                }

        x, y, z = sphere_xyz
        return {
            "x": float(x),
            "y": float(y),
            "z": float(z),
            "projection_mode": "sphere-fallback",
            "projection_valid": False,
            "projection_distance_m": float(target_distance_m),
        }

    x, y, z = sphere_xyz
    return {
        "x": float(x),
        "y": float(y),
        "z": float(z),
        "projection_mode": "sphere",
        "projection_valid": True,
        "projection_distance_m": float(target_distance_m),
    }


def led_ring_from_azimuth(az_deg, led_count, az_offset_deg):
    if led_count <= 0:
        return None
    step_deg = 360.0 / float(led_count)
    az_shifted = (float(az_deg) + float(az_offset_deg)) % 360.0
    pos = az_shifted / step_deg
    center = int(round(pos)) % int(led_count)
    frac = pos - math.floor(pos)
    right = (center + 1) % int(led_count)
    left = (center - 1) % int(led_count)
    center_w = max(0.0, 1.0 - min(frac, 1.0 - frac) * 2.0)
    return {
        "count": int(led_count),
        "index": int(center),
        "left_index": int(left),
        "right_index": int(right),
        "center_weight": float(center_w),
        "side_weight": float(0.5 * (1.0 - center_w)),
        "step_deg": float(step_deg),
    }


def build_parser():
    p = argparse.ArgumentParser(
        description="ReSpeaker streamer: true 3D DOA from raw mics (GCC-PHAT + geometry)."
    )
    p.add_argument("--list-devices", action="store_true")
    p.add_argument(
        "--array-preset",
        default="xvf3800-usb-6ch",
        choices=sorted(ARRAY_PRESETS.keys()),
        help="USB channel map and dtype (see respeaker_config.ARRAY_PRESETS)",
    )
    p.add_argument("--fs", type=int, default=16000)
    p.add_argument("--channels", type=int, default=None, help="capture channels; default from preset")
    p.add_argument("--device", type=int, default=None, help="sounddevice input index; default auto-detect")
    p.add_argument(
        "--mic-channels",
        default=None,
        help="comma-separated indices of raw mics for energy gating; default from preset",
    )
    p.add_argument(
        "--dtype",
        choices=("int16", "int32", "float32"),
        default=None,
        help="sample format; default from preset",
    )
    p.add_argument(
        "--gate-mode",
        choices=("mean", "median", "max"),
        default="mean",
        help="how to combine per-mic energies for gating",
    )
    p.add_argument("--frame-ms", type=int, default=100)
    p.add_argument(
        "--doa-source",
        choices=("hybrid-3d", "srp3d", "firmware-azimuth"),
        default="hybrid-3d",
        help="hybrid-3d: firmware azimuth + SRP elevation (recommended), srp3d, or firmware azimuth-only fallback",
    )
    p.add_argument(
        "--voice-sensitive",
        action="store_true",
        help="lower energy gates and faster tracking defaults",
    )
    p.add_argument("--target-distance-m", type=float, default=1.2)
    p.add_argument(
        "--output-az-offset-deg",
        type=float,
        default=None,
        help="yaw added to exported azimuth (default: from preset, usually 0 for XVF3800)",
    )
    p.add_argument(
        "--projection-mode",
        choices=("sphere", "plane-y", "unit"),
        default="sphere",
        help="DOA ray to output x/y/z",
    )
    p.add_argument("--projection-plane-y-m", type=float, default=1.5)
    p.add_argument("--smooth-alpha", type=float, default=0.28, help="higher = faster turn response")
    p.add_argument("--lock-alpha", type=float, default=0.30, help="higher = faster lock updates")
    p.add_argument("--doa-quality-threshold", type=float, default=0.15)
    p.add_argument("--energy-threshold", type=float, default=80.0)
    p.add_argument("--energy-update-threshold", type=float, default=120.0)
    p.add_argument("--noise-alpha", type=float, default=0.97)
    p.add_argument("--snr-speech-ratio", type=float, default=1.4)
    p.add_argument("--snr-speech-add", type=float, default=20.0)
    p.add_argument("--snr-update-ratio", type=float, default=1.7)
    p.add_argument("--snr-update-add", type=float, default=30.0)
    p.add_argument("--min-speech-frames", type=int, default=2)
    p.add_argument("--min-update-frames", type=int, default=1)
    p.add_argument("--speech-hold-ms", type=int, default=160)
    p.add_argument("--update-hz", type=float, default=18.0, help="max DOA JSON rate sent to UI")
    p.add_argument("--always-estimate", action="store_true", help="bypass energy gating (debug)")
    p.add_argument("--idle-log-hz", type=float, default=1.0)
    p.add_argument(
        "--disable-jump-reject",
        action="store_true",
        help="allow large azimuth jumps (less sticky tracking)",
    )
    p.add_argument(
        "--xyz-jsonl",
        default="doa_xyz_frames.jsonl",
        help="append JSONL for ws_jsonl_bridge (use empty string to disable file output)",
    )
    p.add_argument("--xyz-minimal", action="store_true")
    p.add_argument("--axis-check", action="store_true")
    p.add_argument("--axis-deadband-m", type=float, default=0.03)
    p.add_argument("--flip-y-output", action="store_true", help="optional legacy compatibility; keep off for correct 3D")
    p.add_argument("--led-count", type=int, default=12)
    p.add_argument("--led-az-offset-deg", type=float, default=0.0)
    p.add_argument("--xvf-host", default=None, help="path to xvf_host (else PATH or XVF_HOST)")
    p.add_argument("--speed-of-sound", type=float, default=343.0)
    p.add_argument(
        "--max-elevation-deg",
        type=float,
        default=35.0,
        help="Clamp 3D elevation for planar arrays (improves stability)",
    )
    p.add_argument(
        "--strict-mic-geometry",
        action="store_true",
        help="require AEC_MIC_ARRAY_GEO from firmware (default: use approximate layout if missing)",
    )
    p.add_argument(
        "--fw-az-poll-s",
        type=float,
        default=0.08,
        help="hybrid-3d: minimum seconds between firmware azimuth reads (reduces jitter)",
    )
    p.add_argument(
        "--dir-smooth-alpha",
        type=float,
        default=0.32,
        help="blend each frame toward new unit direction 0..1 (lower = steadier dot)",
    )
    p.add_argument(
        "--dir-deadband-deg",
        type=float,
        default=0.35,
        help="ignore tiny direction changes below this angle",
    )
    p.add_argument(
        "--dir-max-step-deg",
        type=float,
        default=40.0,
        help="cap per-frame direction change to this angle",
    )
    p.add_argument(
        "--mirror-lr-output",
        action="store_true",
        help="negate exported X / dir_x so left-right matches your camera view",
    )
    p.add_argument(
        "--no-force-positive-y",
        dest="force_positive_y",
        action="store_false",
        help="allow negative dir_y in exports (default: mirror across horizontal plane so dir_y >= 0)",
    )
    p.add_argument(
        "--dump-firmware-geometry",
        action="store_true",
        help="print AEC_MIC_ARRAY_GEO JSON and exit",
    )
    p.set_defaults(force_positive_y=True)
    return p


def main():
    args = build_parser().parse_args()

    if args.voice_sensitive:
        voice_sensitive_overrides = {
            "frame_ms": (100, 80),
            "smooth_alpha": (0.28, 0.42),
            "lock_alpha": (0.30, 0.45),
            "dir_smooth_alpha": (0.32, 0.45),
            "fw_az_poll_s": (0.08, 0.06),
            "dir_deadband_deg": (0.35, 0.15),
            "dir_max_step_deg": (40.0, 70.0),
            "doa_quality_threshold": (0.15, 0.08),
            "energy_threshold": (80.0, 20.0),
            "energy_update_threshold": (120.0, 45.0),
            "snr_speech_ratio": (1.4, 1.05),
            "snr_speech_add": (20.0, 4.0),
            "snr_update_ratio": (1.7, 1.10),
            "snr_update_add": (30.0, 6.0),
            "min_speech_frames": (2, 1),
            "speech_hold_ms": (160, 80),
            "update_hz": (18.0, 22.0),
        }
        for key, (default_v, tuned_v) in voice_sensitive_overrides.items():
            if getattr(args, key) == default_v:
                setattr(args, key, tuned_v)

    if args.list_devices:
        print(sd.query_devices())
        return

    if args.dump_firmware_geometry:
        from firmware_geometry import fetch_mic_xyz_from_xvf3800, find_xvf_host_executable

        exe = find_xvf_host_executable(args.xvf_host)
        xyz = fetch_mic_xyz_from_xvf3800(args.xvf_host)
        print(
            json.dumps(
                {
                    "type": "firmware_geometry_dump",
                    "xvf_host": exe,
                    "AEC_MIC_ARRAY_GEO_m": None if xyz is None else xyz.reshape(-1).tolist(),
                    "mic0_to_mic3_xyz_m": None if xyz is None else xyz.tolist(),
                },
                indent=2,
            ),
            flush=True,
        )
        return

    args.channels, args.mic_channels, args.dtype = resolve_preset_args(
        args.array_preset,
        args.channels,
        args.mic_channels,
        args.dtype,
    )
    idx = [int(s.strip()) for s in str(args.mic_channels).split(",") if s.strip()]

    if args.output_az_offset_deg is None:
        args.output_az_offset_deg = float(ARRAY_PRESETS[args.array_preset].get("output_az_offset_deg", 0.0))
    else:
        args.output_az_offset_deg = float(args.output_az_offset_deg)

    from firmware_geometry import fetch_firmware_doa_azimuth_deg, fetch_mic_xyz_from_xvf3800, find_xvf_host_executable

    has_xvf_host = bool(find_xvf_host_executable(args.xvf_host))
    mic_xyz = None
    mic_geometry_source = None
    if args.array_preset == "xvf3800-usb-6ch":
        if not has_xvf_host:
            raise RuntimeError(
                "xvf_host not found. Install from reSpeaker_XVF3800_USB_4MIC_ARRAY/host_control "
                "or copy xvf_host.exe to soundorb/tools/, or set PATH / env XVF_HOST / --xvf-host"
            )
        mic_xyz = fetch_mic_xyz_from_xvf3800(args.xvf_host, timeout_s=5.0)
        if mic_xyz is not None:
            mic_geometry_source = "firmware"
        elif args.strict_mic_geometry:
            raise RuntimeError("xvf_host is available, but AEC_MIC_ARRAY_GEO could not be read from firmware.")
        else:
            mic_xyz = default_xvf3800_mic_xyz_m()
            mic_geometry_source = "fallback_xz_square"
    elif args.doa_source == "firmware-azimuth":
        raise RuntimeError("--doa-source firmware-azimuth requires --array-preset xvf3800-usb-6ch")

    fetch_fw_doa = fetch_firmware_doa_azimuth_deg if has_xvf_host else None

    device = args.device
    if device is None:
        device = pick_respeaker_device(args.channels)
    if device is None:
        raise RuntimeError("No ReSpeaker input device found. Use --list-devices and pass --device.")

    if len(idx) < 4:
        raise ValueError("--mic-channels must list at least 4 indices for energy gating")

    q = queue.Queue(maxsize=16)
    _jsonl_path = (args.xyz_jsonl or "").strip()
    xyz_log_fp = open(_jsonl_path, "a", encoding="utf-8") if _jsonl_path else None
    frame_index = 0

    def cb(indata, frames, time_info, status):
        if not q.full():
            q.put_nowait(indata.copy())

    sm_az = sm_el = locked_az = locked_el = None
    sm_dir = None
    last_fw_poll_s = 0.0
    cached_fw_az = None
    cached_fw_sp = None
    hold = 0
    hold_frames = max(0, int(round(args.speech_hold_ms / max(args.frame_ms, 1))))
    last_send = last_idle = 0.0
    min_period = 1.0 / max(args.update_hz, 1e-6)
    last_conf = 0.0
    noise_e = None
    speech_count = update_count = 0

    print(
        json.dumps(
            {
                "type": "status",
                "array_preset": str(args.array_preset),
                "array_preset_label": str(ARRAY_PRESETS[args.array_preset].get("label", "")),
                "doa_source": str(args.doa_source),
                "device_index": int(device),
                "device_name": sd.query_devices(device)["name"],
                "fs": int(args.fs),
                "channels": int(args.channels),
                "dtype": str(args.dtype),
                "mic_channels": idx,
                "gate_mode": args.gate_mode,
                "voice_sensitive": bool(args.voice_sensitive),
                "always_estimate": bool(args.always_estimate),
                "flip_y_output": bool(args.flip_y_output),
                "output_az_offset_deg": float(args.output_az_offset_deg),
                "projection_mode": str(args.projection_mode),
                "projection_plane_y_m": float(args.projection_plane_y_m),
                "disable_jump_reject": bool(args.disable_jump_reject),
                "xyz_jsonl": _jsonl_path if _jsonl_path else None,
                "mic_geometry_source": mic_geometry_source,
                "fw_az_poll_s": float(args.fw_az_poll_s),
                "dir_smooth_alpha": float(args.dir_smooth_alpha),
                "dir_deadband_deg": float(args.dir_deadband_deg),
                "dir_max_step_deg": float(args.dir_max_step_deg),
                "mirror_lr_output": bool(args.mirror_lr_output),
                "force_positive_y": bool(args.force_positive_y),
            }
        ),
        flush=True,
    )

    try:
        with sd.InputStream(
            device=device,
            samplerate=args.fs,
            channels=args.channels,
            dtype=args.dtype,
            blocksize=int(args.fs * args.frame_ms / 1000),
            callback=cb,
        ):
            while True:
                frame = q.get()
                per_mic_energy = per_mic_energy_from_frame(frame, idx, args.dtype)
                energy = aggregate_energy(per_mic_energy, args.gate_mode)

                if noise_e is None:
                    noise_e = energy
                speech_gate_e = max(
                    float(args.energy_threshold),
                    float(noise_e) * float(args.snr_speech_ratio) + float(args.snr_speech_add),
                )
                speech_raw = (energy >= speech_gate_e) or bool(args.always_estimate)
                speech_count = speech_count + 1 if speech_raw else 0
                speech_active = speech_count >= max(1, int(args.min_speech_frames))

                prev_hold = hold
                hold = hold_frames if speech_active else max(hold - 1, 0)
                if prev_hold > 0 and hold == 0:
                    locked_az = locked_el = sm_az = sm_el = None
                    sm_dir = None
                    cached_fw_az = cached_fw_sp = None
                    last_fw_poll_s = 0.0
                    last_conf = 0.0
                    speech_count = update_count = 0

                if hold == 0:
                    na = float(args.noise_alpha)
                    noise_e = na * float(noise_e) + (1.0 - na) * energy
                    now = time.time()
                    idle_period = 1.0 / max(float(args.idle_log_hz), 1e-6)
                    if now - last_idle >= idle_period:
                        print(
                            json.dumps(
                                {
                                    "type": "idle",
                                    "timestamp": now,
                                    "energy": float(energy),
                                    "per_mic_energy": [float(v) for v in per_mic_energy],
                                    "noise_energy": float(noise_e),
                                    "speech_gate_energy": float(speech_gate_e),
                                }
                            ),
                            flush=True,
                        )
                        last_idle = now
                    continue

                update_gate_e = max(
                    float(args.energy_update_threshold),
                    float(noise_e) * float(args.snr_update_ratio) + float(args.snr_update_add),
                )
                update_raw = (energy >= update_gate_e) or bool(args.always_estimate)
                update_count = update_count + 1 if update_raw else 0
                update_active = update_count >= max(1, int(args.min_update_frames))

                if update_active:
                    if args.doa_source in ("srp3d", "hybrid-3d"):
                        frame_mics = to_float_mics(frame, idx, args.dtype)
                        est = estimate_direction_3d(
                            frame_mics=frame_mics,
                            mic_xyz_m=mic_xyz,
                            fs_hz=float(args.fs),
                            speed_of_sound=float(args.speed_of_sound),
                        )
                        if est is not None:
                            dx, dy, dz, conf = est
                            # Keep solver Y as world-up convention (no UI flips by default).
                            dy_world = float(dy)
                            az_srp = math.degrees(math.atan2(dx, dz))
                            el = math.degrees(math.atan2(dy_world, max(1e-12, math.hypot(dx, dz))))
                            max_el = max(1.0, float(args.max_elevation_deg))
                            el = max(-max_el, min(max_el, el))
                            az = float(az_srp)
                            if args.doa_source == "hybrid-3d" and fetch_fw_doa is not None:
                                now_fw = time.time()
                                poll = max(0.05, float(args.fw_az_poll_s))
                                if now_fw - last_fw_poll_s >= poll:
                                    last_fw_poll_s = now_fw
                                    az_fw, sp_fw, _ = fetch_fw_doa(args.xvf_host, timeout_s=1.25)
                                    if az_fw is not None:
                                        cached_fw_az = wrap(float(az_fw))
                                        cached_fw_sp = sp_fw
                                if cached_fw_az is not None:
                                    az = float(cached_fw_az)
                                    if cached_fw_sp is not None and int(cached_fw_sp) == 1:
                                        conf = max(float(conf), 0.78)
                            quality_ok = (conf >= args.doa_quality_threshold) or bool(args.always_estimate)
                            if quality_ok and (not args.disable_jump_reject) and locked_az is not None:
                                az_jump = abs(cdelta(locked_az, az))
                                el_jump = abs(float(el) - float(locked_el if locked_el is not None else el))
                                if (az_jump > 45.0 or el_jump > 22.0) and float(conf) < 0.65:
                                    quality_ok = False
                            if quality_ok:
                                if locked_az is None or locked_el is None:
                                    locked_az, locked_el = az, el
                                else:
                                    locked_az = cblend(locked_az, az, args.lock_alpha)
                                    locked_el = lblend(float(locked_el), el, args.lock_alpha)
                                last_conf = float(conf)
                    elif fetch_fw_doa is not None:
                        az_fw, sp_fw, _ = fetch_fw_doa(args.xvf_host, timeout_s=1.25)
                        if az_fw is not None:
                            az = wrap(float(az_fw))
                            el = 0.0
                            if sp_fw is not None and int(sp_fw) == 1:
                                conf = 0.88
                            elif sp_fw is not None and int(sp_fw) == 0:
                                conf = 0.42
                            else:
                                conf = 0.72
                            quality_ok = (conf >= args.doa_quality_threshold) or bool(args.always_estimate)
                            if quality_ok:
                                if locked_az is None or locked_el is None:
                                    locked_az, locked_el = az, el
                                else:
                                    locked_az = cblend(locked_az, az, args.lock_alpha)
                                    locked_el = lblend(float(locked_el), el, args.lock_alpha)
                                last_conf = float(conf)

                if sm_az is None:
                    if locked_az is not None and locked_el is not None:
                        sm_az, sm_el = locked_az, locked_el
                elif locked_az is not None and locked_el is not None:
                    sm_az = cblend(sm_az, locked_az, args.smooth_alpha)
                    sm_el = lblend(float(sm_el), float(locked_el), args.smooth_alpha)

                if sm_az is None or sm_el is None:
                    continue

                eff_el = float(sm_el)
                el_r = math.radians(eff_el)
                # Offset is applied once after direction smoothing (see out_az below).
                out_az_r = math.radians(float(sm_az))
                dist = float(args.target_distance_m)
                horiz = dist * math.cos(el_r)
                x = float(horiz * math.sin(out_az_r))
                y = float(dist * math.sin(el_r))
                z = float(horiz * math.cos(out_az_r))
                y_out = -y if args.flip_y_output else y
                dir_x, dir_y, dir_z = normalize3(x, y_out, z)

                d = np.array([dir_x, dir_y, dir_z], dtype=np.float64)
                dn = float(np.linalg.norm(d))
                if dn > 1e-12:
                    d = d / dn
                blend = max(0.0, min(1.0, float(args.dir_smooth_alpha)))
                deadband_rad = math.radians(max(0.0, float(args.dir_deadband_deg)))
                max_step_rad = math.radians(max(0.1, float(args.dir_max_step_deg)))
                if sm_dir is None:
                    sm_dir = d.copy()
                else:
                    dot = float(np.clip(np.dot(sm_dir, d), -1.0, 1.0))
                    ang = float(math.acos(dot))
                    if ang > deadband_rad:
                        eff_blend = blend
                        if ang > 1e-6:
                            eff_blend = min(eff_blend, max_step_rad / ang)
                        if eff_blend > 0.0:
                            sm_dir = sm_dir * (1.0 - eff_blend) + d * eff_blend
                            dn2 = float(np.linalg.norm(sm_dir))
                            if dn2 > 1e-12:
                                sm_dir = sm_dir / dn2
                dir_x, dir_y, dir_z = float(sm_dir[0]), float(sm_dir[1]), float(sm_dir[2])
                if args.mirror_lr_output:
                    dir_x = -dir_x
                if args.force_positive_y and dir_y < 0:
                    dir_y = -dir_y

                x = dir_x * dist
                y_out = dir_y * dist
                z = dir_z * dist
                out_az = wrap(math.degrees(math.atan2(dir_x, dir_z)) + float(args.output_az_offset_deg))
                eff_el = math.degrees(math.atan2(dir_y, math.hypot(dir_x, dir_z)))
                el_out = -eff_el if args.flip_y_output else eff_el

                proj = project_direction(
                    dir_x=dir_x,
                    dir_y=dir_y,
                    dir_z=dir_z,
                    sphere_xyz=(x, y_out, z),
                    mode=args.projection_mode,
                    target_distance_m=float(args.target_distance_m),
                    plane_y_m=float(args.projection_plane_y_m),
                )
                out_x, out_y, out_z = float(proj["x"]), float(proj["y"]), float(proj["z"])

                now = time.time()
                frame_index += 1
                led_az = float(out_az)
                if args.doa_source == "hybrid-3d" and cached_fw_az is not None:
                    # Let LED ring follow firmware azimuth immediately for faster perceived response.
                    led_az = wrap(float(cached_fw_az) + float(args.output_az_offset_deg))
                led_ring = led_ring_from_azimuth(float(led_az), int(args.led_count), float(args.led_az_offset_deg))
                if xyz_log_fp is not None:
                    if args.xyz_minimal:
                        xyz_rec = {
                            "type": "xyz_frame",
                            "x": out_x,
                            "y": out_y,
                            "z": out_z,
                            "dir_x": float(dir_x),
                            "dir_y": float(dir_y),
                            "dir_z": float(dir_z),
                            "projection_mode": str(proj["projection_mode"]),
                            "projection_valid": bool(proj["projection_valid"]),
                            "volume": float(energy),
                        }
                    else:
                        xyz_rec = {
                            "type": "xyz_frame",
                            "frame_index": int(frame_index),
                            "timestamp": now,
                            "x": out_x,
                            "y": out_y,
                            "z": out_z,
                            "dir_x": float(dir_x),
                            "dir_y": float(dir_y),
                            "dir_z": float(dir_z),
                            "azimuth_deg_raw": float(sm_az),
                            "azimuth_deg": float(out_az),
                            "elevation_deg": float(el_out),
                            "confidence": float(last_conf),
                            "energy": float(energy),
                            "projection_mode_requested": str(args.projection_mode),
                            "projection_mode": str(proj["projection_mode"]),
                            "projection_valid": bool(proj["projection_valid"]),
                            "projection_distance_m": float(proj["projection_distance_m"]),
                        }
                    if led_ring is not None:
                        xyz_rec["led_ring"] = led_ring
                    xyz_log_fp.write(json.dumps(xyz_rec) + "\n")
                    xyz_log_fp.flush()

                if now - last_send < min_period:
                    continue

                payload = {
                    "type": "doa",
                    "timestamp": now,
                    "azimuth_deg_raw": float(sm_az),
                    "azimuth_deg": float(out_az),
                    "elevation_deg": float(el_out),
                    "confidence": float(last_conf),
                    "x": out_x,
                    "y": out_y,
                    "z": out_z,
                    "dir_x": float(dir_x),
                    "dir_y": float(dir_y),
                    "dir_z": float(dir_z),
                    "energy": float(energy),
                    "per_mic_energy": [float(v) for v in per_mic_energy],
                    "noise_energy": float(noise_e),
                    "speech_gate_energy": float(speech_gate_e),
                    "update_gate_energy": float(update_gate_e),
                    "speech_active": bool(speech_active),
                    "update_active": bool(update_active),
                    "projection_mode_requested": str(args.projection_mode),
                    "projection_mode": str(proj["projection_mode"]),
                    "projection_valid": bool(proj["projection_valid"]),
                    "projection_distance_m": float(proj["projection_distance_m"]),
                }
                if led_ring is not None:
                    payload["led_ring"] = led_ring
                if args.axis_check:
                    planar_axis, elevation_axis = axis_labels(out_x, out_y, out_z, float(args.axis_deadband_m))
                    payload["axis_planar"] = planar_axis
                    payload["axis_elevation"] = elevation_axis
                print(json.dumps(payload), flush=True)
                last_send = now
    finally:
        if xyz_log_fp is not None:
            xyz_log_fp.close()


if __name__ == "__main__":
    main()
