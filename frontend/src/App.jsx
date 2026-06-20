import { useTelemetry } from './useTelemetry.js'
import CesiumMap from './CesiumMap.jsx'

// Raw fix_type is a stable, universal number; labeling it is the display's job
// (the decision we made for GPS) -- so the map lives here, not in the backend.
const GPS_FIX = { 0: 'no GPS', 1: 'no fix', 2: '2D', 3: '3D', 4: 'DGPS', 5: 'RTK float', 6: 'RTK fixed' }

export default function App() {
  const { snapshot, connected } = useTelemetry()

  return (
    <div style={shell}>
      <CesiumMap />
      <div style={hud}>
        <h1 style={title}>Drone Dashboard</h1>
        <ConnectionBanner connected={connected} />
        <Fleet snapshot={snapshot} />
      </div>
    </div>
  )
}

function ConnectionBanner({ connected }) {
  return (
    <p style={{ ...banner, ...(connected ? bannerOk : bannerBad) }}>
      {connected ? '● live' : '● disconnected — reconnecting…'}
    </p>
  )
}

// While disconnected we keep showing the last snapshot (flagged by the banner)
// rather than blanking the screen -- a first taste of "flag stale, don't freeze
// silently." Per-field freshness is the fuller link-health story in M5.
function Fleet({ snapshot }) {
  if (snapshot === null) return <p>Waiting for the first snapshot…</p>
  const vehicles = Object.entries(snapshot)
  if (vehicles.length === 0) return <p>Connected — waiting for a vehicle…</p>
  return vehicles.map(([sysid, v]) => <Vehicle key={sysid} sysid={sysid} v={v} />)
}

function Vehicle({ sysid, v }) {
  return (
    <section>
      <h2>System {sysid}</h2>
      <dl style={grid}>
        <Field label="Mode" value={v.flight_mode} />
        <Field label="Armed" value={v.armed == null ? null : v.armed ? 'YES' : 'no'} />
        <Field label="Battery" value={fmt(v.battery_voltage_v, ' V')} />
        <Field label="Battery %" value={fmt(v.battery_remaining_pct, ' %', 0)} />
        <Field label="Altitude (rel)" value={fmt(v.altitude_rel_m, ' m')} />
        <Field label="Ground speed" value={fmt(v.ground_speed_ms, ' m/s')} />
        <Field label="Heading" value={fmt(v.heading_deg, '°')} />
        <Field label="GPS fix" value={v.gps_fix_type == null ? null : GPS_FIX[v.gps_fix_type] ?? v.gps_fix_type} />
        <Field label="Satellites" value={v.satellites_visible} />
      </dl>
    </section>
  )
}

// null/undefined -> "—": "haven't heard yet" stays visible instead of a fake 0.
// Rounding and units live here, in the display, never in the stored state.
function Field({ label, value }) {
  const shown = value === null || value === undefined ? '—' : value
  return (
    <>
      <dt style={dt}>{label}</dt>
      <dd style={dd}>{shown}</dd>
    </>
  )
}

function fmt(value, unit = '', places = 1) {
  if (value === null || value === undefined) return null
  return value.toFixed(places) + unit
}

// The map fills the viewport; the telemetry HUD floats over it (dark-ops shell).
// This is a restrained first cut -- palette and typography are a theme pass we'll
// design together, not a locked-in look.
const shell = { position: 'relative', height: '100vh', width: '100vw', overflow: 'hidden' }
const hud = {
  position: 'absolute', top: 0, left: 0, margin: '1rem',
  padding: '0.75rem 1rem', maxWidth: 360,
  background: 'rgba(8, 12, 16, 0.72)', color: '#dbe7f0',
  borderRadius: 8, backdropFilter: 'blur(4px)',
  fontFamily: 'system-ui, sans-serif',
}
const title = { fontSize: '1.1rem', margin: '0 0 0.5rem' }
const grid = { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.25rem 1rem' }
const dt = { fontWeight: 600 }
const dd = { margin: 0, fontVariantNumeric: 'tabular-nums' }
const banner = { display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 4, fontSize: '0.9rem' }
const bannerOk = { background: '#e6f4ea', color: '#1e7e34' }
const bannerBad = { background: '#fdecea', color: '#b71c1c' }
