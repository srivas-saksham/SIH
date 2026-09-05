// Preset chips shown in the footer. Each one maps directly to a real
// scenario dataset (via scenarioId) for instant switching, bypassing the
// keyword matcher entirely — see CommandShell.jsx's handlePresetClick.
//
// NOTE: this replaces the original placeholder content (generic
// supply-chain flavored names like "Port congestion") from the Task 1
// shell, which didn't correspond to any real scenario dataset and so
// couldn't be wired to actually switch scenarios. See PROJECT_CONTEXT.md
// Task 4 agent notes for the reasoning.
export const scenarioPresets = [
  { name: 'Hostile Attack', scenarioId: 'security-attack', severity: 'red', signal: 'Central Delhi threat' },
  { name: 'Earthquake', scenarioId: 'earthquake', severity: 'orange', signal: 'Structural collapse risk' },
  { name: 'Flood', scenarioId: 'flood', severity: 'yellow', signal: 'Yamuna overflow' },
  { name: 'Reset / Baseline', scenarioId: 'generic-fallback', severity: 'green', signal: 'Nominal conditions' },
];