/**
 * Shelter/refuge roster for the tehri-dam-breach scene, mirroring
 * delhiMetroShelters.js's exact shape (id/name/lat/lng + `footprint` +
 * `metadata`) so MapLibreEngine's existing shelter-safe-zone rendering
 * (buildShelterFootprint, renderShelterCardCanvas, etc. — see
 * mapEngineCore.js) works unmodified against this roster too.
 *
 * Unlike delhiMetroShelters.js's underground metro stations, these are
 * real, large, elevated/robust SURFACE facilities along the real
 * Bhagirathi\u2192Ganga flood corridor (Rishikesh \u2192 Haridwar \u2192 Roorkee \u2192
 * Muzaffarnagar \u2192 Meerut) — chosen because they are large, well above
 * the immediate floodplain, and realistically capable of absorbing an
 * evacuation surge (a major hospital campus, a large university
 * campus, a railway station, a district hospital, a cantonment area),
 * not because they are literally underground like the Delhi roster.
 * Coordinates are approximate best-effort placements from general
 * geographic knowledge of each site (same disclosure standard as
 * damCorridorLandmarks.js), not freshly re-verified survey data.
 */

export const DAM_SHELTER_IDS = [
  'aiims-rishikesh',
  'haridwar-railway-station',
  'iit-roorkee-campus',
  'muzaffarnagar-district-hospital',
  'meerut-cantonment',
];

// Haridwar Railway Station is the deliberate pick, not arbitrary: it's
// the roster's shelter closest to the Ganga's immediate floodbank
// (Har Ki Pauri sits ~0.4km away) and directly astride the corridor's
// own low-lying approach roads, so once those roads are submerged
// (this scene's own version of the security-attack scene's Kartavya
// Path forced-jam beat, gated the same way — see
// forcedJamActivationLabel below) it's the most defensible "this one
// becomes unreachable first" choice among the five, same reasoning
// style delhiMetroShelters.js uses for its own pick.
export const DAM_INACCESSIBLE_SHELTER_ID = 'haridwar-railway-station';

export const DAM_SHELTERS = [
  {
    id: 'aiims-rishikesh',
    name: 'AIIMS Rishikesh',
    lat: 30.1024,
    lng: 78.2837,
    // 300-acre hospital campus (960-bed hospital + medical college) —
    // the largest, most robust structure in this roster, footprint
    // sized/oriented as a broad campus block rather than a single
    // building.
    footprint: { xSemiAxisKm: 0.35, ySemiAxisKm: 0.25, bearingDeg: 30, jitterFraction: 0.14 },
    metadata: {
      structuralRating: 'very-high',
      feasibilityNote:
        'A 960-bed tertiary hospital and medical college on a 300-acre campus, set back from the immediate Ganga floodbank on higher ground \u2014 multiple large modern buildings, on-site trauma/ICU capacity and a helipad make it the strongest single asset in this roster.',
    },
  },
  {
    id: 'haridwar-railway-station',
    name: 'Haridwar Railway Station',
    lat: 29.9425,
    lng: 78.1696,
    // Long, narrow platform-and-concourse footprint, oriented along
    // the rail line rather than a compact block.
    footprint: { xSemiAxisKm: 0.18, ySemiAxisKm: 0.06, bearingDeg: 100, jitterFraction: 0.12 },
    metadata: {
      structuralRating: 'moderate',
      feasibilityNote:
        'A major North Railway junction station with large covered platforms and concourse space \u2014 real capacity, but it sits directly on the Ganga floodplain barely half a kilometre from Har Ki Pauri, which is exactly why this scenario marks it inaccessible once the corridor\u2019s approach roads flood (see DAM_INACCESSIBLE_SHELTER_ID above).',
    },
  },
  {
    id: 'iit-roorkee-campus',
    name: 'IIT Roorkee Main Campus',
    lat: 29.8656,
    lng: 77.8951,
    // Large historic campus (365+ acres) — broad, roughly rectangular
    // footprint reflecting its real quadrangle layout.
    footprint: { xSemiAxisKm: 0.4, ySemiAxisKm: 0.3, bearingDeg: 10, jitterFraction: 0.12 },
    metadata: {
      structuralRating: 'very-high',
      feasibilityNote:
        'One of India\u2019s oldest engineering institutes, on a large elevated campus set back from the Ganga canal system \u2014 substantial colonial-era and modern buildings, hostel capacity, and its own infrastructure/power backup make it a strong regional refuge point.',
    },
  },
  {
    id: 'muzaffarnagar-district-hospital',
    name: 'Muzaffarnagar District Hospital',
    lat: 29.4746,
    lng: 77.7042,
    footprint: { xSemiAxisKm: 0.12, ySemiAxisKm: 0.08, bearingDeg: 15, jitterFraction: 0.16 },
    metadata: {
      structuralRating: 'moderate',
      feasibilityNote:
        'The district\u2019s main public hospital \u2014 real emergency/inpatient capacity, but a smaller and older facility than the Rishikesh/Roorkee campuses, and closer to the plains floodplain the attenuating surge reaches by this phase.',
    },
  },
  {
    id: 'meerut-cantonment',
    name: 'Meerut Cantonment Area',
    lat: 28.9963,
    lng: 77.7241,
    // Broad cantonment area — the widest, most diffuse footprint here,
    // representing "the cantonment's higher, better-built zone" rather
    // than one single building.
    footprint: { xSemiAxisKm: 0.3, ySemiAxisKm: 0.22, bearingDeg: 45, jitterFraction: 0.14 },
    metadata: {
      structuralRating: 'high',
      feasibilityNote:
        'A large military cantonment area with well-built infrastructure and organized logistics \u2014 realistically the staging point NDRF/Army units would use for the NCR-approach phase of a response, on ground well above the Hindon floodplain.',
    },
  },
];

export default DAM_SHELTERS;