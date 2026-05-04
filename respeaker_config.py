"""ReSpeaker USB capture defaults: channel count, raw mic indices, sample dtype.

Direction uses on-chip DOA via ``xvf_host`` (see ``doa_respeaker_only.py``), not geometry here.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

ArrayPreset = Dict[str, Any]

ARRAY_PRESETS: Dict[str, ArrayPreset] = {
    "legacy-square-28": {
        "label": "Legacy 6-ch capture: raw indices 3,4,1,2 (int16)",
        "mic_channels": "3,4,1,2",
        "channels": 6,
        "dtype": "int16",
        "output_az_offset_deg": 0.0,
    },
    "usb-xvf3000-6ch": {
        "label": "Seeed USB Mic Array XVF3000, 6-ch: raw ch1–4 (int16)",
        "mic_channels": "1,2,3,4",
        "channels": 6,
        "dtype": "int16",
        "output_az_offset_deg": 0.0,
    },
    "xvf3800-usb-6ch": {
        "label": (
            "ReSpeaker XVF3800, 6-ch: Mic0..3 on ch2–5 (int32). "
            "DOA from firmware (xvf_host); offset 0° aligns with LED ring."
        ),
        "mic_channels": "2,3,4,5",
        "channels": 6,
        "dtype": "int32",
        "output_az_offset_deg": 0.0,
    },
    "raw-4ch": {
        "label": "Four raw channels 0–3 (int16)",
        "mic_channels": "0,1,2,3",
        "channels": 4,
        "dtype": "int16",
        "output_az_offset_deg": 0.0,
    },
}

_DEVICE_KEYWORDS = (
    "respeaker",
    "re speaker",
    "xvf3800",
    "xvf3000",
    "xvf-3000",
    "mic array",
    "4-mic",
    "4 mic",
)


def pick_respeaker_device(min_channels: int):
    import sounddevice as sd

    for i, d in enumerate(sd.query_devices()):
        try:
            max_in = int(d.get("max_input_channels", 0) or 0)
        except (TypeError, ValueError):
            max_in = 0
        if max_in < int(min_channels):
            continue
        name = str(d.get("name", "")).lower()
        if any(k in name for k in _DEVICE_KEYWORDS):
            return i
    return None


def resolve_preset_args(
    preset_id: str,
    channels: Optional[int],
    mic_channels: Optional[str],
    dtype: Optional[str],
) -> Tuple[int, str, str]:
    if preset_id not in ARRAY_PRESETS:
        raise ValueError(f"Unknown --array-preset {preset_id!r}; choose one of {sorted(ARRAY_PRESETS)}")
    p = ARRAY_PRESETS[preset_id]
    ch = int(p["channels"]) if channels is None else int(channels)
    mc = str(p["mic_channels"]) if mic_channels is None else str(mic_channels)
    dt = str(p["dtype"]) if dtype is None else str(dtype)
    return ch, mc, dt
