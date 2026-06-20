import { useEffect, useRef } from 'react'
import {
  Ion,
  Viewer,
  Terrain,
  UrlTemplateImageryProvider,
  Cartesian3,
  Math as CesiumMath,
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

// Where the camera opens. Boulder's foothills, so terrain is visible right away;
// in M4b the camera will follow the vehicle instead of sitting here.
const HOME = { lon: -105.2705, lat: 40.015, height: 9000 }

export default function CesiumMap() {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!ION_TOKEN) return // no token -> the JSX below shows a setup hint instead

    Ion.defaultAccessToken = ION_TOKEN

    // Create the globe once. Each `false` strips a default Cesium widget we don't
    // want cluttering a clean GCS (the clock, timeline, layer picker, search box,
    // help overlay, etc.).
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

    // Point the camera at home with a downward tilt so the terrain reads as 3D.
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(HOME.lon, HOME.lat, HOME.height),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-35), roll: 0 },
    })

    // Cesium owns a WebGL context and Web Workers. If we don't destroy it on
    // unmount (or on each Vite hot-reload) those leak and stack up until the
    // browser runs out of WebGL contexts. This cleanup is the whole reason the
    // lifecycle lives in useEffect.
    return () => {
      if (!viewer.isDestroyed()) viewer.destroy()
    }
  }, [])

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
