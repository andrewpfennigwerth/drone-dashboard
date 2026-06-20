import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Minimal React dev/build setup. The dev server runs on http://localhost:5173
// and talks to the Python backend's WebSocket directly (see src/useTelemetry.js).
export default defineConfig({
  plugins: [react()],
})
