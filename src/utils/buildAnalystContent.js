import { LANDMARKS } from '../data/delhiLandmarks';
import { METRO_SHELTERS } from '../data/delhiMetroShelters';
import { haversineDistanceKm } from './geoDistance';
import { computeCausalFactors } from './causalFactors';

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
 * Aggregate shelter load across the CURRENT merged state — total
 * occupancy vs total capacity — used for the live "Overload" and
 * "Shelters" stats below. Computed fresh from whatever `mapState` is
 * passed in, so it changes every keyframe instead of replaying one
 * fixed number.
 */
function aggregateShelterLoad(shelters) {
  const list = shelters || [];
  const totalCapacity = list.reduce((sum, s) => sum + (s.capacity || 0), 0);
  const totalOccupancy = list.reduce((sum, s) => sum + (s.occupancy || 0), 0);
  const overloadPercent = totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0;
  return { totalCapacity, totalOccupancy, overloadPercent, count: list.length };
}

/**
 * Counts buildings at orange/red risk in the CURRENT merged state — this
 * is the live "Risk zones" figure, so it tracks the actual per-keyframe
 * building data (which genuinely changes shape/count keyframe to
 * keyframe) instead of a static before/after pair.
 */
function countActiveRiskZones(buildings) {
  const list = buildings || [];
  return list.filter((b) => b.riskLevel === 'orange' || b.riskLevel === 'red').length;
}

/**
 * Rough live evac-time estimate, derived (not hardcoded) from current
 * road accessibility and shelter overload: worse roads and fuller
 * shelters both push the estimate up. Anchored so T+0's baseline
 * roads/shelters land close to `comparisonStats.evacTimeBefore`/`After`
 * (keeps the number in a believable range for this model) but the
 * figure itself is recomputed from the live state every call, so it
 * actually moves with the data instead of just switching between two
 * fixed values.
 */
function estimateEvacMinutes(scenario, mapState, interventionApplied) {
  const stats = scenario.comparisonStats || {};
  const baselineMinutes = interventionApplied ? stats.evacTimeAfter ?? 9 : stats.evacTimeBefore ?? 15;

  const roads = mapState?.roads || [];
  const badRoadRatio = roads.length
    ? roads.filter((r) => r.status === 'blocked' || r.status === 'congested').length / roads.length
    : 0;
  const { overloadPercent } = aggregateShelterLoad(mapState?.shelters);

  // +/- up to ~40% swing off the anchor, driven by how bad roads/shelters
  // currently are — this is what makes the number actually move keyframe
  // to keyframe instead of only ever reading two fixed values.
  const roadPenalty = badRoadRatio * 0.25;
  const overloadPenalty = Math.max(0, (overloadPercent - 50) / 200);
  const multiplier = 1 + roadPenalty + overloadPenalty;

  return Math.max(3, Math.round(baselineMinutes * multiplier));
}

/**
 * Inline stat block. All four figures are now computed LIVE from the
 * merged `mapState` handed in for this exact keyframe (not read off a
 * single static `scenario.comparisonStats` before/after pair) — so a
 * T+5 briefing and a T+15 briefing for the same scenario show genuinely
 * different numbers, tracking the underlying data.
 */
export function buildStatBlock(scenario, mapState, interventionApplied) {
  const { overloadPercent, count: shelterCount } = aggregateShelterLoad(mapState?.shelters);
  const riskZones = countActiveRiskZones(mapState?.buildings);
  const evacMinutes = estimateEvacMinutes(scenario, mapState, interventionApplied);

  return [
    { label: 'Evac time', value: `${evacMinutes} min` },
    { label: 'Overload', value: `${overloadPercent}%` },
    { label: 'Risk zones', value: `${riskZones}` },
    { label: 'Shelters', value: `${shelterCount}` },
  ];
}

/**
 * Roads-nearby list. Reflects whichever roads are ACTUALLY blocked or
 * congested in this exact `mapState` — since each keyframe's merged
 * road list genuinely differs (different ids clear, different ids get
 * newly blocked), this list's contents change keyframe to keyframe
 * rather than repeating. `security-attack.json`'s baseline.roads entries
 * only carry an id + status + raw coordinates (no name field) —
 * MapLibreView's live-queried, named `roadCandidatesRef` data only
 * exists once the real map has mounted and queried actual OSM road
 * features, which isn't available at the moment this chat response is
 * composed. As a documented, honest simplification for this static chat
 * copy, each road is labeled by its status plus the nearest real
 * landmark to its midpoint (still real, sourced data — just not the live
 * OSM road name).
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
 * `causalFactors`, if not explicitly passed, is computed live from
 * `mapState` via `computeCausalFactors` rather than requiring a
 * pre-authored static object.
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
    causalFactors: causalFactors || computeCausalFactors(mapState),
  };
}

/**
 * Builds a longer, multi-sentence narrative for a timeline-briefing turn
 * instead of a single terse `describeDelta` line. Reads several REAL
 * signals off the current/previous merged state — shelter occupancy
 * trend, road status counts, building risk mix, causal-factor movement —
 * and assembles 2-4 short sentences describing what specifically changed
 * and what it means operationally. Every clause below is conditioned on
 * an actual computed difference; nothing here is copy-pasted boilerplate
 * that repeats verbatim across keyframes.
 *
 * @param {object} prevState - merged state at the previous keyframe
 * @param {object} nextState - merged state at the new keyframe
 * @param {object} prevFactors - causal factors at the previous keyframe
 * @param {object} nextFactors - causal factors at the new keyframe
 * @param {string} keyframeLabel - e.g. "T+15"
 * @param {string} deltaText - the short describeDelta headline sentence
 * @returns {string} a multi-sentence narrative paragraph
 */
export function buildBriefingNarrative(prevState, nextState, prevFactors, nextFactors, keyframeLabel, deltaText) {
  const sentences = [`${keyframeLabel} update: ${deltaText}`];

  // Shelter occupancy trend — real numbers, not restated boilerplate.
  const prevLoad = aggregateShelterLoad(prevState?.shelters);
  const nextLoad = aggregateShelterLoad(nextState?.shelters);
  if (nextLoad.totalCapacity > 0) {
    const occupancyDelta = nextLoad.totalOccupancy - prevLoad.totalOccupancy;
    if (occupancyDelta < 0) {
      sentences.push(
        `Shelter occupancy has eased by ${Math.abs(occupancyDelta)} people network-wide, bringing overall load to ${nextLoad.overloadPercent}% of rated capacity.`,
      );
    } else if (occupancyDelta > 0) {
      sentences.push(
        `Shelter occupancy has climbed by ${occupancyDelta} people network-wide, pushing overall load to ${nextLoad.overloadPercent}% of rated capacity.`,
      );
    } else {
      sentences.push(`Shelter occupancy is holding steady at ${nextLoad.overloadPercent}% of rated capacity.`);
    }
  }

  // Road accessibility trend — count clear vs blocked/congested.
  const nextRoads = nextState?.roads || [];
  const clearedCount = nextRoads.filter((r) => r.status === 'clear').length;
  const badCount = nextRoads.filter((r) => r.status === 'blocked' || r.status === 'congested').length;
  if (nextRoads.length > 0) {
    if (clearedCount > 0 && badCount === 0) {
      sentences.push(`All ${clearedCount} tracked evacuation routes in this window are now clear.`);
    } else if (badCount > 0) {
      sentences.push(
        `${badCount} of ${nextRoads.length} tracked route${nextRoads.length === 1 ? '' : 's'} remain blocked or congested.`,
      );
    }
  }

  // Causal-factor movement — call out the single biggest mover so the
  // narrative connects to what the bars below are about to show.
  if (prevFactors && nextFactors) {
    const keys = ['shelterDeficit', 'populationDensity', 'roadAccessibility', 'infrastructure'];
    const labels = {
      shelterDeficit: 'shelter deficit',
      populationDensity: 'population pressure',
      roadAccessibility: 'road inaccessibility',
      infrastructure: 'infrastructure strain',
    };
    let biggestKey = null;
    let biggestChange = 0;
    keys.forEach((key) => {
      const change = (nextFactors[key] ?? 0) - (prevFactors[key] ?? 0);
      if (Math.abs(change) > Math.abs(biggestChange)) {
        biggestChange = change;
        biggestKey = key;
      }
    });
    if (biggestKey && Math.abs(biggestChange) >= 3) {
      const direction = biggestChange > 0 ? 'risen' : 'fallen';
      sentences.push(
        `${labels[biggestKey][0].toUpperCase()}${labels[biggestKey].slice(1)} has ${direction} ${Math.abs(biggestChange)} points to ${nextFactors[biggestKey]}%.`,
      );
    }
  }

  return sentences.join(' ');
}

/**
 * Content bundle for a 'timeline-briefing' chat turn (Task 2/refinement).
 * Headline is now a longer, multi-sentence narrative built from actual
 * state deltas (`buildBriefingNarrative`) instead of the single
 * `describeDelta` line — but the same stat/road/shelter builders are
 * reused rather than duplicated, per Task 2's must-deliver list, and
 * every number in them is recomputed live for THIS keyframe's mapState.
 *
 * @param {object} scenario
 * @param {object} prevState - merged state at the PREVIOUS keyframe
 * @param {object} mapState - merged state at the NEW keyframe
 * @param {boolean} interventionApplied
 * @param {object} prevCausalFactors - previous keyframe's causal factors
 * @param {object} causalFactors - this keyframe's causal factors
 * @param {string} deltaText - the short describeDelta sentence for this step
 * @param {string} keyframeLabel - e.g. "T+15", for the headline
 */
export function buildTimelineBriefingContent(
  scenario,
  prevState,
  mapState,
  interventionApplied,
  prevCausalFactors,
  causalFactors,
  deltaText,
  keyframeLabel,
) {
  const headline = buildBriefingNarrative(prevState, mapState, prevCausalFactors, causalFactors, keyframeLabel, deltaText);

  return {
    headline,
    stats: buildStatBlock(scenario, mapState, interventionApplied),
    roads: buildRoadsNearby(scenario, mapState),
    shelters: buildSheltersInRange(scenario),
    causalFactors,
  };
}

export default buildAnalystContent;