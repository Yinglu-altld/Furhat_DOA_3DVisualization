# SoundOrb DOA Quick Commands

## 1) Test localization (logs live XYZ to JSONL)
```powershell
python doa_respeaker_only.py --device 1 --channels 6 --mic-channels 3,4,1,2 --axis-check --xyz-jsonl doa_xyz_frames.jsonl --xyz-minimal --energy-threshold 35 --energy-update-threshold 50 --snr-speech-ratio 1.1 --snr-speech-add 8 --snr-update-ratio 1.2 --snr-update-add 12 --min-speech-frames 1 --min-update-frames 1 --speech-hold-ms 120 --doa-quality-threshold 0.10 --lock-alpha 0.30 --smooth-alpha 0.25 --srp-el-step-deg 2 --srp-f-high-hz 3000 --top-cap-cos-threshold 0.20 --update-hz 10
```
`--xyz-minimal` now writes `x/y/z/volume` (volume is derived from live frame energy).
Y output is now soft-clamped by elevation reliability (defaults: `--y-reliable-el-deg 60`, `--y-min-reliability 0.20`).
Quick low-latency speech mode: add `--voice-sensitive` (applies lower gate/faster tracking defaults).

## 2) Stream live JSONL values over WebSocket
```powershell
python ws_jsonl_bridge.py --jsonl doa_xyz_frames.jsonl --from-end --host 0.0.0.0 --port 8765
```

## 3) Plot live points in matplotlib
```powershell
python plot_doa_3d.py --jsonl doa_xyz_frames.jsonl --follow --tail 500 --refresh-ms 200
```
------------------------------------------------------------------

OVERALL TESTING OF WHOLE THING
# Terminal A
cd "C:\Users\upill\getting strted\soundorb"
python doa_respeaker_only.py --device 1 --channels 6 --mic-channels 3,4,1,2 --axis-check --xyz-jsonl doa_xyz_frames.jsonl --xyz-minimal --energy-threshold 35 --energy-update-threshold 50 --snr-speech-ratio 1.1 --snr-speech-add 8 --snr-update-ratio 1.2 --snr-update-add 12 --min-speech-frames 1 --min-update-frames 1 --speech-hold-ms 120 --doa-quality-threshold 0.10 --lock-alpha 0.30 --smooth-alpha 0.25 --srp-el-step-deg 2 --srp-f-high-hz 3000 --top-cap-cos-threshold 0.20 --update-hz 10


# Terminal B
cd "C:\Users\upill\getting strted\soundorb"
python ws_jsonl_bridge.py --jsonl doa_xyz_frames.jsonl --from-end --host 0.0.0.0 --port 8765

# Terminal C
cd "C:\Users\upill\getting strted\Furhat_DOA_3DVisualization_fresh"
python -m http.server 8080
Open: http://127.0.0.1:8080

Note:
- In UI, point WebSocket to your machine IP and port `8765`.
