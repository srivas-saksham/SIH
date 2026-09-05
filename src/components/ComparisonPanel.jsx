import { useEffect, useRef, useState } from 'react';

// Count-up/down animation duration for each stat's numeric transition.
const COUNT_DURATION_MS = 700;
// Per-row cascade delay (spec range: 80-100ms) so the three rows animate
// in a staggered wave rather than snapping simultaneously.
const ROW_STAGGER_MS = 90;
// Extra pause after a row's count animation settles before its delta
// badge fades/scales in — creates the "count, THEN confirm" reveal beat.
const BADGE_REVEAL_DELAY_MS = 150;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Animates a numeric value from `from` to `to` over `duration` ms once
 * `trigger` flips true, itself starting after `delay` ms (the per-row
 * cascade offset). Reports the live rounded value plus a `settled` flag
 * once the animation has fully finished, which the row uses to gate the
 * delta-badge reveal. Respects prefers-reduced-motion by jumping straight
 * to the final value.
 */
function useCountAnimation(from, to, trigger, delay) {
  const [value, setValue] = useState(from);
  const [settled, setSettled] = useState(false);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!trigger) {
      setValue(from);
      setSettled(false);
      return undefined;
    }

    if (prefersReducedMotion()) {
      setValue(to);
      setSettled(true);
      return undefined;
    }

    let start;
    const startTimeoutId = window.setTimeout(() => {
      frameRef.current = requestAnimationFrame(function step(timestamp) {
        if (start === undefined) start = timestamp;
        const progress = Math.min(1, (timestamp - start) / COUNT_DURATION_MS);
        const eased = easeOutCubic(progress);
        setValue(Math.round(from + (to - from) * eased));
        if (progress < 1) {
          frameRef.current = requestAnimationFrame(step);
        } else {
          setSettled(true);
        }
      });
    }, delay);

    return () => {
      window.clearTimeout(startTimeoutId);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, from, to, delay]);

  return { value, settled };
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M4 6.5l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A single "before -> after -> delta" stat row. Renders a plain baseline
 * number until `interventionApplied` flips true, at which point it counts
 * the value down/up from `before` to `after` and reveals a delta badge
 * once the count settles. All three current metrics (evac time, overload,
 * risk zone count) are lower-is-better, so the direction indicator is
 * always a down-chevron; the sign in the badge still reflects the actual
 * arithmetic delta so this holds even if a future metric isn't.
 */
function ComparisonRow({ label, before, after, unit, rowDelay, interventionApplied }) {
  const { value, settled } = useCountAnimation(before, after, interventionApplied, rowDelay);
  const [showBadge, setShowBadge] = useState(false);

  // Clearing the badge when intervention is un-applied (scenario switch or
  // timeline scrub) happens during render — the "adjust state when a prop
  // changes" pattern already used for scenario/timeline resets in
  // CommandShell.jsx — rather than as a synchronous setState inside the
  // effect below, which oxlint's react/set-state-in-effect rule flags.
  const [trackedApplied, setTrackedApplied] = useState(interventionApplied);
  if (trackedApplied !== interventionApplied) {
    setTrackedApplied(interventionApplied);
    if (!interventionApplied) setShowBadge(false);
  }

  useEffect(() => {
    if (!interventionApplied || !settled) return undefined;
    const id = window.setTimeout(() => setShowBadge(true), BADGE_REVEAL_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [interventionApplied, settled]);

  const delta = after - before;
  const deltaLabel = `${delta > 0 ? '+' : ''}${delta}${unit}`;
  const ariaLabel = interventionApplied
    ? `${label} improved from ${before}${unit} to ${after}${unit}`
    : `${label}: ${before}${unit}`;

  return (
    <div
      className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5"
      aria-label={ariaLabel}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-300">{label}</span>
        <div className="flex items-center gap-2 font-mono text-sm">
          {interventionApplied ? (
            <>
              <span className="text-slate-500">{before}{unit}</span>
              <span className="text-slate-600">
                <ChevronDownIcon />
              </span>
              <span className="text-risks-green">
                {value}
                {unit}
              </span>
            </>
          ) : (
            <span className="text-slate-100">{before}{unit}</span>
          )}
        </div>
      </div>

      {interventionApplied && (
        <div className="mt-1.5 flex justify-end">
          <span
            className={`rounded-full border border-risks-green/40 bg-risks-green/10 px-2 py-0.5 font-mono text-[10px] text-risks-green transition-all duration-300 ${
              showBadge ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
            }`}
          >
            {deltaLabel}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Baseline vs Intervention comparison panel (Task 7). Reads
 * `scenario.comparisonStats` and renders three stat rows plus one
 * "Apply intervention" action button. Clicking the button is a one-time,
 * non-re-triggerable action for the current scenario/timeline-reset cycle:
 * `interventionApplied` is owned by the parent (CommandShell), and this
 * component just renders whichever mode that flag implies and fires
 * `onApply` on click. See CommandShell.jsx for the reset rules (scenario
 * switch and timeline scrub both clear `interventionApplied`) and for how
 * MapView is swapped to `scenario.intervention` when this is active.
 */
export function ComparisonPanel({ comparisonStats, interventionApplied, onApply }) {
  const rows = [
    {
      key: 'evacTime',
      label: 'Evacuation time',
      before: comparisonStats.evacTimeBefore,
      after: comparisonStats.evacTimeAfter,
      unit: ' min',
    },
    {
      key: 'overload',
      label: 'Shelter overload',
      before: comparisonStats.overloadBefore,
      after: comparisonStats.overloadAfter,
      unit: '%',
    },
    {
      key: 'riskZones',
      label: 'High-risk zones',
      before: comparisonStats.riskZonesBefore,
      after: comparisonStats.riskZonesAfter,
      unit: '',
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Baseline vs Intervention</p>

      <div className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <ComparisonRow
            key={row.key}
            label={row.label}
            before={row.before}
            after={row.after}
            unit={row.unit}
            rowDelay={index * ROW_STAGGER_MS}
            interventionApplied={interventionApplied}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onApply}
        disabled={interventionApplied}
        aria-disabled={interventionApplied}
        aria-label={interventionApplied ? 'Intervention applied' : 'Apply intervention and see improved outcomes'}
        className={`mt-4 w-full rounded-xl border px-4 py-2.5 text-[11px] uppercase tracking-[0.22em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
          interventionApplied
            ? 'cursor-not-allowed border-risks-green/40 bg-risks-green/10 text-risks-green'
            : 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
        }`}
      >
        {interventionApplied ? 'Intervention applied ✓' : 'Apply intervention'}
      </button>
    </div>
  );
}

export default ComparisonPanel;