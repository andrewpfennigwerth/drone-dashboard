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

from dataclasses import replace
from typing import Optional

from vehicle_state import VehicleState


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
            heading_deg=_heading_deg(message.hdg),
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
