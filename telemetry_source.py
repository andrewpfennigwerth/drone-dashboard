"""Telemetry source: the seam between the wire and everything downstream.

A TelemetrySource knows exactly one thing: how to pull raw MAVLink messages
off its particular transport. It does NOT know what VehicleState is, it does
NOT convert units, and it does NOT filter by message type. That deliberate
ignorance is the whole point -- it's what lets the simulator, a serial Pixhawk,
and a log-replay file stand in for each other with nothing downstream able to
tell them apart (dependency inversion; the pattern is Strategy).

v1 ships one implementation: UdpMavlinkSource, reading ArduPilot SITL's UDP
stream. Serial-hardware and log-replay sources come later and slot in here.
"""

from abc import ABC, abstractmethod
from typing import Optional

from pymavlink import mavutil

# A parsed MAVLink message, exactly as pymavlink hands it to us. We pass these
# upward untouched: raw, any type, no conversions. The reducer is what decides
# which messages matter and turns them into VehicleState.
MavlinkMessage = mavutil.mavlink.MAVLink_message


class TelemetrySource(ABC):
    """The contract every telemetry source promises to honor.

    Lifecycle the caller follows: connect() once, then get_message() in a loop,
    then close() at the end. Three methods, nothing more -- the smallest thing
    every possible source (sim, serial, replay) can promise to deliver is a
    stream of raw MAVLink messages, so that's all this interface demands.
    """

    @abstractmethod
    def connect(self) -> None:
        """Open the underlying transport so messages can be read.

        Cheap and non-committal. For UDP this just binds the socket; it does
        NOT wait for the vehicle to say hello. Whether data is actually flowing
        is a link-health question, and that judgment lives downstream -- so a
        silent wire at startup is treated exactly like a silent wire mid-flight,
        not as a special "failed to connect" case here.
        """
        ...

    @abstractmethod
    def get_message(self) -> Optional[MavlinkMessage]:
        """Return the next raw message, or None if none is waiting right now.

        Non-blocking: returns instantly either way, so the caller's loop is
        never frozen waiting on a quiet wire. (A blocking call here would let a
        silent source freeze the whole server -- including the very code meant
        to notice the link went quiet.)

        None means only "nothing this instant" -- NOT "disconnected." With UDP,
        brief silence is normal and carries no meaning; deciding when *sustained*
        silence means the link is lost is a downstream judgment (link health),
        never this layer's call.

        Returns whatever arrived, of any type -- no filtering. The source does
        not know which message types downstream cares about, and keeping it that
        ignorant is what keeps the seam swappable.
        """
        ...

    @abstractmethod
    def close(self) -> None:
        """Release the transport. Safe to call even if never opened or already closed."""
        ...


class UdpMavlinkSource(TelemetrySource):
    """Reads MAVLink from a UDP endpoint -- v1's ArduPilot SITL stream.

    The connection string is the single knob, and it's the only thing that
    changes between talking to SITL and, say, a UDP-bridged telemetry radio.
    It's injected at construction (dependency injection) rather than hard-coded,
    so the same class serves every UDP endpoint. Defaults to where SITL
    broadcasts under MAVProxy.
    """

    def __init__(self, connection_string: str = "udpin:localhost:14550") -> None:
        self._connection_string = connection_string
        self._conn: Optional[mavutil.mavfile] = None

    def connect(self) -> None:
        # 'udpin:' binds and listens on the port and returns immediately -- it
        # does not wait for a packet -- so this can't hang even if SITL is down.
        self._conn = mavutil.mavlink_connection(self._connection_string)

    def get_message(self) -> Optional[MavlinkMessage]:
        if self._conn is None:
            raise RuntimeError("connect() must be called before get_message()")
        # blocking=False  -> take a buffered message if one's ready, else None now.
        # no type= filter  -> hand up every message type, untouched.
        return self._conn.recv_match(blocking=False)

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None
