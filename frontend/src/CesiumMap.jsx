import { useEffect, useRef } from 'react'
import {
  Ion,
  Viewer,
  Terrain,
  UrlTemplateImageryProvider,
  Cartesian3,
  Cartographic,
  Color,
  Math as CesiumMath,
  HeadingPitchRoll,
  Transforms,
  Matrix3,
  CallbackProperty,
  PolylineGlowMaterialProperty,
  sampleTerrainMostDetailed,
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

// Dark-ops accent -- one acid-neon for the rotors and the glow trail. Tweak freely.
const NEON = Color.fromCssColorString('#e8ff00')
// Cap the breadcrumb so memory stays bounded on a long flight (plan: trail capped
// at N points). Oldest points fall off the tail.
const TRAIL_MAX_POINTS = 1000

// Minimal neon quad geometry, in METERS (body frame: x forward, y left, z up).
// Exaggerated far past a real quad so it reads from the chase camera -- think map
// icon, not scale model. Tune freely.
const SPAN = 8 // rotor offset from center along both axes
const ROTOR_RADIUS = 3.5
const ROTOR_THICKNESS = 0.8

export default function CesiumMap({ snapshot, track }) {
  const containerRef = useRef(null)

  // Cesium is imperative and lives outside React's render cycle, so we keep its
  // objects in refs -- a mailbox React writes into and Cesium reads from.
  const viewerRef = useRef(null)
  const vehicleRef = useRef(null) // the body entity (also what the camera tracks)
  const positionRef = useRef(null) // latest Cartesian3, or null = no fix yet
  const orientationRef = useRef(null) // latest body orientation quaternion
  const rotationRef = useRef(null) // Matrix3 of that quaternion, for placing rotors
  const homeGroundRef = useRef(null) // terrain height at takeoff, sampled once
  const samplingRef = useRef(false) // guard so the home-ground sample fires only once
  const trailRef = useRef([]) // Cartesian3[] breadcrumb, capped at TRAIL_MAX_POINTS
  const trackRef = useRef(true) // mirror of `track` so the snapshot effect can read it

  // --- Build the globe, the trail, and the drone ONCE (empty deps = mount only). ---
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

    rotationRef.current = new Matrix3() // filled in per snapshot

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

    // Build one rigid part of the drone. Cesium positions every entity at a single
    // point, so to make a multi-part body that moves AND banks as one object, each
    // part lives at: vehicle position + (its fixed body-frame offset, rotated by
    // the body's orientation). All parts share the one orientation quaternion.
    function addPart(offset, graphics) {
      const tmp = new Cartesian3()
      const out = new Cartesian3()
      return viewer.entities.add({
        position: new CallbackProperty(() => {
          const p = positionRef.current
          if (!p) return undefined
          Matrix3.multiplyByVector(rotationRef.current, offset, tmp) // body->world offset
          return Cartesian3.add(p, tmp, out)
        }, false),
        orientation: new CallbackProperty(() => orientationRef.current, false),
        ...graphics,
      })
    }

    // Minimal neon quad: four rotor discs around a center hub. Every part shares
    // the body orientation and differs only by a body-frame offset, so the whole
    // thing banks as one rigid object.

    // Center hub: a small neon point at the drone's center, and what the camera
    // tracks. Cesium only follows an entity it can compute a bounding sphere for,
    // so the tracked entity MUST have a graphic -- an empty/invisible one is
    // silently skipped, which left the camera stuck at the start. viewFrom is the
    // chase offset in the local east-north-up frame (meters east, north, up).
    vehicleRef.current = addPart(new Cartesian3(0, 0, 0), {
      point: { pixelSize: 5, color: NEON },
      viewFrom: new Cartesian3(0, -200, 110),
    })

    // Four neon rotor discs at the corners (thin cylinders, axis = body up).
    const rotor = {
      cylinder: {
        length: ROTOR_THICKNESS,
        topRadius: ROTOR_RADIUS,
        bottomRadius: ROTOR_RADIUS,
        material: NEON,
      },
    }
    addPart(new Cartesian3(SPAN, SPAN, 0), rotor) // front-left
    addPart(new Cartesian3(SPAN, -SPAN, 0), rotor) // front-right
    addPart(new Cartesian3(-SPAN, SPAN, 0), rotor) // back-left
    addPart(new Cartesian3(-SPAN, -SPAN, 0), rotor) // back-right

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

    // Place everything on ONE consistent vertical datum: the terrain height at the
    // takeoff point (sampled once), plus altitude_rel_m (height above home). This
    // matches SITL's own flat-ground model. Sampling terrain per-point instead --
    // what I did first -- made the trail zigzag and stack a vertical line before
    // takeoff, because terrain height keeps refining as tiles stream in, so the
    // same spot returned different heights at different moments. One fixed
    // reference fixes that and keeps the drone (and the camera following it) smooth.
    if (homeGroundRef.current === null) {
      // Wait for real world terrain. terrainProvider is briefly undefined while it
      // loads, and the placeholder ellipsoid provider has no `availability` -- the
      // optional chain skips both cases, so we just retry on the next snapshot.
      if (!samplingRef.current && viewer.terrainProvider?.availability) {
        samplingRef.current = true
        sampleTerrainMostDetailed(viewer.terrainProvider, [
          Cartographic.fromDegrees(v.longitude, v.latitude),
        ])
          .then(([carto]) => {
            homeGroundRef.current = carto.height
          })
          .catch(() => {
            samplingRef.current = false // not ready -> retry on the next snapshot
          })
      }
      return // hold until we know the ground height
    }

    const pos = Cartesian3.fromDegrees(
      v.longitude,
      v.latitude,
      homeGroundRef.current + (v.altitude_rel_m ?? 0),
    )
    positionRef.current = pos

    // Orientation. yaw_deg is the body's true facing (banks correctly); fall back
    // to heading_deg until ATTITUDE flows, then level if neither is known. If
    // pitch or roll comes out inverted on screen, negate that one line -- MAVLink
    // and Cesium mostly agree on sign, but this is the spot to flip if not.
    // Cesium's heading 0 points a forward (+x) model EAST, but MAVLink yaw 0 is
    // NORTH -- a 90 deg frame offset. Uncorrected it swaps the pitch and roll
    // axes, so forward pitch renders as a sideways tilt (the "flying north looked
    // like going east" bug). Subtracting 90 aligns the frame. If pitch or roll
    // then leans the wrong way, negate that one line.
    const hpr = new HeadingPitchRoll(
      CesiumMath.toRadians((v.yaw_deg ?? v.heading_deg ?? 0) - 90),
      CesiumMath.toRadians(v.pitch_deg ?? 0),
      CesiumMath.toRadians(v.roll_deg ?? 0),
    )
    // headingPitchRollQuaternion bakes in the local east-north-up frame at `pos`,
    // so this quaternion rotates body-frame vectors straight into world (ECEF).
    orientationRef.current = Transforms.headingPitchRollQuaternion(pos, hpr)
    Matrix3.fromQuaternion(orientationRef.current, rotationRef.current)

    const trail = trailRef.current
    trail.push(pos)
    if (trail.length > TRAIL_MAX_POINTS) trail.shift()

    // Auto-center: lock the camera to the drone the first time we have a position.
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

  return <div ref={containerRef} style={fill} />
}

const fill = { position: 'absolute', inset: 0 }
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
