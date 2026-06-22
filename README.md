# Drone Dashboard

A read-only ground control station (GCS): it ingests live MAVLink telemetry from a
simulated drone and shows an operator a real-time, map-based picture of vehicle
state on a 3D globe. It observes; it never commands the vehicle — read-only is a
deliberate scope decision.

> One-liner: a lightweight ground control station that ingests live MAVLink
> telemetry and gives an operator a real-time, map-based picture of vehicle state
> and link health.

<!-- TODO: demo GIF here -->

## What it does

- Ingests live **MAVLink** over UDP from a simulated UAV (ArduPilot SITL):
  `HEARTBEAT`, `GLOBAL_POSITION_INT`, `ATTITUDE`, `SYS_STATUS`, `GPS_RAW_INT`.
- Folds raw messages into a clean `VehicleState` (SI units, keyed by system ID),
  with **every unit conversion centralized in one tested reducer**.
- Broadcasts state snapshots to the browser over a WebSocket at a fixed ~5 Hz tick
  (decoupled from how fast MAVLink arrives).
- Renders it on a **3D CesiumJS globe** in a dark-ops tactical style:
  - the drone as a minimal neon quad that **banks with its real roll/pitch/yaw**,
  - a glowing breadcrumb **trail** and a **follow camera**,
  - **glass-cockpit instruments** around the edge — heading rose, artificial
    horizon, battery bar, and a translational-velocity ("motion") indicator,
  - **dark / satellite** basemap toggle and a **3D buildings** toggle (skyline).

## Architecture

```
ArduPilot SITL
   │  MAVLink over UDP (udp:localhost:14550)
   ▼
TelemetrySource     swappable seam — UDP sim today; serial hardware / log replay later.
   │  raw MAVLink   Nothing downstream knows which source is running.
   ▼
Reducer  ──►  VehicleState   pure function; all unit conversions live here; state in clean SI.
   │
   ▼
FastAPI backend     background ingest task; broadcasts JSON snapshots over WS at ~5 Hz;
   │  WebSocket      GET /api/state for a one-shot snapshot.
   ▼
React + CesiumJS    WS hook → store → 3D globe, banking drone, trail, instrument HUD.
```

## Tech stack

- **Backend:** Python 3.13, pymavlink, FastAPI, uvicorn, pytest
- **Frontend:** React 18, Vite, CesiumJS (via Cesium ion)
- **Simulator:** ArduPilot SITL

## Prerequisites

- Python 3.11+ and Node 18+
- [ArduPilot SITL](https://ardupilot.org/dev/docs/sitl-simulator-software-in-the-loop.html)
- A free [Cesium ion](https://cesium.com/ion) access token (for terrain, satellite
  imagery, and 3D buildings)

## Setup

```bash
# Backend: create the virtualenv and install deps (from the repo root)
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt

# Frontend
cd frontend
npm install
cp .env.example .env.local   # then paste your Cesium ion token into .env.local
```

`.env.local` holds your ion token and is gitignored, so it never enters the repo.

## Running it

Three terminals, started in this order:

```bash
# 1) ArduPilot SITL (your install; vehicle type and location are your choice)
cd ~/projects/ardupilot/Tools/autotest
./sim_vehicle.py -v ArduCopter --custom-location=40.7128,-74.0060,10,0 --console --map

# 2) Backend (from the repo root)
.venv/bin/python -m uvicorn gcs.server:app --reload

# 3) Frontend
cd frontend && npm run dev      # http://localhost:5173
```

Then arm and fly a mission from the MAVProxy console. (On a cold start, the EKF
needs a couple of minutes to get a global GPS fix before position streams.)

## Tests

```bash
.venv/bin/python -m pytest      # parsing / state layer
```

## Design notes

- **The source seam stays dumb.** `TelemetrySource` speaks only raw MAVLink off a
  wire — it doesn't know what `VehicleState` is. That ignorance is what makes the
  sim / serial-hardware / log-replay sources interchangeable. It's the one real
  architectural decision in the project.
- **Units convert in exactly one place** (the reducer); state is stored in clean
  SI; the frontend formats for display.
- **Every field defaults to `None`, never `0`.** `None` honestly means "haven't
  heard yet"; `0` would lie (e.g. `lat/lon = 0,0` is a real point in the ocean).
- **Read-only by design.** Commanding the vehicle is the obvious next feature, and
  the source seam is exactly where a command path would attach.

## Roadmap

- **Link health:** heartbeat-staleness + messages/sec driving a badge that
  degrades yellow→red, and visibly dimming stale data (a live/lost status line
  exists today as a precursor).
- **Stretch:** CoT/TAK bridge (vehicle → Cursor-on-Target in ATAK); a log-replay
  telemetry source; a STATUSTEXT events feed.
