"""Tests for VehicleStore: routing each message to the right vehicle by system ID.

The store's whole job is keying state per vehicle, so these tests feed a couple
of fake ATTITUDE messages tagged with different system IDs and check they land in
separate slots. (ATTITUDE keeps the fakes tiny -- no mode tables needed.)
"""

import math
from types import SimpleNamespace

from gcs.vehicle_store import VehicleStore


def attitude_from(sysid, yaw=0.0):
    """A fake ATTITUDE message tagged with the system ID that 'sent' it."""
    msg = SimpleNamespace(roll=0.0, pitch=0.0, yaw=yaw)
    msg.get_type = lambda: "ATTITUDE"
    msg.get_srcSystem = lambda: sysid
    return msg


def test_store_keeps_vehicles_separate_by_system_id():
    store = VehicleStore()
    store.ingest(attitude_from(1))
    store.ingest(attitude_from(7))
    assert set(store.snapshot().keys()) == {1, 7}


def test_store_folds_updates_into_the_same_vehicle():
    store = VehicleStore()
    store.ingest(attitude_from(1, yaw=0.0))
    store.ingest(attitude_from(1, yaw=math.pi / 2))  # same vehicle, newer reading
    snap = store.snapshot()
    assert set(snap.keys()) == {1}                   # still one vehicle
    assert math.isclose(snap[1].yaw_deg, 90.0)       # latest message won


def test_snapshot_is_a_copy_not_the_live_dict():
    store = VehicleStore()
    store.ingest(attitude_from(1))
    snap = store.snapshot()
    snap[999] = None                                 # poke the returned dict
    assert 999 not in store.snapshot()               # internal state untouched
