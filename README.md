# SoundOrb DOA Quick Commands

## 1) Test localization (logs live XYZ to JSONL)
```powershell
python doa_respeaker_only.py --device 1 --channels 6 --mic-channels 3,4,1,2 --axis-check --xyz-jsonl doa_xyz_frames.jsonl --xyz-minimal --energy-threshold 35 --energy-update-threshold 50 --snr-speech-ratio 1.1 --snr-speech-add 8 --snr-update-ratio 1.2 --snr-update-add 12 --min-speech-frames 1 --min-update-frames 1 --speech-hold-ms 120 --doa-quality-threshold 0.10 --lock-alpha 0.30 --smooth-alpha 0.25 --srp-el-step-deg 2 --update-hz 10
```

## 2) Stream live JSONL values over WebSocket
```powershell
python ws_jsonl_bridge.py --jsonl doa_xyz_frames.jsonl --from-end --host 127.0.0.1 --port 8765
```

## 3) Plot live points in matplotlib
```powershell
python plot_doa_3d.py --jsonl doa_xyz_frames.jsonl --follow --tail 500 --refresh-ms 200
```
------------------------------------------------------------------

OVERALL TESTING OF WHOLE THING
# Terminal A
cd "C:\Users\upill\getting strted\soundorb"
python doa_respeaker_only.py --device 1 --channels 6 --mic-channels 3,4,1,2 --axis-check --xyz-jsonl doa_xyz_frames.jsonl --xyz-minimal --energy-threshold 35 --energy-update-threshold 50 --snr-speech-ratio 1.1 --snr-speech-add 8 --snr-update-ratio 1.2 --snr-update-add 12 --min-speech-frames 1 --min-update-frames 1 --speech-hold-ms 120 --doa-quality-threshold 0.10 --lock-alpha 0.30 --smooth-alpha 0.25 --srp-el-step-deg 2 --update-hz 10


# Terminal B
cd "C:\Users\upill\getting strted\soundorb"
python ws_jsonl_bridge.py --jsonl doa_xyz_frames.jsonl --from-end --host 127.0.0.1 --port 8765

# Terminal C
cd "C:\Users\upill\getting strted\Furhat_DOA_3DVisualization_fresh"
python -m http.server 8080
Open: http://127.0.0.1:8080

Note:
- In `Furhat_DOA_3DVisualization_fresh/app.js`, set:
  `const WS_URL = "ws://127.0.0.1:8765";`
