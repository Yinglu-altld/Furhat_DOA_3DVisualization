import argparse
import json
import math
import queue
import time

import numpy as np
import sounddevice as sd

from loc_srp_phat import SRPPhatDOA3D

MIC_XYZ = np.array([
    [ 0.028, 0.0,  0.0],   # mic1 +X
    [ 0.0,   0.0, -0.028], # mic2 -Z
    [-0.028, 0.0,  0.0],   # mic3 -X
    [ 0.0,   0.0,  0.028], # mic4 +Z
], dtype=np.float64
)

def wrap(a):
    return ((a + 180.0) % 360.0) - 180.0


def cdelta(a, b):
    return wrap(b - a)


def cblend(a, b, alpha):
    return wrap(a + alpha * cdelta(a, b))


def lblend(a, b, alpha):
    return a + alpha * (b - a)


def pick_respeaker_device(min_channels):
    for i, d in enumerate(sd.query_devices()):
        if "ReSpeaker" in d["name"] and int(d["max_input_channels"]) >= min_channels:
            return i
    return None


def aggregate_energy(per_mic_energy, mode):
    if mode == "median":
        return float(np.median(per_mic_energy))
    if mode == "max":
        return float(np.max(per_mic_energy))
    return float(np.mean(per_mic_energy))


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


def build_parser():
    p = argparse.ArgumentParser(description="ReSpeaker-only 3D SRP-PHAT DOA streamer (energy/SNR gated)")
    p.add_argument("--list-devices", action="store_true")
    p.add_argument("--fs", type=int, default=16000)
    p.add_argument("--channels", type=int, default=6)
    p.add_argument("--device", type=int, default=None, help="sounddevice input device index; default auto-detect ReSpeaker")
    p.add_argument(
        "--mic-channels",
        default="3,4,1,2",
        help="0-based indices of raw mics in capture stream (default tuned for this tabletop setup)",
    )
    p.add_argument(
        "--gate-mode",
        choices=("mean", "median", "max"),
        default="mean",
        help="how to combine per-mic energies for gating",
    )
    p.add_argument("--frame-ms", type=int, default=100)
    p.add_argument("--srp-az-step-deg", type=float, default=2.0)
    p.add_argument("--srp-el-min-deg", type=float, default=0.0)
    p.add_argument("--srp-el-max-deg", type=float, default=70.0)
    p.add_argument("--srp-el-step-deg", type=float, default=5.0)
    p.add_argument("--srp-interp", type=int, default=4)
    p.add_argument("--srp-f-low-hz", type=float, default=300.0)
    p.add_argument("--srp-f-high-hz", type=float, default=3400.0)
    p.add_argument("--target-distance-m", type=float, default=1.2)
    p.add_argument("--smooth-alpha", type=float, default=0.30)
    p.add_argument("--lock-alpha", type=float, default=0.30)
    p.add_argument("--doa-quality-threshold", type=float, default=0.15)
    p.add_argument("--energy-threshold", type=float, default=80.0)
    p.add_argument("--energy-update-threshold", type=float, default=120.0)
    p.add_argument("--noise-alpha", type=float, default=0.97, help="EMA factor for idle noise floor estimate")
    p.add_argument("--snr-speech-ratio", type=float, default=1.4)
    p.add_argument("--snr-speech-add", type=float, default=20.0)
    p.add_argument("--snr-update-ratio", type=float, default=1.7)
    p.add_argument("--snr-update-add", type=float, default=30.0)
    p.add_argument("--min-speech-frames", type=int, default=2)
    p.add_argument("--min-update-frames", type=int, default=1)
    p.add_argument("--speech-hold-ms", type=int, default=160)
    p.add_argument("--update-hz", type=float, default=10.0)
    p.add_argument("--always-estimate", action="store_true", help="debug mode: bypass energy/SNR gating")
    p.add_argument("--idle-log-hz", type=float, default=1.0, help="idle diagnostics rate in Hz")
    p.add_argument(
        "--xyz-jsonl",
        default=None,
        help="optional path to write per-frame x/y/z records as JSON Lines",
    )
    p.add_argument(
        "--xyz-minimal",
        action="store_true",
        help="when set, write only x/y/z/confidence fields to --xyz-jsonl",
    )
    p.add_argument(
        "--axis-check",
        action="store_true",
        help="append axis labels (+X/-X/+Z/-Z and +Y/-Y) to each DOA output frame",
    )
    p.add_argument(
        "--axis-deadband-m",
        type=float,
        default=0.03,
        help="deadband (meters at target sphere radius) for axis label stabilization",
    )
    p.add_argument(
        "--flip-y-output",
        action="store_true",
        help="flip output Y and elevation sign for UI/body-frame convention",
    )
    return p


def main():
    args = build_parser().parse_args()

    if args.list_devices:
        print(sd.query_devices())
        return

    device = args.device
    if device is None:
        device = pick_respeaker_device(args.channels)
    if device is None:
        raise RuntimeError("No ReSpeaker input device found. Use --list-devices and pass --device.")

    idx = [int(s.strip()) for s in args.mic_channels.split(",") if s.strip()]
    if len(idx) < 4:
        raise ValueError("--mic-channels must provide at least 4 channels")

    srp = SRPPhatDOA3D(
        MIC_XYZ,
        fs=args.fs,
        az_step_deg=args.srp_az_step_deg,
        el_min_deg=args.srp_el_min_deg,
        el_max_deg=args.srp_el_max_deg,
        el_step_deg=args.srp_el_step_deg,
        interp=args.srp_interp,
        f_low_hz=args.srp_f_low_hz,
        f_high_hz=args.srp_f_high_hz,
    )

    q = queue.Queue(maxsize=16)
    xyz_log_fp = open(args.xyz_jsonl, "a", encoding="utf-8") if args.xyz_jsonl else None
    frame_index = 0

    def cb(indata, frames, time_info, status):
        if not q.full():
            q.put_nowait(indata.copy())

    sm_az = None
    sm_el = None
    locked_az = None
    locked_el = None
    hold = 0
    hold_frames = max(0, int(round(args.speech_hold_ms / max(args.frame_ms, 1))))
    last_send = 0.0
    last_idle = 0.0
    min_period = 1.0 / max(args.update_hz, 1e-6)
    last_conf = 0.0
    noise_e = None
    speech_count = 0
    update_count = 0

    print(
        json.dumps(
            {
                "type": "status",
                "device_index": int(device),
                "device_name": sd.query_devices(device)["name"],
                "fs": int(args.fs),
                "channels": int(args.channels),
                "mic_channels": idx,
                "gate_mode": args.gate_mode,
                "always_estimate": bool(args.always_estimate),
                "flip_y_output": bool(args.flip_y_output),
            }
        ),
        flush=True,
    )

    try:
        with sd.InputStream(
            device=device,
            samplerate=args.fs,
            channels=args.channels,
            dtype="int16",
            blocksize=int(args.fs * args.frame_ms / 1000),
            callback=cb,
        ):
            while True:
                frame = q.get()
                mics_i16 = frame[:, idx]
                mics = mics_i16.astype(np.float32)
                per_mic_energy = np.mean(np.abs(mics_i16), axis=0)
                energy = aggregate_energy(per_mic_energy, args.gate_mode)

                if noise_e is None:
                    noise_e = energy
                speech_gate_e = max(
                    float(args.energy_threshold),
                    float(noise_e) * float(args.snr_speech_ratio) + float(args.snr_speech_add),
                )
                speech_raw = (energy >= speech_gate_e) or bool(args.always_estimate)
                if speech_raw:
                    speech_count += 1
                else:
                    speech_count = 0
                speech_active = speech_count >= max(1, int(args.min_speech_frames))

                prev_hold = hold
                hold = hold_frames if speech_active else max(hold - 1, 0)
                if prev_hold > 0 and hold == 0:
                    locked_az = None
                    locked_el = None
                    sm_az = None
                    sm_el = None
                    speech_count = 0
                    update_count = 0
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

                doa_az = float("nan")
                doa_el = float("nan")
                conf = 0.0
                update_gate_e = max(
                    float(args.energy_update_threshold),
                    float(noise_e) * float(args.snr_update_ratio) + float(args.snr_update_add),
                )
                update_raw = (energy >= update_gate_e) or bool(args.always_estimate)
                if update_raw:
                    update_count += 1
                else:
                    update_count = 0
                update_active = update_count >= max(1, int(args.min_update_frames))

                if update_active:
                    out = srp.estimate(mics)
                    if out is not None:
                        doa_az, doa_el, conf = out
                        quality_ok = (conf >= args.doa_quality_threshold) or bool(args.always_estimate)
                        if quality_ok:
                            az = wrap(float(doa_az))
                            el = float(doa_el)
                            # Reject implausibly large direction jumps unless the SRP peak is strong.
                            if locked_az is not None and locked_el is not None:
                                az_jump = abs(cdelta(locked_az, az))
                                el_jump = abs(el - float(locked_el))
                                if (az_jump > 30.0 or el_jump > 20.0) and float(conf) < 0.25:
                                    quality_ok = False
                        if quality_ok:
                            if locked_az is None or locked_el is None:
                                locked_az = az
                                locked_el = el
                            else:
                                locked_az = cblend(locked_az, az, args.lock_alpha)
                                locked_el = lblend(float(locked_el), el, args.lock_alpha)
                            last_conf = float(conf)

                if sm_az is None:
                    if locked_az is not None and locked_el is not None:
                        sm_az = locked_az
                        sm_el = locked_el
                elif locked_az is not None and locked_el is not None:
                    sm_az = cblend(sm_az, locked_az, args.smooth_alpha)
                    sm_el = lblend(float(sm_el), float(locked_el), args.smooth_alpha)

                if sm_az is None or sm_el is None:
                    continue

                az_r = math.radians(float(sm_az))
                el_r = math.radians(float(sm_el))
                horiz = float(args.target_distance_m) * math.cos(el_r)
                # Output in Y-up world frame:
                # X,Z are planar and Y is elevation.
                x = float(horiz * math.sin(az_r))
                y = float(float(args.target_distance_m) * math.sin(el_r))
                z = float(horiz * math.cos(az_r))
                y_out = -y if args.flip_y_output else y
                el_out = -float(sm_el) if args.flip_y_output else float(sm_el)

                now = time.time()
                frame_index += 1
                if xyz_log_fp is not None:
                    if args.xyz_minimal:
                        xyz_rec = {
                            "x": x,
                            "y": y_out,
                            "z": z,
                        }
                    else:
                        xyz_rec = {
                            "type": "xyz_frame",
                            "frame_index": int(frame_index),
                            "timestamp": now,
                            "x": x,
                            "y": y_out,
                            "z": z,
                            "azimuth_deg": float(sm_az),
                            "elevation_deg": float(el_out),
                            "energy": float(energy),
                        }
                    xyz_log_fp.write(json.dumps(xyz_rec) + "\n")
                    xyz_log_fp.flush()

                if now - last_send < min_period:
                    continue

                payload = {
                    "type": "doa",
                    "timestamp": now,
                    "azimuth_deg": float(sm_az),
                    "elevation_deg": float(el_out),
                    "confidence": float(last_conf),
                    "x": x,
                    "y": y_out,
                    "z": z,
                    "energy": float(energy),
                    "per_mic_energy": [float(v) for v in per_mic_energy],
                    "noise_energy": float(noise_e),
                    "speech_gate_energy": float(speech_gate_e),
                    "update_gate_energy": float(update_gate_e),
                    "speech_active": bool(speech_active),
                    "update_active": bool(update_active),
                }
                if args.axis_check:
                    planar_axis, elevation_axis = axis_labels(x, y_out, z, float(args.axis_deadband_m))
                    payload["axis_planar"] = planar_axis
                    payload["axis_elevation"] = elevation_axis
                print(json.dumps(payload), flush=True)
                last_send = now
    finally:
        if xyz_log_fp is not None:
            xyz_log_fp.close()


if __name__ == "__main__":
    main()
