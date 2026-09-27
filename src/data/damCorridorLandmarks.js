/**
 * Real-world coordinates for the 5 landmarks used by the tehri-dam-breach
 * scene's MapLibreEngine landmark-risk overlay — the same
 * queryRenderedFeatures-against-real-building-polygons technique
 * delhiLandmarks.js documents for the security-attack scene, just
 * pointed at a ~180km river corridor instead of one city block.
 *
 * Same confidence convention as delhiLandmarks.js: one query point per
 * landmark, looked up against general geographic knowledge of each
 * site rather than freshly re-verified against a live map this pass —
 * flagged here explicitly (matching this codebase's own honesty
 * standard elsewhere) rather than implied to be survey-accurate.
 * MapLibreEngine's landmark lookup already tolerates a miss (falls back
 * silently — see queryBoxAround's own comment in mapEngineCore.js), so
 * an approximate point costs nothing worse than "this one landmark
 * doesn't get a real-building highlight."
 */

export const DAM_LANDMARK_IDS = [
  'tehri-dam',
  'devprayag-sangam',
  'ram-jhula-rishikesh',
  'har-ki-pauri-haridwar',
  'iit-roorkee',
];

export const DAM_LANDMARKS = [
  {
    id: 'tehri-dam',
    name: 'Tehri Dam',
    lat: 30.3778,
    lng: 78.4806,
  },
  {
    id: 'devprayag-sangam',
    name: 'Devprayag (Bhagirathi\u2013Alaknanda confluence)',
    lat: 30.1462,
    lng: 78.5988,
  },
  {
    id: 'ram-jhula-rishikesh',
    name: 'Ram Jhula, Rishikesh',
    lat: 30.1280,
    lng: 78.3212,
  },
  {
    id: 'har-ki-pauri-haridwar',
    name: 'Har Ki Pauri, Haridwar',
    lat: 29.9457,
    lng: 78.1642,
  },
  {
    id: 'iit-roorkee',
    name: 'IIT Roorkee',
    lat: 29.8656,
    lng: 77.8951,
  },
];

export default DAM_LANDMARKS;