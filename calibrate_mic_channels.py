import argparse
import json
import queue
import time

import numpy as np
import sounddevice as sd


def pick_respeaker_device(min_channels):
    for i, d in enumerate(sd.query_devices()):
        if "ReSpeaker" in d["name"] and int(d["max_input_channels"]) >= min_channels:
            return i
    return None


def build_parser():
    p = argparse.ArgumentParser(
        description="ReSpeaker channel calibration helper: tap near each physical mic and inspect channel spikes."
    )
    p.add_argument("--list-devices", action="store_true")
    p.add_argument("--fs", type=int, default=16000)
    p.add_argument("--channels", type=int, default=6)
    p.add_argument("--device", type=int, default=None, help="sounddevice input device index")
    p.add_argument("--frame-ms", type=int, default=64)
    p.add_argument("--calib-hz", type=float, default=5.0, help="telemetry rate in Hz while idle")
    p.add_argument("--calib-noise-alpha", type=float, default=0.98, help="EMA factor for per-channel noise floor")
    p.add_argument("--calib-peak-ratio", type=float, default=2.5, help="peak/noise ratio to mark an active hit")
    p.add_argument("--calib-top-k", type=int, default=3, help="how many top channels to report each update")
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

    q = queue.Queue(maxsize=16)

    def cb(indata, frames, time_info, status):
        if not q.full():
            q.put_nowait(indata.copy())

    print(
        json.dumps(
            {
                "type": "calib_status",
                "device_index": int(device),
                "device_name": sd.query_devices(device)["name"],
                "fs": int(args.fs),
                "channels": int(args.channels),
                "hint": "Tap one physical mic at a time. Use best_channel/top_channels to map physical mic -> stream channel.",
            }
        ),
        flush=True,
    )

    noise = None
    last_log = 0.0
    min_period = 1.0 / max(float(args.calib_hz), 1e-6)

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
            per_ch_energy = np.mean(np.abs(frame.astype(np.float32)), axis=0)
            if noise is None:
                noise = per_ch_energy.copy()

            ratio = per_ch_energy / (noise + 1e-6)
            best_ch = int(np.argmax(ratio))
            best_ratio = float(ratio[best_ch])
            active = bool(best_ratio >= float(args.calib_peak_ratio))

            if not active:
                na = float(args.calib_noise_alpha)
                noise = na * noise + (1.0 - na) * per_ch_energy

            now = time.time()
            if active or (now - last_log >= min_period):
                top_k = max(1, int(args.calib_top_k))
                ranked = np.argsort(ratio)[::-1][:top_k]
                print(
                    json.dumps(
                        {
                            "type": "calib",
                            "timestamp": now,
                            "best_channel": best_ch,
                            "best_ratio": best_ratio,
                            "active": active,
                            "top_channels": [int(c) for c in ranked],
                            "per_channel_energy": [float(v) for v in per_ch_energy],
                            "per_channel_ratio": [float(v) for v in ratio],
                            "noise_floor": [float(v) for v in noise],
                        }
                    ),
                    flush=True,
                )
                last_log = now


if __name__ == "__main__":
    main()
