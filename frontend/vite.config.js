import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'

// Minimal React dev/build setup. The dev server runs on http://localhost:5173
// and talks to the Python backend's WebSocket directly (see src/useTelemetry.js).
// vite-plugin-cesium serves Cesium's static assets (its Web Workers, Assets, and
// widget CSS) and sets CESIUM_BASE_URL so Cesium can fetch them at runtime.
export default defineConfig({
  plugins: [react(), cesium()],
})
