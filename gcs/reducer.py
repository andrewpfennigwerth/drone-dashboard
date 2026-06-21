"""Reducer: the one and only place MAVLink becomes VehicleState.

apply(message, state) -> new VehicleState. It's a *pure* function: the same
inputs always give the same output, and it never mutates the state handed in --
it returns a fresh copy (via dataclasses.replace). That purity is what makes it
trivial to test, and it's the same idea as a React/Redux reducer -- fitting,
since a React app renders the result.

Every unit conversion in the system lives here and nowhere else:
degE7 -> deg, mm -> m, cm/s -> m/s, centideg -> deg. A conversion found anywhere
else is a bug by definition.
"""

import math
from dataclasses import replace
from typing import Optional

from pymavlink import mavutil

from gcs.vehicle_state import VehicleState


def apply(message, state: VehicleState) -> VehicleState:
    """Fold one raw MAVLink message into the snapshot, returning the new snapshot."""
    msg_type = message.get_type()

    if msg_type == "GLOBAL_POSITION_INT":
        return replace(
            state,
            latitude=message.lat / 1e7,                  # degE7 -> deg (angular, NOT m)
            longitude=message.lon / 1e7,                 # degE7 -> deg
            altitude_msl_m=message.alt / 1000,           # mm -> m, above mean sea level
            altitude_rel_m=message.relative_alt / 1000,  # mm -> m, above home
            ground_speed_ms=_ground_speed_ms(message.vx, message.vy),
            velocity_north_ms=message.vx / 100,  # cm/s -> m/s (+north)
            velocity_east_ms=message.vy / 100,   # cm/s -> m/s (+east)
            heading_deg=_heading_deg(message.hdg),
        )

    if msg_type == "ATTITUDE":
        return replace(
            state,
            roll_deg=math.degrees(message.roll),    # radians -> degrees
            pitch_deg=math.degrees(message.pitch),
            yaw_deg=math.degrees(message.yaw),
        )

    if msg_type == "HEARTBEAT":
        return replace(
            state,
            armed=_armed(message.base_mode),
            # custom_mode is a bare int; pymavlink maps it to the canonical name
            # ("AUTO", "LOITER") using the vehicle type carried in the same message.
            flight_mode=mavutil.mode_string_v10(message),
        )

    if msg_type == "SYS_STATUS":
        return replace(
            state,
            battery_voltage_v=_value_or_none(message.voltage_battery, 65535, 1000),  # mV -> V
            battery_current_a=_value_or_none(message.current_battery, -1, 100),       # cA -> A
            battery_remaining_pct=_value_or_none(message.battery_remaining, -1),      # already a percent
        )

    if msg_type == "GPS_RAW_INT":
        return replace(
            state,
            gps_fix_type=message.fix_type,                          # raw enum int; frontend labels it
            satellites_visible=_value_or_none(message.satellites_visible, 255),
            hdop=_value_or_none(message.eph, 65535, 100),           # eph is HDOP x 100
        )

    # A message we don't map yet: hand the state straight back, unchanged.
    return state


def _ground_speed_ms(vx_cms: int, vy_cms: int) -> float:
    """Horizontal ground speed (m/s) from north/east velocity components in cm/s."""
    vx = vx_cms / 100  # cm/s -> m/s
    vy = vy_cms / 100
    return (vx * vx + vy * vy) ** 0.5


def _heading_deg(hdg_centideg: int) -> Optional[float]:
    """Centidegrees -> degrees. 65535 is MAVLink's 'unknown' sentinel -> None."""
    if hdg_centideg == 65535:
        return None
    return hdg_centideg / 100


def _armed(base_mode: int) -> bool:
    """Whether the SAFETY_ARMED bit is set in HEARTBEAT's base_mode bitfield.

    Returns a definite True/False -- once a HEARTBEAT arrives we *know* the armed
    state. (The field stays None until the first HEARTBEAT: None means "no
    heartbeat heard yet," which is a different fact from "heard, and disarmed.")
    """
    return bool(base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)


def _value_or_none(raw, unknown, divisor=None):
    """A real reading, or None if the field holds MAVLink's 'unknown' value.

    Several MAVLink fields use a magic number to mean "I don't actually know this"
    (battery current -1, satellite count 255, and so on). Turning that into None
    lets the display show "unknown" instead of a fake reading. divisor applies the
    unit conversion when there is one (mV -> V is 1000); leave it off for fields
    already in their final unit -- a percentage, a satellite count -- so they stay ints.
    """
    if raw == unknown:
        return None
    return raw if divisor is None else raw / divisor
