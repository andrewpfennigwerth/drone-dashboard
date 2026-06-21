// Battery as a bar that fills with remaining %, colored neon -> amber -> red as
// it drains. The numbers stay in the text readout; this is the at-a-glance view.
// Bottom-center of the HUD.

export default function BatteryBar({ v }) {
  const pct = v?.battery_remaining_pct
  const volts = v?.battery_voltage_v
  const known = pct != null
  const level = known ? Math.max(0, Math.min(100, pct)) : 0
  const tone = !known ? 'crit' : level > 50 ? 'ok' : level > 20 ? 'warn' : 'crit'

  return (
    <div className="inst inst--battery">
      <div className="inst__label">Battery</div>
      <div className="batt">
        <div className="batt__track">
          <div
            className={`batt__fill batt__fill--${tone}`}
            style={{ width: `${level}%` }}
          />
        </div>
        <div className="batt__readout">
          {known ? `${Math.round(pct)}%` : '—'}
          {volts != null ? ` · ${volts.toFixed(1)} V` : ''}
        </div>
      </div>
    </div>
  )
}
