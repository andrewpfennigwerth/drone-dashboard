"""tools/ws_probe.py -- watch the backend's WebSocket stream.

The WebSocket cousin of connection_probe.py: it connects to the running server's
/ws endpoint and prints each snapshot as it arrives, so you can confirm M2 is
actually streaming (~5 a second) and updating as the vehicle moves.

Run it with the server already up (uvicorn gcs.server:app) and SITL sending
telemetry, from the repo root:
    .venv/bin/python tools/ws_probe.py
"""

import asyncio
import json
import sys

import websockets

DEFAULT_URL = "ws://localhost:8000/ws"


async def main(url: str) -> None:
    print(f"connecting to {url} -- Ctrl-C to stop")
    async with websockets.connect(url) as ws:
        print("connected; waiting for snapshots...\n")
        async for message in ws:
            print(json.loads(message))


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    try:
        asyncio.run(main(target))
    except KeyboardInterrupt:
        print("\nstopping")
