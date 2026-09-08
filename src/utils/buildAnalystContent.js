import { LANDMARKS } from '../data/delhiLandmarks';
import { METRO_SHELTERS } from '../data/delhiMetroShelters';
import { haversineDistanceKm } from './geoDistance';

// Fallback impact point, matching MapLibreView.jsx's own FALLBACK_CENTER —
// used only if a scenario's T+0 keyframe doesn't define impactPoint.
const FALLBACK_IMPACT_POINT = { lat: 28.6134, lng: 77.2096 };

function resolveImpactPoint(scenario) {
  const t0 = Array.isArray(scenario.timeline) ? scenario.timeline[0] : null;
  return t0?.impactPoint || FALLBACK_IMPACT_POINT;
}

/**
 * Nearest 1-3 real landmarks to the scenario's impact point, for the
 * analyst response's opening paragraph. Sourced entirely from
 * delhiLandmarks.js — never hand-duplicated copy.
 */
function nearestLandmarks(impactPoint, count = 3) {
  return [...LANDMARKS]
    .map((landmark) => ({ ...landmark, distanceKm: haversineDistanceKm(impactPoint, landmark) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, count);
}

/**
 * Inline stat block — same four figures Quick Analytics used to show
 * (evac time / overload % / risk zones / shelter count), sourced from
 * `scenario.comparisonStats` and the live merged map state, not a new
 * data source.
 */
export function buildStatBlock(scenario, mapState, interventionApplied) {
  const stats = scenario.comparisonStats;
  return [
    { label: 'Evac time', value: `${interventionApplied ? stats.evacTimeAfter : stats.evacTimeBefore} min` },
    { label: 'Overload', value: `${interventionApplied ? stats.overloadAfter : stats.overloadBefore}%` },
    { label: 'Risk zones', value: `${interventionApplied ? stats.riskZonesAfter : stats.riskZonesBefore}` },
    { label: 'Shelters', value: `${mapState?.shelters?.length ?? 0}` },
  ];
}

/**
 * Roads-nearby list. `security-attack.json`'s baseline.roads entries only
 * carry an id + status + raw coordinates (no name field) — MapLibreView's
 * live-queried, named `roadCandidatesRef` data only exists once the real
 * map has mounted and queried actual OSM road features, which isn't
 * available at the moment this initial chat response is composed. As a
 * documented, honest simplification for this static chat copy, each road
 * is labeled by its status plus the nearest real landmark to its
 * midpoint (still real, sourced data — just not the live OSM road name).
 */
export function buildRoadsNearby(scenario, mapState) {
  const roads = mapState?.roads || [];
  return roads
    .filter((road) => road.status === 'blocked' || road.status === 'congested')
    .map((road) => {
      const coords = road.coords || [];
      const mid = coords.length
        ? {
            lat: coords.reduce((sum, c) => sum + c[0], 0) / coords.length,
            lng: coords.reduce((sum, c) => sum + c[1], 0) / coords.length,
          }
        : null;
      const nearest = mid ? nearestLandmarks(mid, 1)[0] : null;
      return {
        id: road.id,
        status: road.status,
        label: nearest ? `Route near ${nearest.name}` : `Route ${road.id}`,
      };
    });
}

/**
 * Shelters-in-range list — sourced from delhiMetroShelters.js's real,
 * named METRO_SHELTERS roster (not the legacy s1/s2/s3 baseline.shelters
 * ids), sorted nearest-first from the scenario's impact point.
 */
export function buildSheltersInRange(scenario, count = 5) {
  const impactPoint = resolveImpactPoint(scenario);
  return [...METRO_SHELTERS]
    .map((shelter) => ({
      ...shelter,
      distanceKm: haversineDistanceKm(impactPoint, shelter),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, count);
}

/**
 * Full content bundle for the analyst-response chat turn (Section 6).
 */
export function buildAnalystContent(scenario, mapState, interventionApplied, causalFactors) {
  const impactPoint = resolveImpactPoint(scenario);
  const landmarks = nearestLandmarks(impactPoint, 3);

  const landmarkNames = landmarks.map((l) => l.name);
  const headline =
    landmarkNames.length > 0
      ? `Scenario active: ${scenario.name}. Impact centered near ${landmarkNames.join(', ')}.`
      : `Scenario active: ${scenario.name}.`;

  return {
    headline,
    stats: buildStatBlock(scenario, mapState, interventionApplied),
    roads: buildRoadsNearby(scenario, mapState),
    shelters: buildSheltersInRange(scenario),
    causalFactors,
  };
}

export default buildAnalystContent;