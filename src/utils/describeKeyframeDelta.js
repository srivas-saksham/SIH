/**
 * Generates a short, human-readable status line describing what changed
 * between two merged scenario states (e.g. "3 buildings escalated to
 * critical"). Used by TimelineScrubber to give the metadata readout a
 * dynamic sentence per keyframe step, computed from the actual data diff
 * rather than hardcoded per scenario.
 */

// Ordered worst -> best is NOT what we want for comparison; we want an
// ordinal so we can tell whether a riskLevel change is an escalation
// (moved toward 'red') or an improvement (moved toward 'green').
const RISK_SEVERITY = { green: 0, yellow: 1, orange: 2, red: 3 };

// Occupancy/capacity ratio at or above this is considered "strained".
const STRAIN_THRESHOLD = 0.85;

function severityOf(level) {
  return RISK_SEVERITY[level] ?? 0;
}

function indexById(list = []) {
  const map = new Map();
  list.forEach((item) => map.set(item.id, item));
  return map;
}

function countBuildingChanges(prevBuildings, nextBuildings) {
  const prevById = indexById(prevBuildings);
  let escalated = 0;
  let deescalated = 0;

  (nextBuildings || []).forEach((building) => {
    const prev = prevById.get(building.id);
    if (!prev || prev.riskLevel === building.riskLevel) return;

    if (severityOf(building.riskLevel) > severityOf(prev.riskLevel)) {
      escalated += 1;
    } else if (severityOf(building.riskLevel) < severityOf(prev.riskLevel)) {
      deescalated += 1;
    }
  });

  return { escalated, deescalated };
}

function countRoadChanges(prevRoads, nextRoads) {
  const prevById = indexById(prevRoads);
  let changed = 0;

  (nextRoads || []).forEach((road) => {
    const prev = prevById.get(road.id);
    if (prev && prev.status !== road.status) {
      changed += 1;
    }
  });

  return changed;
}

function occupancyRatio(shelter) {
  if (!shelter || !shelter.capacity) return 0;
  return shelter.occupancy / shelter.capacity;
}

function countShelterStrainChanges(prevShelters, nextShelters) {
  const prevById = indexById(prevShelters);
  let newlyStrained = 0;
  let eased = 0;

  (nextShelters || []).forEach((shelter) => {
    const prev = prevById.get(shelter.id);
    if (!prev) return;

    const prevStrained = occupancyRatio(prev) >= STRAIN_THRESHOLD;
    const nextStrained = occupancyRatio(shelter) >= STRAIN_THRESHOLD;

    if (!prevStrained && nextStrained) newlyStrained += 1;
    if (prevStrained && !nextStrained) eased += 1;
  });

  return { newlyStrained, eased };
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Compares two merged scenario states and returns a one-line human
 * readable summary of the most significant change between them.
 *
 * @param {object|null} prevState - merged state at the previous keyframe
 *   (or `null` if there is no prior state, e.g. at T+0)
 * @param {object} nextState - merged state at the current keyframe
 * @returns {string} a short status sentence
 */
export function describeDelta(prevState, nextState) {
  if (!nextState) return '';
  if (!prevState) return 'Scenario baseline established.';

  const { escalated, deescalated } = countBuildingChanges(prevState.buildings, nextState.buildings);
  const roadChanges = countRoadChanges(prevState.roads, nextState.roads);
  const { newlyStrained, eased } = countShelterStrainChanges(prevState.shelters, nextState.shelters);

  // Ranked worst-first so the single most severe change wins when several
  // things happen in the same keyframe.
  const candidates = [
    escalated > 0 && { rank: 4, text: `${plural(escalated, 'building')} escalated to higher risk` },
    newlyStrained > 0 && { rank: 3, text: `${plural(newlyStrained, 'shelter')} exceeded capacity strain` },
    roadChanges > 0 && { rank: 2, text: `${plural(roadChanges, 'road')} changed status` },
    deescalated > 0 && { rank: 1, text: `${plural(deescalated, 'building')} de-escalated` },
    eased > 0 && { rank: 1, text: `${plural(eased, 'shelter')} eased below capacity strain` },
  ].filter(Boolean);

  if (candidates.length === 0) {
    return 'No significant change at this checkpoint.';
  }

  candidates.sort((a, b) => b.rank - a.rank);
  return `${candidates[0].text}.`;
}

export default describeDelta;