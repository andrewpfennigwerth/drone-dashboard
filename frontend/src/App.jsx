import { useTelemetry } from './useTelemetry.js'
import CesiumMap from './CesiumMap.jsx'

// Raw fix_type is a stable, universal number; labeling it is the display's job
// (the decision we made for GPS) -- so the map lives here, not in the backend.
const GPS_FIX = { 0: 'no GPS', 1: 'no fix', 2: '2D', 3: '3D', 4: 'DGPS', 5: 'RTK float', 6: 'RTK fixed' }

export default function App() {
  const { snapshot, connected } = useTelemetry()

  return (
    <div style={shell}>
      <CesiumMap snapshot={snapshot} />
      <div className="hud">
        <div className="hud__title">GCS // Telemetry</div>
        <LinkStatus connected={connected} />
        <Fleet snapshot={snapshot} />
      </div>
    </div>
  )
}

function LinkStatus({ connected }) {
  return (
    <div className={`link ${connected ? 'link--ok' : 'link--down'}`}>
      <span className="link__dot" />
      {connected ? 'Link live' : 'Link lost — reconnecting'}
    </div>
  )
}

// While disconnected we keep showing the last snapshot (flagged by the link line)
// rather than blanking the screen -- a first taste of "flag stale, don't freeze
// silently." Per-field freshness is the fuller link-health story in M5.
function Fleet({ snapshot }) {
  if (snapshot === null) return <p className="hud__note">Awaiting first snapshot…</p>
  const vehicles = Object.entries(snapshot)
  if (vehicles.length === 0) return <p className="hud__note">Connected — awaiting vehicle…</p>
  return vehicles.map(([sysid, v]) => <Vehicle key={sysid} sysid={sysid} v={v} />)
}

function Vehicle({ sysid, v }) {
  return (
    <section className="vehicle">
      <div className="vehicle__id">System {sysid}</div>
      <dl className="readout">
        <Field label="Mode" value={v.flight_mode} />
        <Field
          label="Armed"
          value={v.armed == null ? null : v.armed ? 'ARMED' : 'DISARMED'}
          accent={v.armed === true}
        />
        <Field label="Battery" value={fmt(v.battery_voltage_v, ' V')} />
        <Field label="Battery %" value={fmt(v.battery_remaining_pct, ' %', 0)} />
        <Field label="Alt (rel)" value={fmt(v.altitude_rel_m, ' m')} />
        <Field label="Ground spd" value={fmt(v.ground_speed_ms, ' m/s')} />
        <Field label="Heading" value={fmt(v.heading_deg, '°')} />
        <Field label="GPS fix" value={v.gps_fix_type == null ? null : GPS_FIX[v.gps_fix_type] ?? v.gps_fix_type} />
        <Field label="Satellites" value={v.satellites_visible} />
      </dl>
    </section>
  )
}

// null/undefined -> "—": "haven't heard yet" stays visible instead of a fake 0.
// Rounding and units live here, in the display, never in the stored state.
function Field({ label, value, accent }) {
  const empty = value === null || value === undefined
  const cls = empty ? 'is-empty' : accent ? 'is-accent' : undefined
  return (
    <>
      <dt>{label}</dt>
      <dd className={cls}>{empty ? '—' : value}</dd>
    </>
  )
}

function fmt(value, unit = '', places = 1) {
  if (value === null || value === undefined) return null
  return value.toFixed(places) + unit
}

// The map fills the viewport; the HUD floats over it. Layout only -- the look
// lives in index.css (the tactical theme).
const shell = { position: 'relative', height: '100vh', width: '100vw', overflow: 'hidden' }
