import math
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np


C_SOUND = 343.0


def _next_pow2(n: int) -> int:
    return 1 << max(1, (n - 1).bit_length())


def _gcc_phat_curve(
    sig_a: np.ndarray,
    sig_b: np.ndarray,
    fs: int,
    max_tau_s: float,
    interp: int,
    f_low_hz: Optional[float] = None,
    f_high_hz: Optional[float] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    n_fft = _next_pow2(sig_a.shape[0] + sig_b.shape[0])
    a = np.fft.rfft(sig_a, n=n_fft)
    b = np.fft.rfft(sig_b, n=n_fft)
    r = a * np.conj(b)
    if f_low_hz is not None or f_high_hz is not None:
        freqs = np.fft.rfftfreq(n_fft, d=1.0 / fs)
        f_low = 0.0 if f_low_hz is None else max(0.0, float(f_low_hz))
        f_high = (fs * 0.5) if f_high_hz is None else min(fs * 0.5, float(f_high_hz))
        if f_high > f_low:
            band = (freqs >= f_low) & (freqs <= f_high)
            if np.any(band):
                r *= band.astype(np.float64)
    r /= np.abs(r) + 1e-12
    cc = np.fft.irfft(r, n=n_fft * interp)
    max_shift = int(interp * fs * max_tau_s)
    cc = np.concatenate((cc[-max_shift:], cc[: max_shift + 1]))
    lags = np.arange(-max_shift, max_shift + 1, dtype=np.float64) / (interp * fs)
    return lags, np.abs(cc)


def _confidence_from_scores(scores: np.ndarray, best_idx: int) -> float:
    best = float(scores[best_idx])
    if scores.shape[0] > 1:
        second = float(np.max(np.delete(scores, best_idx)))
    else:
        second = 0.0
    mean = float(np.mean(scores)) + 1e-12
    sharpness = max(0.0, min(1.0, (best - second) / (best + 1e-12)))
    contrast = max(0.0, min(1.0, (best - mean) / (best + 1e-12)))
    peak_ratio = max(0.0, (best - second) / (second + 1e-12))
    ratio_term = peak_ratio / (1.0 + peak_ratio)
    return 0.45 * sharpness + 0.35 * contrast + 0.20 * ratio_term


def _parabolic_offset_1d(v_m1: float, v_0: float, v_p1: float) -> float:
    denom = (v_m1 - 2.0 * v_0 + v_p1)
    if abs(denom) < 1e-12:
        return 0.0
    off = 0.5 * (v_m1 - v_p1) / denom
    return float(np.clip(off, -1.0, 1.0))


class SRPPhatDOA3D:
    """3D far-field SRP-PHAT DOA estimator.

    Y-up convention:
    - Mic plane is X-Z.
    - Elevation is along +Y (degrees above mic plane).
    - Azimuth 0 deg points along +Z; positive azimuth turns toward +X.
    """

    def __init__(
        self,
        mic_xyz_m: Sequence[Tuple[float, float, float]],
        fs: int = 16000,
        az_min_deg: float = -180.0,
        az_max_deg: float = 180.0,
        az_step_deg: float = 2.0,
        el_min_deg: float = -85.0,
        el_max_deg: float = 85.0,
        el_step_deg: float = 4.0,
        interp: int = 4,
        f_low_hz: Optional[float] = 300.0,
        f_high_hz: Optional[float] = 3000.0,
    ):
        self.fs = fs
        self.interp = interp
        self.f_low_hz = f_low_hz
        self.f_high_hz = f_high_hz
        self.mic_xyz = np.asarray(mic_xyz_m, dtype=np.float64)

        az_grid = np.arange(az_min_deg, az_max_deg + 0.5 * az_step_deg, az_step_deg, dtype=np.float64)
        if az_grid.size >= 2 and abs(float(az_grid[-1] - az_grid[0]) - 360.0) <= 0.5 * abs(float(az_step_deg)):
            # Drop duplicated seam direction (e.g. both -180 and +180).
            az_grid = az_grid[:-1]
        el_grid = np.arange(el_min_deg, el_max_deg + 0.5 * el_step_deg, el_step_deg, dtype=np.float64)
        az_rad = np.deg2rad(az_grid)
        el_rad = np.deg2rad(el_grid)
        self.az_grid = az_grid
        self.el_grid = el_grid
        self.n_az = int(az_grid.size)
        self.n_el = int(el_grid.size)
        self.az_step_deg = float(az_step_deg)
        self.el_step_deg = float(el_step_deg)

        dirs = []
        az_list = []
        el_list = []
        for el_deg, el_r in zip(el_grid, el_rad):
            ce = math.cos(float(el_r))
            se = math.sin(float(el_r))
            for az_deg, az_r in zip(az_grid, az_rad):
                dirs.append((ce * math.sin(float(az_r)), se, ce * math.cos(float(az_r))))
                az_list.append(float(az_deg))
                el_list.append(float(el_deg))

        self.dir_xyz = np.asarray(dirs, dtype=np.float64)
        self.azimuths_deg = np.asarray(az_list, dtype=np.float64)
        self.elevations_deg = np.asarray(el_list, dtype=np.float64)

        raw_pairs: List[Tuple[int, int, np.ndarray, float]] = []
        n_mics = self.mic_xyz.shape[0]
        for i in range(n_mics):
            for j in range(i + 1, n_mics):
                delta = self.mic_xyz[i] - self.mic_xyz[j]
                dist = float(np.linalg.norm(delta))
                if dist > 1e-6:
                    raw_pairs.append((i, j, delta.astype(np.float64), dist))
        if raw_pairs:
            dists = np.asarray([p[3] for p in raw_pairs], dtype=np.float64)
            weights = dists / (float(np.sum(dists)) + 1e-12)
            self.pairs = [
                (i, j, delta, dist, float(w))
                for (i, j, delta, dist), w in zip(raw_pairs, weights)
            ]
        else:
            self.pairs = []

    def estimate(
        self,
        mics: np.ndarray,
        return_meta: bool = False,
    ) -> Optional[Union[Tuple[float, float, float], Tuple[float, float, float, Dict[str, Any]]]]:
        if mics.ndim != 2 or mics.shape[1] < 2 or not self.pairs:
            return None

        # Frame conditioning helps GCC-PHAT robustness.
        mics = mics.astype(np.float64, copy=False)
        mics = mics - np.mean(mics, axis=0, keepdims=True)
        if mics.shape[0] > 4:
            mics = mics * np.hanning(mics.shape[0])[:, None]

        scores = np.zeros(self.dir_xyz.shape[0], dtype=np.float64)
        for i, j, delta, dist, weight in self.pairs:
            lags, cc_abs = _gcc_phat_curve(
                mics[:, i],
                mics[:, j],
                self.fs,
                dist / C_SOUND,
                self.interp,
                self.f_low_hz,
                self.f_high_hz,
            )
            tau_pred = (self.dir_xyz @ delta) / C_SOUND
            pair_score = np.interp(tau_pred, lags, cc_abs, left=0.0, right=0.0)
            pair_peak = float(np.max(pair_score))
            if pair_peak > 1e-12:
                pair_score = pair_score / pair_peak
            scores += float(weight) * pair_score

        best_idx = int(np.argmax(scores))
        score_grid = scores.reshape(self.n_el, self.n_az)
        best_el_idx, best_az_idx = divmod(best_idx, self.n_az)

        az_c = float(score_grid[best_el_idx, best_az_idx])
        az_l = float(score_grid[best_el_idx, (best_az_idx - 1) % self.n_az])
        az_r = float(score_grid[best_el_idx, (best_az_idx + 1) % self.n_az])
        az_off = _parabolic_offset_1d(az_l, az_c, az_r)
        az_deg = float(self.az_grid[best_az_idx] + az_off * self.az_step_deg)
        az_deg = ((az_deg + 180.0) % 360.0) - 180.0

        if 0 < best_el_idx < (self.n_el - 1):
            el_m1 = float(score_grid[best_el_idx - 1, best_az_idx])
            el_c = float(score_grid[best_el_idx, best_az_idx])
            el_p1 = float(score_grid[best_el_idx + 1, best_az_idx])
            el_off = _parabolic_offset_1d(el_m1, el_c, el_p1)
            el_curv = max(0.0, el_c - 0.5 * (el_m1 + el_p1))
        else:
            el_c = float(score_grid[best_el_idx, best_az_idx])
            el_off = 0.0
            el_curv = 0.0
        el_deg = float(self.el_grid[best_el_idx] + el_off * self.el_step_deg)
        el_deg = float(np.clip(el_deg, self.el_grid[0], self.el_grid[-1]))

        az_curv = max(0.0, az_c - 0.5 * (az_l + az_r))
        az_sharp = float(np.clip(3.0 * az_curv / (az_c + 1e-12), 0.0, 1.0))
        el_sharp = float(np.clip(3.0 * el_curv / (el_c + 1e-12), 0.0, 1.0))

        conf_base = _confidence_from_scores(scores, best_idx)
        conf = float(np.clip(0.80 * conf_base + 0.15 * az_sharp + 0.05 * el_sharp, 0.0, 1.0))
        elev_obs = max(0.0, math.cos(math.radians(abs(el_deg))))
        elev_conf = float(np.clip(0.50 * conf_base + 0.30 * el_sharp + 0.20 * elev_obs, 0.0, 1.0))

        if not return_meta:
            return az_deg, el_deg, conf
        meta: Dict[str, Any] = {
            "peak_score": float(scores[best_idx]),
            "mean_score": float(np.mean(scores)),
            "azimuth_sharpness": az_sharp,
            "elevation_sharpness": el_sharp,
            "elevation_observability": elev_obs,
            "elevation_confidence": elev_conf,
        }
        return az_deg, el_deg, conf, meta
