/**
 * Derives the four causal-factor percentages DIRECTLY from a merged map
 * state, instead of reading a static, hand-authored `causalFactors`
 * object off the scenario/keyframe. This is what makes the chat's "why
 * this area is at risk" bars actually move as the timeline advances —
 * shelter occupancy genuinely falls, roads genuinely clear, buildings
 * genuinely de-escalate in the source data, so the factor bars should
 * reflect that instead of replaying one fixed snapshot forever.
 *
 * Each factor is computed from a real, inspectable signal:
 *
 * - shelterDeficit: average occupancy/capacity ratio across all
 *   shelters in the current merged state, as a percentage. Higher
 *   occupancy relative to capacity = more deficit.
 * - populationDensity: proportion of buildings currently at
 *   orange/red risk (weighted, red counts double), as a percentage.
 *   This scenario has no independent population layer, so building
 *   risk concentration is the closest real proxy for "how much
 *   population pressure is concentrated in this area right now."
 * - roadAccessibility: inverted — proportion of roads that are
 *   currently CLEAR (not blocked/congested), as a percentage, then
 *   inverted so a HIGHER number still means "worse accessibility",
 *   consistent with the other three factors where higher = worse.
 * - infrastructure: blend of shelter strain and blocked-road count,
 *   since "infrastructure" in this model is really "can the built
 *   environment currently support the response" — both shelters and
 *   roads factor in.
 *
 * All four are clamped to [0, 100] and rounded to whole numbers.
 */

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function shelterDeficitFromState(shelters) {
  const list = shelters || [];
  if (list.length === 0) return 0;
  const ratios = list
    .filter((s) => s.capacity)
    .map((s) => s.occupancy / s.capacity);
  if (ratios.length === 0) return 0;
  const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  return clampPercent(avgRatio * 100);
}

function populationPressureFromBuildings(buildings) {
  const list = buildings || [];
  if (list.length === 0) return 0;
  const weight = { red: 2, orange: 1.4, yellow: 0.7, green: 0 };
  const totalWeight = list.reduce((sum, b) => sum + (weight[b.riskLevel] ?? 0), 0);
  const maxPossible = list.length * weight.red;
  if (maxPossible === 0) return 0;
  return clampPercent((totalWeight / maxPossible) * 100);
}

function roadInaccessibilityFromRoads(roads) {
  const list = roads || [];
  if (list.length === 0) return 0;
  const badWeight = { blocked: 1, congested: 0.55, clear: 0 };
  const totalWeight = list.reduce((sum, r) => sum + (badWeight[r.status] ?? 0.3), 0);
  return clampPercent((totalWeight / list.length) * 100);
}

function infrastructureStrainFromState(shelters, roads) {
  const shelterStrain = shelterDeficitFromState(shelters);
  const roadStrain = roadInaccessibilityFromRoads(roads);
  // Infrastructure strain leans slightly more on shelters (60/40) since
  // shelter overload is the more acute operational bottleneck in this
  // model.
  return clampPercent(shelterStrain * 0.6 + roadStrain * 0.4);
}

/**
 * @param {object} mapState - a merged scenario state (buildings, roads,
 *   shelters arrays), e.g. from getMergedStateForIndex.
 * @returns {{shelterDeficit:number, populationDensity:number,
 *   roadAccessibility:number, infrastructure:number}}
 */
export function computeCausalFactors(mapState) {
  if (!mapState) {
    return { shelterDeficit: 0, populationDensity: 0, roadAccessibility: 0, infrastructure: 0 };
  }
  return {
    shelterDeficit: shelterDeficitFromState(mapState.shelters),
    populationDensity: populationPressureFromBuildings(mapState.buildings),
    roadAccessibility: roadInaccessibilityFromRoads(mapState.roads),
    infrastructure: infrastructureStrainFromState(mapState.shelters, mapState.roads),
  };
}

export default computeCausalFactors;