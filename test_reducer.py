"""Unit tests for the reducer's MAVLink -> VehicleState conversions.

No live drone and no real pymavlink message needed: the reducer only reads a
message's attributes and its get_type(), so a tiny stand-in with those exercises
the exact same code path -- fast, offline, deterministic.

Written as plain `test_*` functions using assert, so `pytest` will discover and
run them once it's installed. Until then, run this file directly
(`python3 test_reducer.py`) and the __main__ block at the bottom runs them.
"""

import math
from types import SimpleNamespace

from reducer import apply
from vehicle_state import VehicleState


def global_position_int(**overrides):
    """A fake GLOBAL_POSITION_INT message in raw wire units.

    Defaults are a clean, hand-checkable case:
      lat/lon -> 47.3977418 deg, 8.5455938 deg
      alt     -> 584.09 m MSL, 10.0 m relative
      vx,vy   -> 3,4 m/s  => 5.0 m/s ground speed (a 3-4-5 triangle, on purpose)
      hdg     -> 90.0 deg
    """
    fields = dict(
        lat=473977418,       # degE7
        lon=85455938,        # degE7
        alt=584090,          # mm above mean sea level
        relative_alt=10000,  # mm above home
        vx=300,              # cm/s north
        vy=400,              # cm/s east
        vz=0,                # cm/s down
        hdg=9000,            # centidegrees
    )
    fields.update(overrides)
    msg = SimpleNamespace(**fields)
    msg.get_type = lambda: "GLOBAL_POSITION_INT"
    return msg


def test_global_position_int_converts_every_field():
    new = apply(global_position_int(), VehicleState())
    assert math.isclose(new.latitude, 47.3977418)
    assert math.isclose(new.longitude, 8.5455938)
    assert math.isclose(new.altitude_msl_m, 584.09)
    assert math.isclose(new.altitude_rel_m, 10.0)
    assert math.isclose(new.ground_speed_ms, 5.0)
    assert math.isclose(new.heading_deg, 90.0)


def test_heading_65535_means_unknown_not_zero():
    new = apply(global_position_int(hdg=65535), VehicleState())
    assert new.heading_deg is None


def test_reducer_does_not_mutate_input_state():
    original = VehicleState()
    apply(global_position_int(), original)
    assert original.latitude is None  # untouched: apply returned a new object


def test_unhandled_message_returns_state_unchanged():
    state = VehicleState(latitude=1.23)
    other = SimpleNamespace(get_type=lambda: "SCALED_PRESSURE")
    assert apply(other, state) is state


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failures = 0
    for t in tests:
        try:
            t()
            print(f"PASS  {t.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"FAIL  {t.__name__}: {e}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    raise SystemExit(1 if failures else 0)
