import { useEffect, useRef, useState } from 'react'
import {
  Ion,
  Viewer,
  Terrain,
  UrlTemplateImageryProvider,
  Cartesian3,
  Cartographic,
  Color,
  Math as CesiumMath,
  CallbackProperty,
  PolylineGlowMaterialProperty,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// Cesium ion serves the 3D world terrain. The token is a credential, so it lives
// in frontend/.env.local (gitignored) and Vite injects it here at build time.
// Only vars prefixed VITE_ are exposed to client code.
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN

// A dark, label-light raster basemap (CARTO "dark matter") draped over the
// terrain. Imagery and terrain are SEPARATE layers: we take the 3D shape from
// ion and the dark pictures from CARTO. That split is the whole "dark ops" look.
const DARK_IMAGERY = {
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  subdomains: 'abcd',
  credit: '(c) OpenStreetMap contributors (c) CARTO',
  maximumLevel: 19,
}

// Where the camera opens before the first fix. Boulder's foothills, so terrain is
// visible right away; once the drone reports a position we follow it instead.
const HOME = { lon: -105.2705, lat: 40.015, height: 9000 }

// Dark-ops accent -- one acid-neon for the blip and the glow trail. Tweak freely.
const NEON = Color.fromCssColorString('#e8ff00')
// Cap the breadcrumb so memory stays bounded on a long flight (plan: trail capped
// at N points). Oldest points fall off the tail.
const TRAIL_MAX_POINTS = 1000

export default function CesiumMap({ snapshot }) {
  const containerRef = useRef(null)

  // Cesium is imperative and lives outside React's render cycle, so we keep its
  // objects in refs -- a mailbox React writes into and Cesium reads from.
  const viewerRef = useRef(null)
  const vehicleRef = useRef(null) // the blip entity
  const positionRef = useRef(null) // latest Cartesian3, or null = no fix yet
  const trailRef = useRef([]) // Cartesian3[] breadcrumb, capped at TRAIL_MAX_POINTS
  const trackRef = useRef(true) // mirror of `track` so the snapshot effect can read it

  const [track, setTrack] = useState(true)

  // --- Build the globe and the two entities ONCE (empty deps = mount only). ---
  useEffect(() => {
    if (!ION_TOKEN) return // no token -> the JSX below shows a setup hint instead

    Ion.defaultAccessToken = ION_TOKEN

    const viewer = new Viewer(containerRef.current, {
      terrain: Terrain.fromWorldTerrain(),
      baseLayerPicker: false,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    })

    // Drop Cesium's default (bright) imagery and drape the dark basemap instead.
    viewer.imageryLayers.removeAll()
    viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider(DARK_IMAGERY),
    )

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(HOME.lon, HOME.lat, HOME.height),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-35), roll: 0 },
    })

    // The trail. A CallbackProperty hands Cesium a live getter: it reads our
    // growing points array every frame, so we never rebuild the entity. The glow
    // material is Cesium's own -- bright core, soft falloff = the neon blip path.
    viewer.entities.add({
      polyline: {
        positions: new CallbackProperty(() => trailRef.current, false),
        width: 3,
        material: new PolylineGlowMaterialProperty({ glowPower: 0.2, color: NEON }),
      },
    })

    // The vehicle. A neon point for Stage 1 -- Stage 2 swaps this for the banking
    // black-body / yellow-rotor symbol. Same CallbackProperty trick for position.
    vehicleRef.current = viewer.entities.add({
      position: new CallbackProperty(() => positionRef.current, false),
      point: {
        pixelSize: 12,
        color: NEON,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
      },
    })

    viewerRef.current = viewer

    // Cesium owns a WebGL context and Web Workers. If we don't destroy it on
    // unmount (or on each Vite hot-reload) those leak and stack up until the
    // browser runs out of WebGL contexts. This cleanup is the whole reason the
    // lifecycle lives in useEffect.
    return () => {
      if (!viewer.isDestroyed()) viewer.destroy()
      viewerRef.current = null
    }
  }, [])

  // --- Push each new snapshot into Cesium. Runs ~5 Hz, whenever data arrives. ---
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !snapshot) return

    // v1 is single-vehicle UI: render the first vehicle in the fleet. State is
    // keyed by system ID, so looping over the entries here is how multi-vehicle
    // would extend -- the door the keyed model keeps open.
    const v = Object.values(snapshot)[0]
    if (!v || v.latitude == null || v.longitude == null) return // no fix -> wait

    // SITL models a FLAT ground at the home altitude, but Cesium draws real
    // terrain -- the two disagree, so a raw sea-level altitude renders the drone
    // clipping into (or under) the real hillside. Instead we anchor to what's on
    // screen: Cesium's terrain height right here, plus altitude_rel_m (height
    // above home). Takeoff then sits on the visible ground and lifts off from it.
    // (Trade-off: "above home" and "above the ground directly below" diverge over
    // big terrain relief -- the AGL-vs-relative-altitude nuance -- fine near home.)
    const ground = viewer.scene.globe.getHeight(
      Cartographic.fromDegrees(v.longitude, v.latitude),
    )
    if (ground === undefined) return // terrain tile here not loaded yet -> wait a frame

    const pos = Cartesian3.fromDegrees(
      v.longitude,
      v.latitude,
      ground + (v.altitude_rel_m ?? 0),
    )
    positionRef.current = pos

    const trail = trailRef.current
    trail.push(pos)
    if (trail.length > TRAIL_MAX_POINTS) trail.shift()

    // Auto-center: lock the camera to the blip the first time we have a position.
    if (trackRef.current && !viewer.trackedEntity) {
      viewer.trackedEntity = vehicleRef.current
    }
  }, [snapshot])

  // --- Auto-center toggle. ---
  useEffect(() => {
    trackRef.current = track
    const viewer = viewerRef.current
    if (!viewer) return
    // Only follow once there's something to follow; before the first fix, the
    // snapshot effect turns it on instead.
    viewer.trackedEntity =
      track && positionRef.current ? vehicleRef.current : undefined
  }, [track])

  if (!ION_TOKEN) {
    return (
      <div style={hint}>
        No Cesium ion token found. Copy <code>frontend/.env.example</code> to{' '}
        <code>.env.local</code>, paste a free token from cesium.com/ion, then
        restart <code>npm run dev</code>.
      </div>
    )
  }

  return (
    <>
      <div ref={containerRef} style={fill} />
      <button style={trackBtn} onClick={() => setTrack((t) => !t)}>
        {track ? '◎ following' : '○ free look'}
      </button>
    </>
  )
}

const fill = { position: 'absolute', inset: 0 }
const trackBtn = {
  position: 'absolute',
  top: '1rem',
  right: '1rem',
  padding: '0.4rem 0.7rem',
  background: 'rgba(8, 12, 16, 0.72)',
  color: '#dbe7f0',
  border: '1px solid rgba(232, 255, 0, 0.5)',
  borderRadius: 6,
  font: '13px/1 system-ui, sans-serif',
  cursor: 'pointer',
}
const hint = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: '2rem',
  textAlign: 'center',
  color: '#9fb3c8',
  font: '14px/1.5 system-ui, sans-serif',
  background: '#0a0f14',
}
