import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.animation import FuncAnimation
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401


def build_parser():
    p = argparse.ArgumentParser(description="Plot 3D DOA points from JSONL logs.")
    p.add_argument(
        "--jsonl",
        default="doa_xyz_frames.jsonl",
        help="Path to JSONL file produced by doa_respeaker_only.py",
    )
    p.add_argument(
        "--type",
        default="any",
        choices=("any", "doa", "xyz_frame"),
        help="Record type to plot",
    )
    p.add_argument(
        "--tail",
        type=int,
        default=500,
        help="Plot only the last N valid points",
    )
    p.add_argument(
        "--min-confidence",
        type=float,
        default=0.0,
        help="Discard points below this confidence",
    )
    p.add_argument(
        "--target-distance-m",
        type=float,
        default=1.2,
        help="Radius to draw as a visual reference sphere",
    )
    p.add_argument(
        "--follow",
        action="store_true",
        help="Continuously reload JSONL and refresh plot",
    )
    p.add_argument(
        "--refresh-ms",
        type=int,
        default=500,
        help="Refresh period in milliseconds when --follow is used",
    )
    return p


def load_points(path: Path, wanted_type: str, min_conf: float):
    rows = []
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue

            rtype = rec.get("type")
            if wanted_type != "any" and rtype != wanted_type:
                continue
            if "x" not in rec or "y" not in rec or "z" not in rec:
                continue

            conf = float(rec.get("confidence", 0.0))
            if conf < min_conf:
                continue

            rows.append(
                (
                    float(rec["x"]),
                    float(rec["y"]),
                    float(rec["z"]),
                    conf,
                    float(rec.get("timestamp", 0.0)),
                )
            )
    return rows


def set_equal_axes(ax, x, y, z):
    # Include origin so the red "mic origin" marker is always in-view.
    x_all = np.concatenate([np.asarray(x), np.asarray([0.0])])
    y_all = np.concatenate([np.asarray(y), np.asarray([0.0])])
    z_all = np.concatenate([np.asarray(z), np.asarray([0.0])])
    x_mid = float(np.mean([np.min(x_all), np.max(x_all)]))
    y_mid = float(np.mean([np.min(y_all), np.max(y_all)]))
    z_mid = float(np.mean([np.min(z_all), np.max(z_all)]))
    max_span = float(max(np.ptp(x_all), np.ptp(y_all), np.ptp(z_all), 1e-6))
    half = 0.6 * max_span
    ax.set_xlim(x_mid - half, x_mid + half)
    ax.set_ylim(y_mid - half, y_mid + half)
    ax.set_zlim(z_mid - half, z_mid + half)


def main():
    args = build_parser().parse_args()
    path = Path(args.jsonl)
    def get_rows():
        rows = load_points(path, args.type, float(args.min_confidence))
        if args.tail > 0 and len(rows) > args.tail:
            rows = rows[-args.tail :]
        return rows

    def draw(ax, rows):
        ax.cla()
        r = float(args.target_distance_m)
        u = np.linspace(0.0, 2.0 * np.pi, 50)
        v = np.linspace(0.0, np.pi, 30)
        xs = r * np.outer(np.cos(u), np.sin(v))
        ys = r * np.outer(np.ones_like(u), np.cos(v))
        zs = r * np.outer(np.sin(u), np.sin(v))
        ax.plot_wireframe(xs, ys, zs, rstride=4, cstride=4, color="gray", alpha=0.15)
        ax.scatter([0.0], [0.0], [0.0], c="red", s=70, label="mic origin")

        if rows:
            xyz = np.asarray([[rr[0], rr[1], rr[2]] for rr in rows], dtype=np.float64)
            conf = np.asarray([rr[3] for rr in rows], dtype=np.float64)
            x = xyz[:, 0]
            y = xyz[:, 1]
            z = xyz[:, 2]
            center = np.median(xyz, axis=0)

            ax.scatter(x, y, z, c=conf, cmap="viridis", vmin=0.0, vmax=1.0, s=20, alpha=0.85)
            ax.scatter([center[0]], [center[1]], [center[2]], c="orange", s=55, label="median point")
            ax.plot([0.0, center[0]], [0.0, center[1]], [0.0, center[2]], c="orange", linewidth=2)
            set_equal_axes(ax, x, y, z)
            title = f"DOA 3D Points ({len(rows)} samples)"
        else:
            set_equal_axes(ax, np.asarray([0.0]), np.asarray([0.0]), np.asarray([0.0]))
            title = "DOA 3D Points (waiting for samples)"

        ax.set_xlabel("X")
        ax.set_ylabel("Y")
        ax.set_zlabel("Z")
        ax.set_title(title)
        ax.legend(loc="upper left")

    fig = plt.figure(figsize=(9, 8))
    ax = fig.add_subplot(111, projection="3d")
    sm = plt.cm.ScalarMappable(cmap="viridis", norm=plt.Normalize(vmin=0.0, vmax=1.0))
    sm.set_array([])
    cbar = plt.colorbar(sm, ax=ax, pad=0.08)
    cbar.set_label("confidence")

    rows = get_rows()
    if not args.follow and not rows:
        raise RuntimeError("No valid points to plot. Check --jsonl/--type/--min-confidence.")
    draw(ax, rows)
    plt.tight_layout()

    if args.follow:
        def _update(_):
            draw(ax, get_rows())
            return ()

        _ani = FuncAnimation(
            fig,
            _update,
            interval=max(50, int(args.refresh_ms)),
            cache_frame_data=False,
        )

    plt.show()


if __name__ == "__main__":
    main()
