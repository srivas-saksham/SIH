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

export default parseTimelineIntent;