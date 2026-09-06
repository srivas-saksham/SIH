import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// TEMPORARY (debugging Task 8b's MapLibreView blank-map issue):
// StrictMode's deliberate mount->cleanup->mount double-invoke in dev
// can race MapLibre GL's async style/tile loading against itself on the
// same container. Removed here just to test that hypothesis in
// isolation — restore StrictMode once MapLibreView is confirmed stable,
// don't ship without it long-term.
createRoot(document.getElementById('root')).render(
  <App />,
)