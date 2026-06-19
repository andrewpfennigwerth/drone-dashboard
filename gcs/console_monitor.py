"""Console monitor: the milestone-1 finish line and first live end-to-end check.

It joins the three layers we've built into one loop:

    UdpMavlinkSource -> VehicleStore (files each message under its vehicle's
    system ID, folding it through the reducer) -> one line per vehicle, ~1/sec

Run it with the simulator (ArduPilot SITL) already sending telemetry:

    .venv/bin/python console_monitor.py

This is a stand-in for the real dashboard, and it's deliberately the place the
display formatting lives. VehicleState stays in clean units; turning a fix-type
of 3 into "3D", or showing "--" for a value we haven't heard yet, is the
display's job -- not the state's. The React frontend will do the same later.
"""

import sys
import time

from gcs.telemetry_source import UdpMavlinkSource
from gcs.vehicle_state import VehicleState
from gcs.vehicle_store import VehicleStore

# How often to print. Ingest runs as fast as messages arrive; the print is
# throttled so the console stays readable. Same "decouple the display rate from
# the data rate" idea the 5 Hz WebSocket tick will use later.
PRINT_INTERVAL_S = 1.0

# fix_type is stored as the raw MAVLink number; labeling it is the display's job.
GPS_FIX_LABELS = {
    0: "no GPS",
    1: "no fix",
    2: "2D",
    3: "3D",
    4: "DGPS",
    5: "RTK float",
    6: "RTK fixed",
}


def main() -> None:
    # The connection string is the one knob; default to SITL, allow an override.
    connection_string = sys.argv[1] if len(sys.argv) > 1 else "udpin:localhost:14550"

    source = UdpMavlinkSource(connection_string)
    source.connect()
    print(f"listening on {connection_string} -- Ctrl-C to stop\n")

    store = VehicleStore()
    last_print = 0.0
    try:
        while True:
            message = source.get_message()
            if message is not None:
                store.ingest(message)
            else:
                # Nothing waiting this instant: yield the CPU briefly instead of
                # spinning at 100%. (None means "quiet right now," not "lost.")
                time.sleep(0.01)

            now = time.monotonic()
            if now - last_print >= PRINT_INTERVAL_S:
                _print_snapshot(store)
                last_print = now
    except KeyboardInterrupt:
        print("\nstopping")
    finally:
        source.close()


def _print_snapshot(store: VehicleStore) -> None:
    """Print one line per vehicle we've heard from, keyed by system ID."""
    snapshot = store.snapshot()
    if not snapshot:
        print("(no vehicles heard yet)")
        return
    for sysid, state in sorted(snapshot.items()):
        print(f"[sys {sysid}] {format_state(state)}")


def format_state(state: VehicleState) -> str:
    """One readable line of vehicle state, with '--' for anything not yet heard."""
    return " | ".join(
        [
            f"mode={_text(state.flight_mode)} armed={_armed_text(state.armed)}",
            f"pos={_pos(state.latitude, state.longitude)} alt={_num(state.altitude_rel_m, 'm')}",
            f"spd={_num(state.ground_speed_ms, 'm/s')} hdg={_num(state.heading_deg, 'deg')}",
            f"att r={_num(state.roll_deg)} p={_num(state.pitch_deg)} y={_num(state.yaw_deg)}",
            f"batt={_num(state.battery_voltage_v, 'V')} {_num(state.battery_remaining_pct, '%', 0)} {_num(state.battery_current_a, 'A')}",
            f"gps={_fix(state.gps_fix_type)} sats={_text(state.satellites_visible)} hdop={_num(state.hdop)}",
        ]
    )


def _num(value, unit="", places=1):
    """A rounded number with an optional unit, or '--' if not heard yet."""
    if value is None:
        return "--"
    return f"{value:.{places}f}{unit}"


def _text(value):
    return "--" if value is None else str(value)


def _armed_text(armed):
    if armed is None:
        return "--"
    return "YES" if armed else "no"


def _pos(lat, lon):
    if lat is None or lon is None:
        return "--"
    return f"{lat:.6f},{lon:.6f}"


def _fix(fix_type):
    if fix_type is None:
        return "--"
    return GPS_FIX_LABELS.get(fix_type, f"fix({fix_type})")


if __name__ == "__main__":
    main()
