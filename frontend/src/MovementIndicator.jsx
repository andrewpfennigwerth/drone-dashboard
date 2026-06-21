// Translational-velocity indicator: a dot that rides away from center in the
// direction the drone is MOVING, relative to its own nose (up = forward, down =
// back, left/right = lateral), distance from center = speed, centered when still.
// It complements the banking model (which shows attitude) by showing motion.
//
// Body-frame: we rotate the world velocity (north, east) onto the nose/right axes
// using yaw, so "forward" is always up regardless of which way the drone faces.
// This is plain N/E math -- it does NOT touch Cesium's frame, so the 90-deg map
// quirk doesn't apply here.

const FULL_SCALE_MS = 12 // speed (m/s) that drives the dot to the square's edge
const HALF = 40 // px from center to the outer edge, in the 100x100 viewBox

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

export default function MovementIndicator({ v }) {
  const vn = v?.velocity_north_ms
  const ve = v?.velocity_east_ms
  const known = vn != null && ve != null

  let fwdPx = 0
  let rightPx = 0
  if (known) {
    const yaw = ((v.yaw_deg ?? v.heading_deg ?? 0) * Math.PI) / 180
    const forward = vn * Math.cos(yaw) + ve * Math.sin(yaw) // onto the nose axis
    const right = -vn * Math.sin(yaw) + ve * Math.cos(yaw) // onto the right axis
    const k = HALF / FULL_SCALE_MS
    fwdPx = clamp(forward * k, -HALF, HALF)
    rightPx = clamp(right * k, -HALF, HALF)
  }
  const cx = 50 + rightPx
  const cy = 50 - fwdPx // up = forward

  return (
    <div className="inst inst--motion">
      <div className="inst__label">Motion</div>
      <svg viewBox="0 0 100 100" className="motion__svg">
        <text x="50" y="8" className="motion__tick">FWD</text>
        <rect x="10" y="10" width="80" height="80" className="motion__box" />
        <rect x="35" y="35" width="30" height="30" className="motion__box motion__box--inner" />
        <line x1="50" y1="12" x2="50" y2="88" className="motion__cross" />
        <line x1="12" y1="50" x2="88" y2="50" className="motion__cross" />
        <circle
          cx={cx}
          cy={cy}
          r="4.5"
          className={`motion__dot${known ? '' : ' motion__dot--idle'}`}
        />
      </svg>
    </div>
  )
}
