"""Read XVF3800 on-chip microphone geometry (matches beamformer / LED DOA frame).

The XMOS control command ``AEC_MIC_ARRAY_GEO`` returns 12 floats: Mic0..Mic3 as
(x, y, z) in metres, in the same indexing order as USB 6-ch firmware raw
channels (Mic i → host channel 2 + i).

Requires Seeed's ``xvf_host`` / ``xvf_host.exe`` from:
https://github.com/respeaker/reSpeaker_XVF3800_USB_4MIC_ARRAY (host_control/)

Set environment variable ``XVF_HOST`` to the full path if the tool is not on PATH.
You can also copy ``xvf_host.exe`` into this repo's ``tools/`` directory (next to
``firmware_geometry.py``'s package root: ``soundorb/tools/xvf_host.exe``).
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import List, Optional

import numpy as np


def _run_xvf_host_cmd(host_exe: Optional[str], subcommand: str, timeout_s: float) -> str:
    exe = find_xvf_host_executable(host_exe)
    if not exe:
        return ""
    kwargs = {
        "args": [exe, subcommand],
        "capture_output": True,
        "text": True,
        "timeout": timeout_s,
    }
    if os.name == "nt":
        cr = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        if cr:
            kwargs["creationflags"] = cr
    try:
        r = subprocess.run(**kwargs)
    except (OSError, subprocess.SubprocessError):
        return ""
    return (r.stdout or "") + "\n" + (r.stderr or "")


def find_xvf_host_executable(explicit: Optional[str] = None) -> Optional[str]:
    if explicit:
        if os.path.isfile(explicit):
            return explicit
        return None
    env = os.environ.get("XVF_HOST")
    if env and os.path.isfile(env):
        return env
    pkg = Path(__file__).resolve().parent
    for candidate in (
        pkg / "tools" / "xvf_host.exe",
        pkg / "tools" / "xvf_host",
        pkg / "xvf_host.exe",
        pkg / "xvf_host",
    ):
        if candidate.is_file():
            return str(candidate)
    for name in ("xvf_host.exe", "xvf_host"):
        path = shutil.which(name)
        if path:
            return path
    return None


def parse_aec_mic_array_geo(stdout: str) -> Optional[np.ndarray]:
    """Parse xvf_host output; return shape (4, 3) float64 [mic0..mic3], or None."""
    for line in stdout.splitlines():
        if "AEC_MIC_ARRAY_GEO" not in line.upper():
            continue
        nums: List[float] = []
        for m in re.finditer(r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?", line):
            try:
                nums.append(float(m.group(0)))
            except ValueError:
                continue
        if len(nums) >= 12:
            return np.array(nums[:12], dtype=np.float64).reshape(4, 3)

    all_nums: List[float] = []
    for m in re.finditer(r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?", stdout):
        try:
            all_nums.append(float(m.group(0)))
        except ValueError:
            continue
    if len(all_nums) >= 12:
        return np.array(all_nums[-12:], dtype=np.float64).reshape(4, 3)
    return None


def fetch_mic_xyz_from_xvf3800(
    host_exe: Optional[str] = None,
    timeout_s: float = 10.0,
) -> Optional[np.ndarray]:
    out = _run_xvf_host_cmd(host_exe, "AEC_MIC_ARRAY_GEO", timeout_s)
    return parse_aec_mic_array_geo(out) if out else None


def parse_auto_beam_azimuth_deg(stdout: str) -> Optional[float]:
    """Parse last azimuth (auto-selected beam) from ``AEC_AZIMUTH_VALUES`` output."""
    for line in stdout.splitlines():
        if "AEC_AZIMUTH_VALUES" not in line.upper():
            continue
        deg_matches = list(re.finditer(r"\(\s*([-+]?\d+(?:\.\d+)?)\s*deg\s*\)", line, re.I))
        if deg_matches:
            try:
                return float(deg_matches[-1].group(1))
            except ValueError:
                return None
    return None


def fetch_auto_beam_azimuth_deg(
    host_exe: Optional[str] = None,
    timeout_s: float = 10.0,
) -> Optional[float]:
    out = _run_xvf_host_cmd(host_exe, "AEC_AZIMUTH_VALUES", timeout_s)
    return parse_auto_beam_azimuth_deg(out) if out else None


def parse_doa_value_line(stdout: str):
    """Parse ``DOA_VALUE`` line: azimuth 0..359 and speech flag 0|1."""
    for line in stdout.splitlines():
        if "DOA_VALUE" not in line.upper():
            continue
        parts = line.upper().split("DOA_VALUE", 1)[-1].strip()
        nums = re.findall(r"\b(\d+)\b", parts)
        if len(nums) >= 2:
            try:
                return float(int(nums[0]) % 360), int(nums[1])
            except ValueError:
                return None, None
        nums2 = re.findall(r"[-+]?(?:\d*\.\d+|\d+)", parts)
        if len(nums2) >= 2:
            try:
                return float(nums2[0]) % 360.0, int(float(nums2[1]))
            except ValueError:
                return None, None
    return None, None


def fetch_firmware_doa_azimuth_deg(
    host_exe: Optional[str] = None,
    timeout_s: float = 3.0,
):
    """Return (azimuth_deg, speech_0_or_1_or_None, source) from on-chip DOA (LED-aligned).

    Tries ``DOA_VALUE`` first (0–359° + VAD bit), then ``AEC_AZIMUTH_VALUES`` auto-beam.
    """
    out = _run_xvf_host_cmd(host_exe, "DOA_VALUE", timeout_s)
    az, sp = parse_doa_value_line(out)
    if az is not None:
        return az, sp, "DOA_VALUE"

    out2 = _run_xvf_host_cmd(host_exe, "AEC_AZIMUTH_VALUES", timeout_s)
    az2 = parse_auto_beam_azimuth_deg(out2)
    if az2 is not None:
        return float(az2), None, "AEC_AZIMUTH_VALUES"
    return None, None, "none"
