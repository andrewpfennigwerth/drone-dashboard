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

from pymavlink import mavutil

from gcs.reducer import apply
from gcs.vehicle_state import VehicleState


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
    assert math.isclose(new.velocity_north_ms, 3.0)   # vx 300 cm/s -> 3 m/s north
    assert math.isclose(new.velocity_east_ms, 4.0)    # vy 400 cm/s -> 4 m/s east
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


def attitude(**overrides):
    """A fake ATTITUDE message in raw wire units (radians).

    Default case: level (roll=pitch=0) with yaw at 90 deg (pi/2 rad).
    """
    fields = dict(roll=0.0, pitch=0.0, yaw=math.pi / 2)
    fields.update(overrides)
    msg = SimpleNamespace(**fields)
    msg.get_type = lambda: "ATTITUDE"
    return msg


def test_attitude_converts_radians_to_degrees():
    new = apply(attitude(roll=math.pi, pitch=-math.pi / 2), VehicleState())
    assert math.isclose(new.roll_deg, 180.0)     # pi rad
    assert math.isclose(new.pitch_deg, -90.0)    # -pi/2 rad (sign kept honestly)
    assert math.isclose(new.yaw_deg, 90.0)       # factory default, pi/2 rad


def heartbeat(**overrides):
    """A fake HEARTBEAT. Defaults: an ArduCopter, armed, in AUTO mode.

    mode_string_v10 reads several real fields off a heartbeat -- the vehicle
    type (which picks the mode table), the autopilot, base_mode, and
    custom_mode -- so the defaults form a realistic copter heartbeat. base_mode
    carries two bits we rely on: SAFETY_ARMED, and CUSTOM_MODE_ENABLED, which is
    what tells the decoder to read custom_mode at all.
    """
    armed_and_custom = (
        mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED
        | mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED
    )
    fields = dict(
        type=mavutil.mavlink.MAV_TYPE_QUADROTOR,                # 2 -> ArduCopter mode table
        autopilot=mavutil.mavlink.MAV_AUTOPILOT_ARDUPILOTMEGA,
        base_mode=armed_and_custom,
        custom_mode=3,                                          # 3 -> AUTO on copter
    )
    fields.update(overrides)
    msg = SimpleNamespace(**fields)
    msg.get_type = lambda: "HEARTBEAT"
    return msg


def test_heartbeat_decodes_armed_and_mode():
    new = apply(heartbeat(), VehicleState())
    assert new.armed is True
    assert new.flight_mode == "AUTO"


def test_heartbeat_disarmed_is_false_not_none():
    # Clear SAFETY_ARMED but keep CUSTOM_MODE_ENABLED so the mode still decodes.
    disarmed = mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED
    new = apply(heartbeat(base_mode=disarmed), VehicleState())
    assert new.armed is False        # heard + disarmed -- distinct from None ("not heard")


def sys_status(**overrides):
    """A fake SYS_STATUS in raw wire units. Defaults: 12.3 V, 1.5 A, 87% remaining."""
    fields = dict(
        voltage_battery=12300,   # mV
        current_battery=150,     # cA (= 1.5 A)
        battery_remaining=87,    # percent
    )
    fields.update(overrides)
    msg = SimpleNamespace(**fields)
    msg.get_type = lambda: "SYS_STATUS"
    return msg


def test_sys_status_converts_battery_fields():
    new = apply(sys_status(), VehicleState())
    assert math.isclose(new.battery_voltage_v, 12.3)
    assert math.isclose(new.battery_current_a, 1.5)
    assert new.battery_remaining_pct == 87


def test_sys_status_unknown_values_become_none():
    new = apply(
        sys_status(voltage_battery=65535, current_battery=-1, battery_remaining=-1),
        VehicleState(),
    )
    assert new.battery_voltage_v is None
    assert new.battery_current_a is None
    assert new.battery_remaining_pct is None


def gps_raw_int(**overrides):
    """A fake GPS_RAW_INT in raw wire units. Defaults: 3D fix, 11 sats, HDOP 0.8."""
    fields = dict(
        fix_type=3,              # 3 = 3D fix
        satellites_visible=11,
        eph=80,                  # HDOP x 100 (= 0.8)
    )
    fields.update(overrides)
    msg = SimpleNamespace(**fields)
    msg.get_type = lambda: "GPS_RAW_INT"
    return msg


def test_gps_raw_int_converts_fields():
    new = apply(gps_raw_int(), VehicleState())
    assert new.gps_fix_type == 3             # stored raw; frontend turns 3 into "3D fix"
    assert new.satellites_visible == 11
    assert math.isclose(new.hdop, 0.8)


def test_gps_raw_int_unknown_values_become_none():
    new = apply(gps_raw_int(satellites_visible=255, eph=65535), VehicleState())
    assert new.satellites_visible is None
    assert new.hdop is None


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
