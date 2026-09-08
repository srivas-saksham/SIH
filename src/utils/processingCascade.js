// Fake, improvised "system telemetry" lines shown during scenario
// activation (Section 6 of PROJECT_CONTEXT_V3.md). Genuinely fake
// content, written to read as plausible processing output — never
// literally true, and not derived from any real backend process.
export function buildProcessingLines(scenario) {
  return [
    'RESOLVING SCENARIO VECTOR...',
    `SCENARIO MATCH: ${scenario.id} (confidence: high)`,
    'LOADING BASELINE TOPOLOGY...',
    'CROSS-REFERENCING LANDMARK REGISTRY...',
    'PROJECTING RISK ZONE RADII...',
    'INDEXING NEARBY SHELTER CANDIDATES...',
    'COMPILING ANALYST BRIEFING...',
  ];
}

// Per-line reveal delay for the processing cascade (ProcessingTurn in
// ChatMessage.jsx reveals lines one at a time on this cadence, instead
// of dumping them all at once) — shared with CommandShell so the fake
// "thinking" timer before the analyst-response turn appends lines up
// with how long the cascade visually takes to finish printing.
export const PROCESSING_LINE_DELAY_MS = 380;

export function estimateProcessingDurationMs(lines) {
  return lines.length * PROCESSING_LINE_DELAY_MS;
}

export default buildProcessingLines;