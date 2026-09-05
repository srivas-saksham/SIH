// Contributing-factor rows shown in the panel, in a fixed display order.
// Keys match scenario.causalFactors (and optionally a keyframe-level
// override) exactly.
const FACTORS = [
  { key: 'shelterDeficit', label: 'Shelter Deficit' },
  { key: 'populationDensity', label: 'Population Density' },
  { key: 'roadAccessibility', label: 'Road Accessibility' },
  { key: 'infrastructure', label: 'Infrastructure' },
];

// A tie is "near" if the runner-up is within this many percentage points
// of the top factor — in that case we call out both rather than picking
// one arbitrarily.
const NEAR_TIE_MARGIN = 3;

// Severity color scale, reusing tokens already defined in
// tailwind.config.js (the `risks` palette plus the app's existing accent
// teal) rather than inventing a new color language for this one panel.
function severityClasses(value) {
  if (value > 75) return { fill: 'bg-risks-red', text: 'text-white' };
  if (value >= 50) return { fill: 'bg-risks-orange', text: 'text-white' };
  if (value >= 25) return { fill: 'bg-risks-yellow', text: 'text-slate-900' };
  return { fill: 'bg-accent', text: 'text-slate-900' };
}

function describePrimaryDrivers(factors) {
  const entries = FACTORS.map((factor) => ({
    ...factor,
    value: Math.max(0, Math.min(100, factors?.[factor.key] ?? 0)),
  })).sort((a, b) => b.value - a.value);

  const [top, second] = entries;

  if (second && top.value - second.value <= NEAR_TIE_MARGIN) {
    return `Primary drivers: ${top.label} and ${second.label} (${top.value}% / ${second.value}%)`;
  }
  return `Primary driver: ${top.label} (${top.value}%)`;
}

/**
 * Animated horizontal bar breakdown of why the active scenario/keyframe
 * is risky. Purely presentational/reactive — CommandShell.jsx decides
 * which factors object to pass (scenario-level, or a per-keyframe
 * override if one exists) and this component just renders + animates it.
 */
export function CausalBreakdown({ factors }) {
  const primaryText = describePrimaryDrivers(factors);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Why this area is at risk</p>

      <div className="mt-4 space-y-3">
        {FACTORS.map(({ key, label }) => {
          const value = Math.max(0, Math.min(100, factors?.[key] ?? 0));
          const { fill, text } = severityClasses(value);
          const labelFitsInside = value > 20;

          return (
            <div key={key} className="flex items-center gap-3">
              <span className="w-[120px] shrink-0 text-xs text-slate-300">{label}</span>

              <div
                className="relative h-5 flex-1 rounded-full bg-slate-700/30"
                role="img"
                aria-label={`${label}: ${value} percent`}
              >
                <div
                  className={`flex h-full items-center justify-end rounded-full pr-2 transition-all duration-500 ease-out ${fill}`}
                  style={{ width: `${value}%` }}
                >
                  {labelFitsInside && <span className={`text-[10px] font-semibold ${text}`}>{value}%</span>}
                </div>

                {!labelFitsInside && (
                  <span
                    className="absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-300 transition-all duration-500 ease-out"
                    style={{ left: `calc(${value}% + 8px)` }}
                  >
                    {value}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent">
        {primaryText}
      </div>
    </div>
  );
}

export default CausalBreakdown;