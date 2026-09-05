import securityAttack from '../scenarios/security-attack.json';
import earthquake from '../scenarios/earthquake.json';
import flood from '../scenarios/flood.json';
import genericFallback from '../scenarios/generic-fallback.json';

// All loaded scenario datasets, in priority order. Order matters only as a
// tiebreaker when two scenarios score equally — security scenarios are
// checked first since they're the primary demo use case.
export const scenarios = [securityAttack, earthquake, flood];

export const fallbackScenario = genericFallback;

// Every known scenario, including the fallback, keyed for direct lookup
// (e.g. by the preset chips, which bypass keyword matching entirely).
export const allScenarios = [...scenarios, fallbackScenario];

/**
 * Looks up a scenario by its `id` field. Used for direct/instant scenario
 * switching (preset chips) where we already know exactly which scenario
 * we want and don't need to run it through the keyword matcher.
 *
 * @param {string} id - scenario id, e.g. 'earthquake'
 * @returns {object} the matching scenario dataset, or the generic
 *   fallback scenario if no scenario has that id.
 */
export function getScenarioById(id) {
  return allScenarios.find((scenario) => scenario.id === id) || fallbackScenario;
}

/**
 * Normalizes text for matching: lowercase, strip punctuation, collapse
 * whitespace.
 */
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scores a scenario against user input by counting how many of its
 * keywords appear as substrings of the normalized input. Multi-word
 * keywords count for more, since they're a more specific/confident match.
 */
function scoreScenario(scenario, normalizedInput) {
  let score = 0;
  for (const keyword of scenario.keywords || []) {
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword) continue;
    if (normalizedInput.includes(normalizedKeyword)) {
      const wordCount = normalizedKeyword.split(' ').length;
      score += wordCount > 1 ? 2 : 1;
    }
  }
  return score;
}

/**
 * Matches a free-text user scenario description against the known
 * scenario presets using simple keyword substring matching.
 *
 * Returns the best-scoring scenario object, or the generic fallback
 * scenario if nothing matches (or input is empty).
 *
 * @param {string} userInput - natural language scenario description
 * @returns {object} the matched scenario dataset
 */
export function matchScenario(userInput) {
  if (!userInput || !userInput.trim()) {
    return fallbackScenario;
  }

  const normalizedInput = normalize(userInput);

  let bestScenario = fallbackScenario;
  let bestScore = 0;

  for (const scenario of scenarios) {
    const score = scoreScenario(scenario, normalizedInput);
    if (score > bestScore) {
      bestScore = score;
      bestScenario = scenario;
    }
  }

  return bestScenario;
}

export default matchScenario;