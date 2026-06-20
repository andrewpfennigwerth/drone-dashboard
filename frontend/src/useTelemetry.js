import { useEffect, useState } from 'react'

// The backend's WebSocket. The browser connects across origins (5173 -> 8000),
// which is fine for WebSockets -- no CORS needed. If we later *fetch* /api/state
// over HTTP from here, that's when we'd add CORS on the server.
const WS_URL = 'ws://localhost:8000/ws'

// Reconnect backoff: wait a little after a drop, then a little longer each failed
// try, capped -- so a downed backend isn't hammered, but recovery is quick.
const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 5000

// Opens the WebSocket and keeps it open, reconnecting if it drops. Returns the
// latest snapshot (null until the first arrives) and whether we're connected.
// A snapshot is the whole fleet keyed by system ID, exactly what /ws sends:
//   { "1": { latitude, flight_mode, battery_voltage_v, ... } }
export function useTelemetry() {
  const [snapshot, setSnapshot] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let ws
    let retryMs = RECONNECT_MIN_MS
    let reconnectTimer
    let stopped = false // set on unmount so we don't reconnect after cleanup

    function connect() {
      ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        setConnected(true)
        retryMs = RECONNECT_MIN_MS // good connection -> reset the backoff
      }

      ws.onmessage = (event) => setSnapshot(JSON.parse(event.data))

      ws.onclose = () => {
        setConnected(false)
        if (stopped) return
        reconnectTimer = setTimeout(connect, retryMs)
        retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS) // back off, capped
      }
    }

    connect()

    return () => {
      stopped = true
      clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [])

  return { snapshot, connected }
}
