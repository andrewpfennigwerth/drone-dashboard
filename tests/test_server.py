"""Tests for the FastAPI backend, driven by a fake source (no SITL needed).

This is what the injectable-source refactor buys us: create_app() takes any
TelemetrySource, so we hand it a canned one and assert the whole wiring --
source -> ingest -> store -> serialize -> HTTP / WebSocket -- end to end, offline.
"""

import math
import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from gcs.server import create_app
from gcs.telemetry_source import TelemetrySource


class FakeSource(TelemetrySource):
    """A canned source: always hands up one ATTITUDE (yaw 90 deg) from system 1."""

    def __init__(self) -> None:
        msg = SimpleNamespace(roll=0.0, pitch=0.0, yaw=math.pi / 2)
        msg.get_type = lambda: "ATTITUDE"
        msg.get_srcSystem = lambda: 1
        self._msg = msg

    def connect(self) -> None:
        pass

    def get_message(self):
        return self._msg

    def close(self) -> None:
        pass


def _snapshot_with(ws, key, tries=25):
    """Receive WebSocket snapshots until one contains `key`, or fail."""
    for _ in range(tries):
        snapshot = ws.receive_json()
        if key in snapshot:
            return snapshot
    raise AssertionError(f"vehicle {key!r} never appeared in {tries} snapshots")


def test_websocket_streams_state_from_injected_source():
    with TestClient(create_app(FakeSource())) as client:
        with client.websocket_connect("/ws") as ws:
            snapshot = _snapshot_with(ws, "1")
    assert snapshot["1"]["yaw_deg"] == pytest.approx(90.0)


def test_api_state_reflects_injected_source():
    with TestClient(create_app(FakeSource())) as client:
        snapshot = {}
        for _ in range(25):
            snapshot = client.get("/api/state").json()
            if "1" in snapshot:
                break
            time.sleep(0.02)  # let the background ingest task run, then re-check
    assert "1" in snapshot
    assert snapshot["1"]["yaw_deg"] == pytest.approx(90.0)
