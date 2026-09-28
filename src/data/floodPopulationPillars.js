/**
 * Flood population-entrapment pillars for the tehri-dam-breach scene.
 *
 * ILLUSTRATIVE DEMO DATA ONLY — every population, trapped count, flood
 * depth, ETA and rescue window below is invented-but-plausible, NOT
 * census/hydrology data. `populationTotal` means "people living in the
 * river-adjacent, flood-exposed part of the area" (not the whole
 * town), so trapped / populationTotal is a meaningful share.
 *
 * Positions: each pillar is anchored ON one of tehriDamBreachScene.js's
 * floodPath vertices (`anchor`, [lng, lat] — copied from that path, so
 * they inherit its honesty level: Tehri Dam, Devprayag, Ram Jhula,
 * Raiwala, Har Ki Pauri, IIT Roorkee, Muzaffarnagar and the Meerut
 * approach are named/verified points in that file; the rest are
 * `approximate: true` = the nearest path vertex to the named place,
 * NOT a surveyed coordinate). At runtime the pillar is pushed off the
 * river line by `offsetKm` (perpendicular, to `side` = 1 left / -1
 * right of the flow direction) so the field looks scattered but still
 * hugs the river — see resolvePillarPlacement in
 * components/maplibre/populationPillars.js. offsetKm is kept ≤ 2.5 so
 * every pillar stays inside the ~3 km "near the river" rule.
 *
 * Per-keyframe arrays have 5 entries = T+0, T+5, T+10, T+15, T+30 (the
 * scenario's timeline order). Values are authored and need not be
 * monotonic: hills counts fall late (evacuation), plains keep rising.
 * A pillar is additionally hidden by the renderer until the flood
 * front reaches it, whatever these arrays say.
 *
 * @typedef {object} FloodPillar
 * @property {string} id
 * @property {string} name
 * @property {[number, number]} anchor        [lng, lat] on floodPath
 * @property {boolean} [approximate]          anchor is nearest path vertex, not the place itself
 * @property {number} offsetKm                perpendicular offset off the river line (0.3–2.5)
 * @property {1|-1} side
 * @property {number} populationTotal         exposed residents (illustrative)
 * @property {number[]} trappedByKeyframe     5 entries
 * @property {boolean[]} cutOffByKeyframe     5 entries — all roads out blocked
 * @property {number[]} floodDepthM           5 entries
 * @property {number} arrivalMinutes          flood ETA after breach (real-world, illustrative)
 * @property {number} rescueWindowMin         minutes before the area becomes unreachable/unsurvivable
 * @property {number} vulnerablePct           children + elderly share, %
 * @property {string} nearestShelterId        id from damCorridorShelters.js
 * @property {number} nearestShelterKm        straight-line, from the anchor (rounded)
 * @property {number} shelterDeficit          0–1, how little headroom that shelter has left
 */

/** @type {FloodPillar[]} */
export const FLOOD_PILLARS = [
  {
    id: 'koti-colony',
    name: 'Koti Colony (Dam Township)',
    anchor: [78.4903, 30.3392], approximate: true,
    offsetKm: 0.6, side: 1,
    populationTotal: 5800,
    trappedByKeyframe: [0, 3900, 2100, 900, 300],
    cutOffByKeyframe: [false, true, true, false, false],
    floodDepthM: [0, 7.5, 3.2, 1.1, 0.4],
    arrivalMinutes: 4, rescueWindowMin: 12, vulnerablePct: 18,
    nearestShelterId: 'aiims-rishikesh', nearestShelterKm: 32.7, shelterDeficit: 0.7,
  },
  {
    id: 'bhagirathi-hamlets',
    name: 'Bhagirathi Valley Hamlets',
    anchor: [78.4899, 30.2621], approximate: true,
    offsetKm: 1.4, side: -1,
    populationTotal: 2400,
    trappedByKeyframe: [0, 1650, 1300, 700, 250],
    cutOffByKeyframe: [false, true, true, true, false],
    floodDepthM: [0, 5.5, 4.0, 2.0, 0.8],
    arrivalMinutes: 22, rescueWindowMin: 30, vulnerablePct: 24,
    nearestShelterId: 'aiims-rishikesh', nearestShelterKm: 28.0, shelterDeficit: 0.8,
  },
  {
    id: 'devprayag',
    name: 'Devprayag',
    anchor: [78.5988, 30.1462],
    offsetKm: 0.9, side: 1,
    populationTotal: 7200,
    trappedByKeyframe: [0, 0, 5100, 3800, 1500],
    cutOffByKeyframe: [false, false, true, true, false],
    floodDepthM: [0, 0, 9.5, 6.0, 2.5],
    arrivalMinutes: 55, rescueWindowMin: 45, vulnerablePct: 22,
    nearestShelterId: 'aiims-rishikesh', nearestShelterKm: 30.5, shelterDeficit: 0.75,
  },
  {
    id: 'muni-ki-reti-tapovan',
    name: 'Muni Ki Reti / Tapovan',
    anchor: [78.2944, 30.1074], approximate: true,
    offsetKm: 1.8, side: -1,
    populationTotal: 21000,
    trappedByKeyframe: [0, 0, 11800, 9400, 4600],
    cutOffByKeyframe: [false, false, false, true, false],
    floodDepthM: [0, 0, 5.8, 3.6, 1.4],
    arrivalMinutes: 88, rescueWindowMin: 75, vulnerablePct: 20,
    nearestShelterId: 'aiims-rishikesh', nearestShelterKm: 2.3, shelterDeficit: 0.5,
  },
  {
    id: 'rishikesh-ram-jhula',
    name: 'Rishikesh (Ram Jhula)',
    anchor: [78.3212, 30.1280],
    offsetKm: 0.4, side: 1,
    populationTotal: 34000,
    trappedByKeyframe: [0, 0, 19500, 14200, 6200],
    cutOffByKeyframe: [false, false, true, false, false],
    floodDepthM: [0, 0, 6.8, 4.4, 1.6],
    arrivalMinutes: 85, rescueWindowMin: 70, vulnerablePct: 20,
    nearestShelterId: 'aiims-rishikesh', nearestShelterKm: 4.6, shelterDeficit: 0.4,
  },
  {
    id: 'raiwala',
    name: 'Raiwala',
    anchor: [78.2676, 30.0869],
    offsetKm: 2.1, side: 1,
    populationTotal: 9500,
    trappedByKeyframe: [0, 0, 4300, 3400, 1800],
    cutOffByKeyframe: [false, false, false, true, false],
    floodDepthM: [0, 0, 3.9, 3.0, 1.2],
    arrivalMinutes: 105, rescueWindowMin: 90, vulnerablePct: 21,
    nearestShelterId: 'aiims-rishikesh', nearestShelterKm: 3.4, shelterDeficit: 0.55,
  },
  {
    id: 'haridwar-har-ki-pauri',
    name: 'Haridwar (Har Ki Pauri)',
    anchor: [78.1642, 29.9457],
    offsetKm: 0.7, side: -1,
    populationTotal: 92000,
    trappedByKeyframe: [0, 0, 0, 62400, 66800],
    cutOffByKeyframe: [false, false, false, true, true],
    floodDepthM: [0, 0, 0, 3.9, 3.1],
    arrivalMinutes: 140, rescueWindowMin: 95, vulnerablePct: 22,
    nearestShelterId: 'haridwar-railway-station', nearestShelterKm: 0.4, shelterDeficit: 0.9,
  },
  {
    id: 'jwalapur',
    name: 'Jwalapur',
    anchor: [78.0745, 29.9190], approximate: true,
    offsetKm: 1.6, side: 1,
    populationTotal: 41000,
    trappedByKeyframe: [0, 0, 0, 19800, 24500],
    cutOffByKeyframe: [false, false, false, false, true],
    floodDepthM: [0, 0, 0, 2.6, 2.9],
    arrivalMinutes: 150, rescueWindowMin: 110, vulnerablePct: 20,
    nearestShelterId: 'haridwar-railway-station', nearestShelterKm: 9.7, shelterDeficit: 0.6,
  },
  {
    id: 'roorkee',
    name: 'Roorkee (IIT Side)',
    anchor: [77.8951, 29.8656],
    offsetKm: 1.1, side: -1,
    populationTotal: 56000,
    trappedByKeyframe: [0, 0, 0, 16400, 31200],
    cutOffByKeyframe: [false, false, false, false, false],
    floodDepthM: [0, 0, 0, 1.2, 2.4],
    arrivalMinutes: 205, rescueWindowMin: 150, vulnerablePct: 17,
    nearestShelterId: 'iit-roorkee-campus', nearestShelterKm: 1.1, shelterDeficit: 0.3,
  },
  {
    id: 'muzaffarnagar',
    name: 'Muzaffarnagar (River Edge)',
    anchor: [77.7050, 29.4675],
    offsetKm: 1.9, side: 1,
    populationTotal: 68000,
    trappedByKeyframe: [0, 0, 0, 0, 36400],
    cutOffByKeyframe: [false, false, false, false, false],
    floodDepthM: [0, 0, 0, 0, 2.2],
    arrivalMinutes: 300, rescueWindowMin: 210, vulnerablePct: 18,
    nearestShelterId: 'muzaffarnagar-district-hospital', nearestShelterKm: 2.0, shelterDeficit: 0.5,
  },
  {
    id: 'khatauli',
    name: 'Khatauli',
    anchor: [77.7056, 29.2743], approximate: true,
    offsetKm: 1.3, side: -1,
    populationTotal: 30000,
    trappedByKeyframe: [0, 0, 0, 0, 9600],
    cutOffByKeyframe: [false, false, false, false, false],
    floodDepthM: [0, 0, 0, 0, 1.5],
    arrivalMinutes: 340, rescueWindowMin: 240, vulnerablePct: 19,
    nearestShelterId: 'muzaffarnagar-district-hospital', nearestShelterKm: 22.3, shelterDeficit: 0.6,
  },
  {
    id: 'meerut-approach',
    name: 'Meerut Approach',
    anchor: [77.7064, 28.9845],
    offsetKm: 2.4, side: 1,
    populationTotal: 61000,
    trappedByKeyframe: [0, 0, 0, 0, 9800],
    cutOffByKeyframe: [false, false, false, false, false],
    floodDepthM: [0, 0, 0, 0, 0.9],
    arrivalMinutes: 420, rescueWindowMin: 300, vulnerablePct: 16,
    nearestShelterId: 'meerut-cantonment', nearestShelterKm: 4.3, shelterDeficit: 0.35,
  },
];

export default FLOOD_PILLARS;