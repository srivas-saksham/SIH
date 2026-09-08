/**
 * Task 2's intent dispatcher (Section 5 / Task 2 "must deliver"): detects
 * whether typed chat text means "advance the timeline" BEFORE falling
 * through to matchScenario. This is deliberately a small, fixed
 * vocabulary check — not a scoring system like scenarioMatcher — because
 * timeline advancement has exactly 5 valid targets (the real keyframe
 * labels) plus the word "next".
 *
 * Keyframe labels are always "T+<minutes>" (Section 0: 5 keyframes,
 * T+0..T+30), so the recognized variants are generated from whatever
 * labels the active scenario actually has, rather than hardcoded, so
 * this keeps working if a scenario's timeline shape ever changes.
 */

const NEXT_WORDS = ['next', 'advance', 'continue', 'proceed', 'go on', 'move on'];

/** Turns "T+15" into the set of phrasings a person might type for it:
 * "t+15", "t 15", "t plus 15", "t15", "15 min(s)". */
function variantsForLabel(label) {
  const match = /T\+(\d+)/i.exec(label || '');
  if (!match) return [];
  const minutes = match[1];
  return [
    `t+${minutes}`,
    `t ${minutes}`,
    `t plus ${minutes}`,
    `t${minutes}`,
    `${minutes} min`,
    `${minutes} mins`,
    `${minutes} minutes`,
  ];
}

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks typed text against timeline-advancement vocabulary.
 *
 * @param {string} rawInput - what the person typed
 * @param {Array<{label:string}>} keyframes - the active scenario's
 *   timeline (used to build the recognized label variants); may be
 *   undefined/empty if no scenario is active yet, in which case only
 *   "next"-style words are recognized (there's nothing to jump to).
 * @returns {{type:'next'}|{type:'index', index:number}|null} - null
 *   means "this is not timeline-advancement phrasing", i.e. fall
 *   through to matchScenario.
 */
export function parseTimelineIntent(rawInput, keyframes) {
  if (!rawInput) return null;
  const normalized = normalize(rawInput);
  if (!normalized) return null;

  if (NEXT_WORDS.some((word) => normalized === word || normalized === `${word} step`)) {
    return { type: 'next' };
  }

  const safeKeyframes = Array.isArray(keyframes) ? keyframes : [];
  for (let index = 0; index < safeKeyframes.length; index += 1) {
    const variants = variantsForLabel(safeKeyframes[index].label).map(normalize);
    if (variants.includes(normalized)) {
      return { type: 'index', index };
    }
  }

  return null;
}

/**
 * Content-query intent (follow-up ask): typing "list me all the roads
 * nearby", "roads that are blocked", "which routes are open", "show
 * congested paths", "shelters in range", "any safe zones nearby", etc.
 * should re-display that specific block — with the SAME live data the
 * roads/shelters buttons use — without re-running the whole
 * scenario-activation or timeline-advancement flow.
 *
 * Deliberately broad on synonyms (per explicit follow-up: "roads" alone
 * shouldn't be the only recognized word) — any mention of a road/route
 * synonym, or a shelter/refuge synonym, while a scenario is active is
 * treated as this intent; a "list/show/which/what" prefix is no longer
 * REQUIRED (previously it was, which is why phrasings like "roads that
 * are blocked" or "blocked roads" weren't recognized) — it's just one
 * more way to phrase it.
 *
 * @param {string} rawInput
 * @returns {{type:'roads', filter:'all'|'blocked'|'congested'|'clear'}
 *   | {type:'shelters'} | null}
 */
const ROAD_WORDS = /\b(roads?|routes?|streets?|paths?|corridors?|lanes?|highways?)\b/;
const SHELTER_WORDS = /\b(shelters?|refuges?|havens?|safe\s*zones?|relief\s*(centers?|centres?)|camps?)\b/;
const BLOCKED_WORDS = /\b(blocked|closed|shut|impassable|inaccessible)\b/;
const CONGESTED_WORDS = /\b(congested|congestion|jammed|jam|clogged|gridlocked|busy)\b/;
const CLEAR_WORDS = /\b(clear|open|free|accessible|passable|unblocked|available)\b/;

export function parseContentQueryIntent(rawInput) {
  if (!rawInput) return null;
  const normalized = normalize(rawInput);
  if (!normalized) return null;

  const mentionsRoads = ROAD_WORDS.test(normalized);
  const mentionsShelters = SHELTER_WORDS.test(normalized);

  if (mentionsRoads) {
    if (BLOCKED_WORDS.test(normalized)) return { type: 'roads', filter: 'blocked' };
    if (CONGESTED_WORDS.test(normalized)) return { type: 'roads', filter: 'congested' };
    if (CLEAR_WORDS.test(normalized)) return { type: 'roads', filter: 'clear' };
    return { type: 'roads', filter: 'all' };
  }

  if (mentionsShelters) {
    return { type: 'shelters' };
  }

  return null;
}

/**
 * Intervention-command intent (Task 3, Section 2 point 3 / Task 3 spec):
 * typing "increase shelter capacity by 20%", "apply intervention",
 * "deploy more shelters", "boost shelter capacity", etc. while a
 * scenario is active means "apply the scenario's authored intervention
 * state". Deliberately broad on phrasing for the same reason
 * parseContentQueryIntent is broad: a "shelter capacity" / "intervention"
 * / "deploy more shelters" mention is enough, no rigid sentence shape is
 * required.
 *
 * Percentage extraction: pulled from the FIRST number in the text
 * (with or without a trailing "%"/"percent"). Per the confirmed spec
 * (Section 2 point 3), a missing or unparseable number is NOT an error
 * and never produces a clarifying question — it silently defaults to
 * 20. The percentage is narrative only (it's echoed back in the
 * intervention-response headline/badge as "what was asked for"); the
 * actual before/after figures always come from the scenario's single
 * hand-authored `intervention` state and `comparisonStats`, since that's
 * the only intervention outcome this model has authored — the percent
 * is not used to mathematically rescale shelter data.
 *
 * @param {string} rawInput
 * @returns {{type:'intervention', percent:number}|null}
 */
const INTERVENTION_WORDS =
  /\b(intervention|shelter\s*capacity|deploy(ing)?\s+(more|additional|extra)\s+shelters?|boost\s+shelters?|add(ing)?\s+shelters?|expand\s+shelters?|reinforce(ment)?)\b/;
const DEFAULT_INTERVENTION_PERCENT = 20;

export function parseInterventionIntent(rawInput) {
  if (!rawInput) return null;
  const normalized = normalize(rawInput);
  if (!normalized) return null;

  if (!INTERVENTION_WORDS.test(normalized)) return null;

  const numberMatch = /(\d{1,3})\s*(percent|pct)?/.exec(normalized);
  const parsed = numberMatch ? Number.parseInt(numberMatch[1], 10) : NaN;
  const percent = Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : DEFAULT_INTERVENTION_PERCENT;

  return { type: 'intervention', percent };
}

/**
 * "cls" (typed alone, case/whitespace-insensitive) clears the entire
 * chat history — a small terminal-style convenience, checked before
 * every other intent in the dispatcher.
 */
export function isClearChatCommand(rawInput) {
  if (!rawInput) return false;
  return normalize(rawInput) === 'cls';
}

export default parseTimelineIntent;