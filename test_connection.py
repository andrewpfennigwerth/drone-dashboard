from pymavlink import mavutil
import time

# Connect to MAVProxy's UDP broadcast
connection = mavutil.mavlink_connection('udpin:localhost:14550')

print("Waiting for heartbeat...")
connection.wait_heartbeat()
print(f"Connected — system {connection.target_system}, component {connection.target_component}\n")

while True:
    msg = connection.recv_match(type='GLOBAL_POSITION_INT', blocking=True, timeout=5)

    if msg is None:
        print("No message received — is SITL running?")
        continue

    lat = msg.lat / 1e7
    lon = msg.lon / 1e7
    alt = msg.relative_alt / 1000
    hdg = msg.hdg / 100 if msg.hdg != 65535 else None

    print(f"Lat: {lat:.7f}  Lon: {lon:.7f}  Alt: {alt:.1f}m  Hdg: {hdg}°")

    time.sleep(1)