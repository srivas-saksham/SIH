import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // maplibre-gl v6 ships ESM-only and constructs a Web Worker for
    // vector-tile parsing. When Vite pre-bundles maplibre-gl during dev,
    // the worker chunk it needs (maplibre-gl-worker.mjs) doesn't get
    // emitted into .vite/deps, so the worker silently fails to load —
    // no MapLibre `error` event fires (it's a Vite-level resolution
    // failure, not a MapLibre runtime one), tiles never get decoded, and
    // the map never reaches `load`/`idle`. Excluding it here stops Vite
    // from pre-bundling it, so the package's own worker resolution
    // (paired with the explicit setWorkerUrl() call in MapLibreView.jsx)
    // works as intended.
    exclude: ['maplibre-gl'],
  },
})