/**
 * Real-world footprints for the ~5 Central Delhi landmarks used by
 * MapLibreView's security-attack scene (Task 8b). These are OUR OWN
 * GeoJSON polygons, not OSM building-layer data — see the Task 8b brief:
 * OSM's `building` source-layer isn't reliably tagged with exact names,
 * so we draw our own approximate footprints at real coordinates instead,
 * giving us precise control over color/height/highlight state regardless
 * of what upstream OSM data has (or hasn't) tagged.
 *
 * Coordinates were looked up against real-world references (Wikipedia /
 * OSM-derived listings) as of this task. Footprint SHAPES are
 * approximate rectangles/ellipses, not survey-accurate — the brief
 * explicitly allows this ("doesn't need to be pixel-perfect"). See the
 * per-landmark comments below for source notes and confidence.
 */

// ---------------------------------------------------------------------
// Geo helpers — small-scale planar approximation (fine at city scale;
// these footprints are all under ~3km, well within where the
// equirectangular-ish approximation error is negligible for a demo map).
// ---------------------------------------------------------------------
const METERS_PER_DEG_LAT = 111_320;

function metersToLat(meters) {
  return meters / METERS_PER_DEG_LAT;
}

function metersToLng(meters, atLat) {
  return meters / (METERS_PER_DEG_LAT * Math.cos((atLat * Math.PI) / 180));
}

/** Axis-aligned rectangle footprint, closed ring, [lng, lat] pairs. */
function rectangleFootprint(centerLat, centerLng, widthMeters, depthMeters) {
  const dLat = metersToLat(depthMeters / 2);
  const dLng = metersToLng(widthMeters / 2, centerLat);
  return [
    [
      [centerLng - dLng, centerLat - dLat],
      [centerLng + dLng, centerLat - dLat],
      [centerLng + dLng, centerLat + dLat],
      [centerLng - dLng, centerLat + dLat],
      [centerLng - dLng, centerLat - dLat],
    ],
  ];
}

/** Ellipse/circle footprint (used for the circular Old Parliament House). */
function ellipseFootprint(centerLat, centerLng, radiusMeters, steps = 48) {
  const ring = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const dLat = metersToLat(radiusMeters * Math.sin(angle));
    const dLng = metersToLng(radiusMeters * Math.cos(angle), centerLat);
    ring.push([centerLng + dLng, centerLat + dLat]);
  }
  return [ring];
}

/**
 * Straight east-west corridor strip between two points, inset from each
 * end so it doesn't visually overlap the landmark footprints it
 * connects. Valid for Kartavya Path specifically because the two
 * endpoints sit at nearly the same latitude (~0.0014° apart) — a true
 * bearing-aware corridor isn't needed at this scale/accuracy bar.
 */
function corridorStrip(lat, lngStart, lngEnd, widthMeters, insetMeters) {
  const dLat = metersToLat(widthMeters / 2);
  const insetLng = metersToLng(insetMeters, lat);
  const startLng = Math.min(lngStart, lngEnd) + insetLng;
  const endLng = Math.max(lngStart, lngEnd) - insetLng;
  return [
    [
      [startLng, lat - dLat],
      [endLng, lat - dLat],
      [endLng, lat + dLat],
      [startLng, lat + dLat],
      [startLng, lat - dLat],
    ],
  ];
}

// ---------------------------------------------------------------------
// Landmark coordinates (real-world, looked up) + approximate heights.
// ---------------------------------------------------------------------

// Rashtrapati Bhavan (President's House), Raisina Hill.
// Coord ~28.6143°N, 77.1994°E (matches multiple independent listings).
// Dome height commonly cited around 45m above ground level.
const RASHTRAPATI_BHAVAN = { lat: 28.6143, lng: 77.1994, heightM: 45 };

// Parliament House / Sansad Bhavan — the circular 1927 building (Lutyens
// & Baker), diameter ~173m. Coord ~28.6143°N, 77.2058°E.
// Height to the building cornice is modest (~feet, low-rise) but the
// circular colonnade reads clearly at ~30m in an extruded view.
const OLD_PARLIAMENT_HOUSE = { lat: 28.6143, lng: 77.2058, heightM: 30 };

// New Parliament Building (opened 2023), immediately adjacent/east of the
// old building on Rafi Marg. Coord 28.61722°N, 77.21000°E — sourced
// directly from its Wikipedia infobox, including its official height
// figure of 39.6m.
const NEW_PARLIAMENT_BUILDING = { lat: 28.61722, lng: 77.2100, heightM: 39.6 };

// India Gate, at the eastern end of Kartavya Path (formerly Rajpath).
// Coord ~28.6129°N, 77.2295°E. The arch itself is ~42m tall.
const INDIA_GATE = { lat: 28.6129, lng: 77.2295, heightM: 42 };

// Kartavya Path corridor — the ceremonial boulevard connecting
// Rashtrapati Bhavan to India Gate. Rendered as a thin extruded strip
// rather than a road line so it can share the fill-extrusion layer/paint
// expression with the other landmarks.
const KARTAVYA_PATH_LAT = (RASHTRAPATI_BHAVAN.lat + INDIA_GATE.lat) / 2;

export const LANDMARK_IDS = [
  'rashtrapati-bhavan',
  'parliament-house',
  'new-parliament',
  'india-gate',
  'kartavya-path',
];

/**
 * Builds a fresh FeatureCollection every call (no shared mutable
 * reference) so callers are always free to mutate the result before
 * handing it to `map.getSource('landmarks').setData(...)`.
 */
export function createLandmarksGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'rashtrapati-bhavan',
        properties: {
          id: 'rashtrapati-bhavan',
          name: "Rashtrapati Bhavan (President's House)",
          riskLevel: 'green',
          baseHeight: RASHTRAPATI_BHAVAN.heightM,
        },
        geometry: {
          type: 'Polygon',
          coordinates: rectangleFootprint(RASHTRAPATI_BHAVAN.lat, RASHTRAPATI_BHAVAN.lng, 200, 180),
        },
      },
      {
        type: 'Feature',
        id: 'parliament-house',
        properties: {
          id: 'parliament-house',
          name: 'Parliament House (Sansad Bhavan)',
          riskLevel: 'green',
          baseHeight: OLD_PARLIAMENT_HOUSE.heightM,
        },
        geometry: {
          type: 'Polygon',
          coordinates: ellipseFootprint(OLD_PARLIAMENT_HOUSE.lat, OLD_PARLIAMENT_HOUSE.lng, 85),
        },
      },
      {
        type: 'Feature',
        id: 'new-parliament',
        properties: {
          id: 'new-parliament',
          name: 'New Parliament Building',
          riskLevel: 'green',
          baseHeight: NEW_PARLIAMENT_BUILDING.heightM,
        },
        geometry: {
          type: 'Polygon',
          coordinates: rectangleFootprint(NEW_PARLIAMENT_BUILDING.lat, NEW_PARLIAMENT_BUILDING.lng, 130, 130),
        },
      },
      {
        type: 'Feature',
        id: 'india-gate',
        properties: {
          id: 'india-gate',
          name: 'India Gate',
          riskLevel: 'green',
          baseHeight: INDIA_GATE.heightM,
        },
        geometry: {
          type: 'Polygon',
          coordinates: rectangleFootprint(INDIA_GATE.lat, INDIA_GATE.lng, 60, 60),
        },
      },
      {
        type: 'Feature',
        id: 'kartavya-path',
        properties: {
          id: 'kartavya-path',
          name: 'Kartavya Path',
          riskLevel: 'green',
          baseHeight: 4, // low ceremonial-boulevard strip, not a building
        },
        geometry: {
          type: 'Polygon',
          coordinates: corridorStrip(KARTAVYA_PATH_LAT, RASHTRAPATI_BHAVAN.lng, INDIA_GATE.lng, 70, 160),
        },
      },
    ],
  };
}

/**
 * Returns a deep-cloned copy of the base landmarks FeatureCollection with
 * each feature's `riskLevel` property overwritten per `riskById` (a map
 * of landmark id -> 'green'|'yellow'|'orange'|'red'). Ids not present in
 * `riskById` fall back to 'green'. Safe to pass straight to
 * `source.setData()`.
 */
export function withRiskLevels(riskById) {
  const geojson = createLandmarksGeoJSON();
  geojson.features.forEach((feature) => {
    feature.properties.riskLevel = riskById[feature.properties.id] || 'green';
  });
  return geojson;
}

// Approximate lat/lng used above, for the task's required "flag if any
// should be manually corrected" callout:
// - Rashtrapati Bhavan: 28.6143, 77.1994 — high confidence (multiple
//   independent listings agree to 3-4 decimal places).
// - Parliament House (old, circular): 28.6143, 77.2058 — high confidence,
//   cross-checked against an independent GPS listing (28.61428, 77.20577).
// - New Parliament Building: 28.61722, 77.2100 — high confidence, taken
//   directly from its Wikipedia infobox (also the source of the 39.6m
//   height figure used above).
// - India Gate: 28.6129, 77.2295 — well-known landmark coordinate,
//   high confidence.
// - Kartavya Path corridor: derived (midpoint/span of the two endpoints
//   above), not independently looked up — lowest-confidence entry here,
//   though it only needs to "read" as the boulevard between them.