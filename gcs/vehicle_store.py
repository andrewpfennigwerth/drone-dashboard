"""VehicleStore: the current state of every vehicle we've heard from, keyed by system ID.

MAVLink tags every message with the ID of the system that sent it
(message.get_srcSystem()). v1 shows a single drone, but keying state by that ID
from the start means a second vehicle is simply a second entry here -- no change
to VehicleState or the reducer. That's invariant 7 ("multi-vehicle stays a door,
not a rewrite") made concrete.

Note the split of responsibilities: the reducer stays a pure, single-vehicle
function (message + one VehicleState -> new VehicleState). Deciding *which*
vehicle a message belongs to is this layer's job, not the reducer's -- the same
kind of seam as keeping unit conversions out of the source.
"""

from gcs.reducer import apply
from gcs.vehicle_state import VehicleState


class VehicleStore:
    def __init__(self) -> None:
        # Keyed by MAVLink system ID. Empty until the first message arrives.
        self._states: dict[int, VehicleState] = {}

    def ingest(self, message) -> None:
        """Route a raw MAVLink message to its vehicle's state and fold it in."""
        sysid = message.get_srcSystem()
        current = self._states.get(sysid, VehicleState())
        self._states[sysid] = apply(message, current)

    def snapshot(self) -> dict[int, VehicleState]:
        """A copy of every vehicle's current state, keyed by system ID.

        A copy so callers (the console printer now, the WebSocket broadcaster
        later) can read freely without reaching into the store's internals.
        """
        return dict(self._states)
