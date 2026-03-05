# SoundOrb DOA Quick Commands

## 1) Test localization (logs live XYZ to JSONL)
```powershell
python doa_respeaker_only.py --device 1 --channels 6 --axis-check --xyz-jsonl doa_xyz_frames.jsonl --xyz-minimal --energy-threshold 35 --energy-update-threshold 50 --snr-speech-ratio 1.1 --snr-speech-add 8 --snr-update-ratio 1.2 --snr-update-add 12 --min-speech-frames 1 --min-update-frames 1 --speech-hold-ms 80 --doa-quality-threshold 0.08
```

## 2) Stream live JSONL values over WebSocket
```powershell
python ws_jsonl_bridge.py --jsonl doa_xyz_frames.jsonl --from-end --host 0.0.0.0 --port 8765
```

## 3) Plot live points in matplotlib
```powershell
python plot_doa_3d.py --jsonl doa_xyz_frames.jsonl --follow --tail 500 --refresh-ms 200
```
