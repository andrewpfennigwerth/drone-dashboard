import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// No <StrictMode> yet: in dev it deliberately mounts components twice, which
// would open the WebSocket twice and muddy the picture while we're learning the
// connection. Easy to switch on later -- the hook already cleans up after itself.
createRoot(document.getElementById('root')).render(<App />)
