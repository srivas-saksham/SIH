// Fake, improvised "system telemetry" lines shown during scenario
// activation and timeline advancement (Section 6 of PROJECT_CONTEXT_V3.md
// / follow-up refinement). Genuinely fake content, written to read as
// plausible processing output — never literally true, and not derived
// from any real backend process.

/**
 * Activation cascade — deliberately longer and more granular than the
 * original 7-line version so the "system is working" beat reads as
 * substantial rather than token, per follow-up feedback that the
 * previous cascade felt too short.
 */
export function buildProcessingLines(scenario) {
  return [
    'RESOLVING SCENARIO VECTOR...',
    `SCENARIO MATCH: ${scenario.id} (confidence: high)`,
    'LOADING BASELINE TOPOLOGY...',
    'PARSING IMPACT ZONE GEOMETRY...',
    'CROSS-REFERENCING LANDMARK REGISTRY...',
    'PROJECTING RISK ZONE RADII...',
    'CLASSIFYING STRUCTURE RISK LEVELS...',
    'INDEXING NEARBY SHELTER CANDIDATES...',
    'COMPUTING SHELTER CAPACITY LOAD...',
    'EVALUATING ROAD NETWORK STATUS...',
    'DERIVING CAUSAL RISK FACTORS...',
    'CALIBRATING EVACUATION ESTIMATE...',
    'COMPILING ANALYST BRIEFING...',
  ];
}

/**
 * Timeline-advancement cascade — shorter than full scenario activation
 * (this is a re-computation against an already-loaded scenario, not a
 * cold start) but still substantial enough to visibly read as "the
 * system is recomputing the picture for this checkpoint", not an
 * instant jump.
 */
export function buildTimelineAdvanceLines(keyframeLabel) {
  return [
    `ADVANCING TIMELINE TO ${keyframeLabel}...`,
    'RE-MERGING KEYFRAME DELTA...',
    'UPDATING STRUCTURE RISK LEVELS...',
    'RECOMPUTING SHELTER OCCUPANCY LOAD...',
    'RE-EVALUATING ROAD NETWORK STATUS...',
    'RECALCULATING CAUSAL RISK FACTORS...',
    'REFRESHING EVACUATION ESTIMATE...',
    'COMPILING CHECKPOINT BRIEFING...',
  ];
}

// Per-line reveal delay for the processing cascade (ProcessingTurn in
// ChatMessage.jsx reveals lines one at a time on this cadence, instead
// of dumping them all at once) — shared with CommandShell so the fake
// "thinking" timer before the analyst-response turn appends lines up
// with how long the cascade visually takes to finish printing.
//
// Raised from 380ms to 460ms (follow-up feedback: processing felt too
// fast/short to read as substantial) — still fast enough not to feel
// sluggish for a 7-13 line cascade, but slow enough that each line is
// legible as it appears rather than blurring past.
export const PROCESSING_LINE_DELAY_MS = 460;

export function estimateProcessingDurationMs(lines) {
  return lines.length * PROCESSING_LINE_DELAY_MS;
}

export default buildProcessingLines;