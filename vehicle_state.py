"""VehicleState: the operator-facing snapshot of one vehicle, in clean SI units.

This is the model the backend holds in memory and the frontend renders (as a
JSON snapshot, not this object directly). Two rules it exists to enforce:

1. Stored in clean internal units -- degrees, meters, m/s, volts, percent.
   Display formatting (feet, mph, ...) is the frontend's job, never a field here.
2. Every field defaults to None, never 0. None honestly means "haven't heard
   yet." 0 lies: lat/lon = 0,0 is Null Island, a real point in the ocean, and
   would plant the drone there on the map indistinguishably from a real fix.

v1 builds a single-vehicle UI, but each VehicleState describes exactly *one*
vehicle so a system-ID-keyed container can hold many later without reshaping
this (keeping multi-vehicle a door, not a rewrite).
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class VehicleState:
    # --- from GLOBAL_POSITION_INT ---
    latitude: Optional[float] = None        # degrees (angular -- NOT meters)
    longitude: Optional[float] = None       # degrees
    altitude_msl_m: Optional[float] = None  # meters above mean sea level
    altitude_rel_m: Optional[float] = None  # meters above home (usually the one to show)
    ground_speed_ms: Optional[float] = None # meters/second over the ground (horizontal)
    heading_deg: Optional[float] = None     # degrees, 0=N clockwise; None if unknown
