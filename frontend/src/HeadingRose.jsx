// Heading rose: a fixed compass card (N up) with a neon needle that rotates to
// the drone's heading, plus the numeric heading below. Top-center of the HUD.
// Plain trig in the screen plane -- no Cesium frame involved.

// Tick marks every 30 degrees around the ring.
const TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * 30 * Math.PI) / 180
  const x1 = 50 + 38 * Math.sin(a)
  const y1 = 50 - 38 * Math.cos(a)
  const x2 = 50 + 33 * Math.sin(a)
  const y2 = 50 - 33 * Math.cos(a)
  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="rose__tick" />
})

export default function HeadingRose({ v }) {
  const hdg = v?.heading_deg ?? v?.yaw_deg
  const known = hdg != null
  const h = known ? hdg : 0

  return (
    <div className="inst inst--heading">
      <div className="inst__label">Heading</div>
      <svg viewBox="0 0 100 100" className="rose__svg">
        <circle cx="50" cy="50" r="38" className="rose__ring" />
        {TICKS}
        <text x="50" y="16" className="rose__card rose__card--n">N</text>
        <text x="84" y="50" className="rose__card">E</text>
        <text x="50" y="84" className="rose__card">S</text>
        <text x="16" y="50" className="rose__card">W</text>
        {/* Needle points where the nose points: 0deg = up = N, clockwise. */}
        <g transform={`rotate(${h} 50 50)`}>
          <polygon points="50,15 45,52 55,52" className="rose__needle" />
        </g>
      </svg>
      <div className="rose__readout">{known ? `${Math.round(h)}°` : '—'}</div>
    </div>
  )
}
