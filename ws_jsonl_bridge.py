import argparse
import asyncio
import json
import os
from pathlib import Path

import websockets


def build_parser():
    p = argparse.ArgumentParser(
        description="Broadcast appended JSONL records to WebSocket clients in real time."
    )
    p.add_argument("--jsonl", default="doa_xyz_frames.jsonl", help="Path to source JSONL file")
    p.add_argument("--host", default="127.0.0.1", help="WebSocket bind host")
    p.add_argument("--port", type=int, default=8765, help="WebSocket bind port")
    p.add_argument(
        "--type",
        default="any",
        choices=("any", "doa", "xyz_frame"),
        help="Forward only records matching this type",
    )
    p.add_argument(
        "--from-end",
        action="store_true",
        help="Start tailing from end of file (new appends only)",
    )
    p.add_argument(
        "--poll-ms",
        type=int,
        default=50,
        help="Polling interval when waiting for new JSONL lines",
    )
    p.add_argument(
        "--xyz-only",
        action="store_true",
        help="Forward only x/y/z/volume keys in outbound messages",
    )
    return p


async def run_bridge(args):
    path = Path(args.jsonl)
    clients = set()

    async def handler(ws):
        clients.add(ws)
        try:
            async for _ in ws:
                # This bridge is push-only; ignore inbound messages.
                pass
        finally:
            clients.discard(ws)

    async def broadcast(payload):
        if not clients:
            return
        dead = []
        msg = json.dumps(payload, separators=(",", ":"))
        for ws in list(clients):
            try:
                await ws.send(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            clients.discard(ws)

    async def tail_and_send():
        poll_s = max(0.01, float(args.poll_ms) / 1000.0)
        while not path.exists():
            await asyncio.sleep(poll_s)

        with path.open("r", encoding="utf-8") as f:
            if args.from_end:
                f.seek(0, os.SEEK_END)

            while True:
                line = f.readline()
                if not line:
                    # Handle truncation/rotation.
                    try:
                        if path.stat().st_size < f.tell():
                            f.seek(0)
                    except FileNotFoundError:
                        pass
                    await asyncio.sleep(poll_s)
                    continue

                line = line.strip()
                if not line:
                    continue

                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if args.type != "any" and rec.get("type") != args.type:
                    continue

                if args.xyz_only:
                    rec = {
                        "x": rec.get("x"),
                        "y": rec.get("y"),
                        "z": rec.get("z"),
                        "volume": rec.get("volume", rec.get("energy")),
                    }

                await broadcast(rec)

    async with websockets.serve(handler, args.host, int(args.port), ping_interval=20, ping_timeout=20):
        print(
            json.dumps(
                {
                    "type": "ws_bridge_status",
                    "jsonl": str(path),
                    "listen": f"ws://{args.host}:{args.port}",
                    "filter_type": args.type,
                    "from_end": bool(args.from_end),
                    "xyz_only": bool(args.xyz_only),
                }
            ),
            flush=True,
        )
        await tail_and_send()


def main():
    args = build_parser().parse_args()
    asyncio.run(run_bridge(args))


if __name__ == "__main__":
    main()
