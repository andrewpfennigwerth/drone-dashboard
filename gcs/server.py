"""gcs.server -- the FastAPI backend (milestone 2).

Same idea as the console monitor, but inside a web server: one background task
pulls MAVLink off the source and folds it into a VehicleStore, while the HTTP /
WebSocket handlers read snapshots back out of that store.

The source is *injected* -- create_app() takes any TelemetrySource -- so the seam
the whole project is built around (sim / log-replay / real hardware are
interchangeable, invariant 1) now runs through the server too. It also makes the
server testable: hand create_app a fake source and assert what comes out.

Two ways to read the state:
  - GET /api/state : the current snapshot, once (handy from a browser or curl)
  - WS  /ws        : a fresh snapshot pushed ~5 times a second

Run it (with SITL sending telemetry), from the repo root:
    .venv/bin/python -m uvicorn gcs.server:app --reload
"""

import asyncio
from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from gcs.telemetry_source import TelemetrySource, UdpMavlinkSource
from gcs.vehicle_state import VehicleState
from gcs.vehicle_store import VehicleStore

# We push state to the browser at a fixed 5 Hz. This tick is the server's, set on
# purpose and kept separate from how fast MAVLink arrives (invariant 5): SITL can
# emit dozens of messages a second, but the browser only needs a steady beat.
BROADCAST_HZ = 5
BROADCAST_INTERVAL_S = 1 / BROADCAST_HZ


async def _ingest_loop(source: TelemetrySource, store: VehicleStore) -> None:
    """Pull raw messages forever and fold them into the store.

    The console monitor's loop, made cooperative: get_message() is non-blocking,
    so it returns instantly and this can share the server's single worker with
    the web handlers instead of freezing them.
    """
    while True:
        message = source.get_message()
        if message is not None:
            store.ingest(message)
            await asyncio.sleep(0)      # hand the worker back so handlers run too
        else:
            await asyncio.sleep(0.01)   # quiet wire: don't busy-spin


def _serialize(snapshot: dict[int, VehicleState]) -> dict[str, dict]:
    """{sysid: VehicleState} -> plain JSON-able dicts. None stays null (= 'unknown')."""
    return {str(sysid): asdict(state) for sysid, state in snapshot.items()}


def create_app(source: TelemetrySource) -> FastAPI:
    """Build the server around a given telemetry source.

    Production passes a UdpMavlinkSource (see `app` below); tests pass a fake.
    Each app gets its own VehicleStore, so nothing leaks between instances. The
    parameter is typed to the TelemetrySource interface, not the UDP class -- the
    server depends on the abstraction, never the concrete source.
    """
    store = VehicleStore()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Open the source and start ingest on boot; cancel + close on shutdown.
        source.connect()
        task = asyncio.create_task(_ingest_loop(source, store))
        try:
            yield
        finally:
            task.cancel()
            try:
                await task                # let the loop unwind from the cancel
            except asyncio.CancelledError:
                pass
            source.close()

    app = FastAPI(lifespan=lifespan)

    @app.get("/api/state")
    async def get_state() -> dict[str, dict]:
        """Return the current snapshot of every vehicle, once."""
        return _serialize(store.snapshot())

    @app.websocket("/ws")
    async def stream_state(websocket: WebSocket) -> None:
        """Hold the connection open and push a fresh snapshot ~5x a second."""
        await websocket.accept()
        try:
            while True:
                await websocket.send_json(_serialize(store.snapshot()))
                await asyncio.sleep(BROADCAST_INTERVAL_S)
        except WebSocketDisconnect:
            pass

    return app


# The production app uvicorn serves: the real UDP source from SITL / hardware.
app = create_app(UdpMavlinkSource())
