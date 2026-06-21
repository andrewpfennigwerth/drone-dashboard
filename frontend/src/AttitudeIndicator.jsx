// Attitude indicator (artificial horizon) from roll/pitch. A fixed aircraft
// reference over a sky/ground card that rolls and pitches with the vehicle.
// Bottom-left of the HUD.
//
// The horizon group is transformed `rotate(-roll) translate(0, pitch*k)`: the
// pitch shift (applied first, in the horizon's own frame) moves it perpendicular
// to the line, then roll rotates the whole card. If roll or pitch reads inverted
// on screen, negate that term -- the classic sign tweak.

const PITCH_K = 1.3 // screen px per degree of pitch

export default function AttitudeIndicator({ v }) {
  const known = v?.roll_deg != null && v?.pitch_deg != null
  const roll = known ? v.roll_deg : 0
  const pitch = known ? v.pitch_deg : 0

  return (
    <div className="inst inst--attitude">
      <div className="inst__label">Attitude</div>
      <svg viewBox="0 0 100 100" className="adi__svg">
        <defs>
          <clipPath id="adiClip">
            <circle cx="50" cy="50" r="38" />
          </clipPath>
        </defs>
        <g clipPath="url(#adiClip)">
          <g transform={`rotate(${-roll} 50 50) translate(0 ${pitch * PITCH_K})`}>
            <rect x="-100" y="-160" width="300" height="210" className="adi__sky" />
            <rect x="-100" y="50" width="300" height="210" className="adi__ground" />
            <line x1="-100" y1="50" x2="200" y2="50" className="adi__horizon" />
          </g>
        </g>
        {/* Fixed rim + aircraft reference (wings + center dot). */}
        <circle cx="50" cy="50" r="38" className="adi__rim" />
        <line x1="34" y1="50" x2="44" y2="50" className="adi__ref" />
        <line x1="56" y1="50" x2="66" y2="50" className="adi__ref" />
        <circle cx="50" cy="50" r="1.6" className="adi__dot" />
      </svg>
    </div>
  )
}
