import { LANDMARKS } from '../data/delhiLandmarks';
import { METRO_SHELTERS } from '../data/delhiMetroShelters';
import { haversineDistanceKm } from './geoDistance';
import { computeCausalFactors } from './causalFactors';

// Fallback impact point, matching MapLibreView.jsx's own FALLBACK_CENTER —
// used only if a scenario's T+0 keyframe doesn't define impactPoint.
const FALLBACK_IMPACT_POINT = { lat: 28.6134, lng: 77.2096 };

// Explicit id -> real-world destination naming for the security-attack
// scenario's 5 legacy roads (r1-r5, all originally anonymous stand-ins
// clustered around the Parliament House/Central Vista impact point) plus
// the 2 new roads (r6/r7) added specifically as the Pragati Maidan
// evacuation corridor. Named directly rather than via nearest-landmark
// guessing, per explicit follow-up feedback that "roads nearby" should
// read as PRACTICAL routes to real places, not vague status chips.
// Falls back to nearest-landmark labeling for any road id not in this
// map (e.g. a future scenario's own r1..rN that hasn't been hand-named).
const ROAD_DESTINATIONS = {
  r1: 'Sansad Marg (Parliament House approach)',
  r2: 'Rajpath / Kartavya Path (Parliament frontage)',
  r3: 'Ashoka Road (Parliament perimeter)',
  r4: 'Tilak Marg approach',
  r5: 'Man Singh Road approach',
  r6: 'Copernicus Marg — toward Pragati Maidan',
  r7: 'Bhairon Marg — toward Pragati Maidan',
};

const ROAD_STATUS_ORDER = { blocked: 0, congested: 1, clear: 2 };

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

/** Nearest real metro-shelter to an arbitrary point — used to correlate
 * a road with "which shelter does this actually lead toward", per
 * explicit follow-up feedback that roads-nearby should be tied to
 * shelter access, not just a status chip. */
function nearestShelter(point) {
  if (!point) return null;
  return [...METRO_SHELTERS]
    .map((shelter) => ({ ...shelter, distanceKm: haversineDistanceKm(point, shelter) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

function midpointOf(coords) {
  if (!coords || coords.length === 0) return null;
  return {
    lat: coords.reduce((sum, c) => sum + c[0], 0) / coords.length,
    lng: coords.reduce((sum, c) => sum + c[1], 0) / coords.length,
  };
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
 * Resolves a single road diff/state entry (from mapState.roads, which
 * only ever carries {id, status, coords?}) into the practical,
 * shelter-correlated shape the UI actually wants: a named destination,
 * which real shelter it functionally leads toward, and how far that
 * shelter is. `scenario.baseline.roads` is consulted for coords when the
 * merged entry itself doesn't carry them (keyframes only diff `status`).
 */
function resolveRoadDetail(scenario, road) {
  const baselineRoad = (scenario.baseline?.roads || []).find((r) => r.id === road.id);
  const coords = road.coords || baselineRoad?.coords;
  const mid = midpointOf(coords);
  const shelter = mid ? nearestShelter(mid) : null;
  const destination =
    ROAD_DESTINATIONS[road.id] ||
    (() => {
      const nearest = mid ? nearestLandmarks(mid, 1)[0] : null;
      return nearest ? `Route near ${nearest.name}` : `Route ${road.id}`;
    })();

  return {
    id: road.id,
    status: road.status,
    label: destination,
    shelterName: shelter?.name || null,
    shelterDistanceKm: shelter ? Number(shelter.distanceKm.toFixed(2)) : null,
  };
}

/**
 * Roads-nearby list — now correlated with shelter access per explicit
 * follow-up feedback ("the important roads are the roads TO the
 * shelters"): each entry names its real destination corridor and the
 * nearest real shelter it functionally serves, not just an anonymous
 * status chip. Only returns blocked/congested roads (the "problem"
 * list, used for the compact activation/briefing turn) — see
 * `buildRoadsQueryContent` below for the full, filterable roster used by
 * the dedicated "Roads nearby" button / typed list commands.
 */
export function buildRoadsNearby(scenario, mapState) {
  const roads = mapState?.roads || [];
  return roads
    .filter((road) => road.status === 'blocked' || road.status === 'congested')
    .sort((a, b) => ROAD_STATUS_ORDER[a.status] - ROAD_STATUS_ORDER[b.status])
    .map((road) => resolveRoadDetail(scenario, road));
}

/**
 * Full roads roster for the "Roads nearby" quick-action button and for
 * typed queries like "list all blocked roads" / "which routes are open".
 * Unlike `buildRoadsNearby` (compact, problem-only), this ALWAYS returns
 * every tracked road for the current keyframe, optionally filtered by
 * status, sorted worst-first so the most operationally relevant entries
 * lead.
 *
 * @param {string} filter - 'all' | 'blocked' | 'congested' | 'clear'
 */
export function buildRoadsQueryContent(scenario, mapState, filter = 'all') {
  const roads = mapState?.roads || [];
  const filtered = filter === 'all' ? roads : roads.filter((r) => r.status === filter);
  const details = filtered
    .sort((a, b) => ROAD_STATUS_ORDER[a.status] - ROAD_STATUS_ORDER[b.status])
    .map((road) => resolveRoadDetail(scenario, road));

  const counts = {
    blocked: roads.filter((r) => r.status === 'blocked').length,
    congested: roads.filter((r) => r.status === 'congested').length,
    clear: roads.filter((r) => r.status === 'clear').length,
  };

  const headline =
    details.length === 0
      ? `No ${filter === 'all' ? 'tracked roads' : `${filter} roads`} at this checkpoint.`
      : `${details.length} of ${roads.length} tracked road${roads.length === 1 ? '' : 's'} ${
          filter === 'all' ? 'currently tracked' : `currently ${filter}`
        }. ${counts.blocked} blocked, ${counts.congested} congested, ${counts.clear} clear.`;

  return { headline, roads: details, filter, counts };
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
 * Full shelters roster for the "Shelters in range" quick-action button /
 * typed "list shelters" query — adds each shelter's structural rating
 * and feasibility note (already authored in delhiMetroShelters.js) on
 * top of the compact list's name+distance, since this is the "give me
 * everything" view rather than the inline compact one.
 */
export function buildSheltersQueryContent(scenario) {
  const shelters = buildSheltersInRange(scenario, METRO_SHELTERS.length);
  const headline = `${shelters.length} tracked shelters within range, nearest first.`;
  return { headline, shelters };
}

// ---------------------------------------------------------------------
// "Why this area is at risk" — a real, varying narrative rather than a
// static caption sitting above the bars. Explains which factor(s) are
// currently dominant and ties them to the scenario's actual T+15 attack
// moment (per explicit follow-up: the T+15 attack point was never
// actually mentioned in the UI) so the phrase changes meaningfully
// keyframe to keyframe instead of reading identically every time.
// ---------------------------------------------------------------------

const FACTOR_LABELS = {
  shelterDeficit: 'shelter deficit',
  populationDensity: 'population density pressure',
  roadAccessibility: 'road inaccessibility',
  infrastructure: 'infrastructure strain',
};

const PHASE_COPY = {
  'pre-attack': 'before the attack window opens',
  escalation: 'as the situation escalates ahead of the attack',
  'peak-disruption': 'in the final approach to the attack window',
  attack: 'at the moment of attack',
  'response-recovery': 'in the response and recovery window following the attack',
};

/**
 * @param {object} causalFactors - this keyframe's 4-factor object
 * @param {string} keyframeLabel - e.g. "T+15"
 * @param {string} phase - the keyframe's `phase` field from the scenario
 *   JSON (e.g. 'attack', 'response-recovery'); undefined for scenarios
 *   that haven't been hand-annotated with a phase yet.
 * @param {boolean} isAttack - the keyframe's `isAttack` flag
 */
export function buildWhyAreaAtRisk(causalFactors, keyframeLabel, phase, isAttack) {
  if (!causalFactors) return '';

  const entries = Object.entries(causalFactors).sort((a, b) => b[1] - a[1]);
  const [topKey, topValue] = entries[0];
  const [secondKey, secondValue] = entries[1] || [];

  const phaseClause = phase ? PHASE_COPY[phase] || null : null;
  const timeClause = isAttack
    ? `${keyframeLabel} marks the attack itself`
    : phaseClause
      ? `${keyframeLabel} sits ${phaseClause}`
      : `at ${keyframeLabel}`;

  const leadSentence = `${timeClause}, the dominant driver here is ${FACTOR_LABELS[topKey]} at ${topValue}%.`;

  const secondSentence =
    secondKey && secondValue >= 20
      ? ` ${FACTOR_LABELS[secondKey][0].toUpperCase()}${FACTOR_LABELS[secondKey].slice(1)} is the next-largest contributor at ${secondValue}%.`
      : '';

  return `${leadSentence}${secondSentence}`;
}

/**
 * Full content bundle for the analyst-response chat turn (Section 6).
 * `causalFactors`, if not explicitly passed, is computed live from
 * `mapState` via `computeCausalFactors` rather than requiring a
 * pre-authored static object. `phase`/`isAttack` come straight off the
 * matched T+0 keyframe when present.
 */
export function buildAnalystContent(scenario, mapState, interventionApplied, causalFactors) {
  const impactPoint = resolveImpactPoint(scenario);
  const landmarks = nearestLandmarks(impactPoint, 3);
  const t0 = Array.isArray(scenario.timeline) ? scenario.timeline[0] : null;

  const landmarkNames = landmarks.map((l) => l.name);
  const headline =
    landmarkNames.length > 0
      ? `Scenario active: ${scenario.name}. Impact centered near ${landmarkNames.join(', ')}.`
      : `Scenario active: ${scenario.name}.`;

  const resolvedCausalFactors = causalFactors || computeCausalFactors(mapState);

  return {
    headline,
    stats: buildStatBlock(scenario, mapState, interventionApplied),
    roads: buildRoadsNearby(scenario, mapState),
    shelters: buildSheltersInRange(scenario),
    causalFactors: resolvedCausalFactors,
    whyAtRisk: buildWhyAreaAtRisk(resolvedCausalFactors, t0?.label || 'T+0', t0?.phase, Boolean(t0?.isAttack)),
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
 * that repeats verbatim across keyframes. Explicitly opens by naming the
 * keyframe's own attack/phase status (per follow-up feedback that the
 * T+15 attack moment was never actually surfaced anywhere), so the
 * opening clause alone already differs keyframe to keyframe instead of
 * always reading "T+N update: ...".
 *
 * @param {object} prevState - merged state at the previous keyframe
 * @param {object} nextState - merged state at the new keyframe
 * @param {object} prevFactors - causal factors at the previous keyframe
 * @param {object} nextFactors - causal factors at the new keyframe
 * @param {string} keyframeLabel - e.g. "T+15"
 * @param {string} deltaText - the short describeDelta headline sentence
 * @param {string} [phase] - this keyframe's `phase` field, if authored
 * @param {boolean} [isAttack] - this keyframe's `isAttack` flag
 * @returns {string} a multi-sentence narrative paragraph
 */
export function buildBriefingNarrative(
  prevState,
  nextState,
  prevFactors,
  nextFactors,
  keyframeLabel,
  deltaText,
  phase,
  isAttack,
) {
  const openingClause = isAttack
    ? `${keyframeLabel} — ATTACK WINDOW: `
    : phase
      ? `${keyframeLabel} (${PHASE_COPY[phase] ? PHASE_COPY[phase].replace(/^./, (c) => c.toUpperCase()) : phase}): `
      : `${keyframeLabel} update: `;

  const sentences = [`${openingClause}${deltaText}`];

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

  // Road accessibility trend — count clear vs blocked/congested, AND
  // call out the Pragati Maidan corridor by name when it's the thing
  // keeping evacuation viable (the whole point of adding it).
  const nextRoads = nextState?.roads || [];
  const clearedCount = nextRoads.filter((r) => r.status === 'clear').length;
  const badCount = nextRoads.filter((r) => r.status === 'blocked' || r.status === 'congested').length;
  const corridorOpen = nextRoads.some((r) => (r.id === 'r6' || r.id === 'r7') && r.status === 'clear');
  const parliamentBlocked = nextRoads.some(
    (r) => (r.id === 'r1' || r.id === 'r2' || r.id === 'r3') && r.status === 'blocked',
  );
  if (nextRoads.length > 0) {
    if (clearedCount > 0 && badCount === 0) {
      sentences.push(`All ${clearedCount} tracked evacuation routes in this window are now clear.`);
    } else if (badCount > 0) {
      sentences.push(
        `${badCount} of ${nextRoads.length} tracked route${nextRoads.length === 1 ? '' : 's'} remain blocked or congested.`,
      );
    }
  }
  if (parliamentBlocked && corridorOpen) {
    sentences.push(
      'Parliament-adjacent routes are blocked; the Pragati Maidan corridor remains the viable evacuation path.',
    );
  }

  // Causal-factor movement — call out the single biggest mover so the
  // narrative connects to what the bars below are about to show.
  if (prevFactors && nextFactors) {
    const keys = ['shelterDeficit', 'populationDensity', 'roadAccessibility', 'infrastructure'];
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
        `${FACTOR_LABELS[biggestKey][0].toUpperCase()}${FACTOR_LABELS[biggestKey].slice(1)} has ${direction} ${Math.abs(biggestChange)} points to ${nextFactors[biggestKey]}%.`,
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
 * Also carries a fresh `whyAtRisk` narrative per keyframe (never the
 * static caption the bars used to sit under).
 *
 * @param {object} scenario
 * @param {object} prevState - merged state at the PREVIOUS keyframe
 * @param {object} mapState - merged state at the NEW keyframe
 * @param {boolean} interventionApplied
 * @param {object} prevCausalFactors - previous keyframe's causal factors
 * @param {object} causalFactors - this keyframe's causal factors
 * @param {string} deltaText - the short describeDelta sentence for this step
 * @param {string} keyframeLabel - e.g. "T+15", for the headline
 * @param {string} [phase] - this keyframe's `phase` field, if authored
 * @param {boolean} [isAttack] - this keyframe's `isAttack` flag
 */
/**
 * Content bundle for the 'intervention-response' chat turn (Task 3).
 * Unlike the timeline-briefing content, there is no live "before" state
 * threaded through here — per timelineIntent.js's parseInterventionIntent
 * doc comment, the before/after figures always come from the scenario's
 * single hand-authored `intervention` state and `comparisonStats`, since
 * that's the only intervention outcome this model has authored. `percent`
 * is narrative only (echoed back as "what was asked for"); it does not
 * rescale any of the actual shelter/road/risk figures below.
 *
 * Falls back to `scenario.baseline` if a scenario has no authored
 * `intervention` state at all (e.g. a future scenario not yet hand-tuned
 * for Task 3), so this never throws even off the security-attack path.
 */
export function buildInterventionResponseContent(scenario, percent) {
  const afterState = scenario.intervention || scenario.baseline;
  const stats = scenario.comparisonStats || {};
  const causalFactors = computeCausalFactors(afterState);

  const sentences = [`Intervention applied: shelter capacity increased by ${percent}%.`];
  if (stats.evacTimeBefore != null && stats.evacTimeAfter != null) {
    sentences.push(
      `Estimated evacuation time falls from ${stats.evacTimeBefore} to ${stats.evacTimeAfter} minutes.`,
    );
  }
  if (stats.overloadBefore != null && stats.overloadAfter != null) {
    sentences.push(
      `Network shelter overload eases from ${stats.overloadBefore}% to ${stats.overloadAfter}% of rated capacity.`,
    );
  }
  if (stats.riskZonesBefore != null && stats.riskZonesAfter != null) {
    sentences.push(`Active risk zones drop from ${stats.riskZonesBefore} to ${stats.riskZonesAfter}.`);
  }

  const [topKey, topValue] = Object.entries(causalFactors).sort((a, b) => b[1] - a[1])[0] || [];
  const whyAtRisk = topKey
    ? `Post-intervention, the leading risk driver is ${FACTOR_LABELS[topKey]} at ${topValue}%.`
    : '';

  return {
    headline: sentences.join(' '),
    percent,
    stats: buildStatBlock(scenario, afterState, true),
    roads: buildRoadsNearby(scenario, afterState),
    shelters: buildSheltersInRange(scenario),
    causalFactors,
    whyAtRisk,
  };
}

export function buildTimelineBriefingContent(
  scenario,
  prevState,
  mapState,
  interventionApplied,
  prevCausalFactors,
  causalFactors,
  deltaText,
  keyframeLabel,
  phase,
  isAttack,
) {
  const headline = buildBriefingNarrative(
    prevState,
    mapState,
    prevCausalFactors,
    causalFactors,
    keyframeLabel,
    deltaText,
    phase,
    isAttack,
  );

  return {
    headline,
    stats: buildStatBlock(scenario, mapState, interventionApplied),
    roads: buildRoadsNearby(scenario, mapState),
    shelters: buildSheltersInRange(scenario),
    causalFactors,
    whyAtRisk: buildWhyAreaAtRisk(causalFactors, keyframeLabel, phase, isAttack),
  };
}

export default buildAnalystContent;