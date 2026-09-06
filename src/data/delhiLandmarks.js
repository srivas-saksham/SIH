/**
 * Real-world coordinates for the ~5 Central Delhi landmarks used by
 * MapLibreView's security-attack scene.
 *
 * Task 8b originally drew these as our OWN GeoJSON polygons on a
 * separate 'landmarks' overlay layer, stacked on top of the real
 * OSM-derived 3d-buildings layer. That visually HID the actual building
 * geometry underneath a cruder approximate shape. Task 8c (see
 * MapLibreView.jsx) replaces that overlay entirely with
 * `map.setFeatureState()`, which recolors the REAL building polygon
 * from OpenFreeMap's own vector-tile data directly — so this file now
 * only needs to supply query points (lat/lng) MapLibreView uses to find
 * each landmark's corresponding real building feature via
 * `queryRenderedFeatures`. The polygon/footprint-drawing helpers and
 * `createLandmarksGeoJSON`/`withRiskLevels` exports from the old overlay
 * approach are gone — nothing in the app renders this file's data
 * directly anymore.
 *
 * Coordinates were looked up against real-world references (Wikipedia /
 * OSM-derived listings) as of Task 8b and are unchanged here — see the
 * per-landmark confidence notes at the bottom of this file.
 */

export const LANDMARK_IDS = [
  'rashtrapati-bhavan',
  'parliament-house',
  'new-parliament',
  'india-gate',
  'kartavya-path',
];

/**
 * One query point per landmark. `kartavya-path` uses its midpoint
 * between Rashtrapati Bhavan and India Gate as a stand-in query point —
 * there's no single "building" feature for a boulevard, so this is a
 * best-effort target for queryRenderedFeatures (may land on a nearby
 * building or nothing at all; MapLibreView's lookup tolerates misses).
 */
export const LANDMARKS = [
  {
    id: 'rashtrapati-bhavan',
    name: "Rashtrapati Bhavan (President's House)",
    lat: 28.6143,
    lng: 77.1994,
  },
  {
    id: 'parliament-house',
    name: 'Parliament House (Sansad Bhavan)',
    lat: 28.6143,
    lng: 77.2058,
  },
  {
    id: 'new-parliament',
    name: 'New Parliament Building',
    lat: 28.61722,
    lng: 77.21,
  },
  {
    id: 'india-gate',
    name: 'India Gate',
    lat: 28.6129,
    lng: 77.2295,
  },
  {
    id: 'kartavya-path',
    name: 'Kartavya Path',
    lat: (28.6143 + 28.6129) / 2, // midpoint of Rashtrapati Bhavan / India Gate lat
    lng: (77.1994 + 77.2295) / 2, // midpoint of Rashtrapati Bhavan / India Gate lng
  },
];

// Approximate lat/lng, carried over from Task 8b's confidence notes:
// - Rashtrapati Bhavan: 28.6143, 77.1994 — high confidence (multiple
//   independent listings agree to 3-4 decimal places).
// - Parliament House (old, circular): 28.6143, 77.2058 — high confidence,
//   cross-checked against an independent GPS listing (28.61428, 77.20577).
// - New Parliament Building: 28.61722, 77.2100 — high confidence, taken
//   directly from its Wikipedia infobox.
// - India Gate: 28.6129, 77.2295 — well-known landmark coordinate, high
//   confidence.
// - Kartavya Path: derived midpoint, not independently looked up — a
//   stand-in query point only, lowest-confidence entry here. It may not
//   land on any single OSM building feature at all (the boulevard isn't
//   a building), in which case MapLibreView simply leaves it unresolved
//   rather than crashing — see the isolation-test note in
//   MapLibreView.jsx's tryResolveLandmarkFeatures().