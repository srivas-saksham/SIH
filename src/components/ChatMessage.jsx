import { useEffect, useState } from 'react';
import { PROCESSING_LINE_DELAY_MS } from '../utils/processingCascade';

// Severity color scale for causal-factor bars — same scale
// CausalBreakdown.jsx used before that standalone docked component was
// retired (Section 2 point 2); the look is preserved, just embedded
// inline in a chat turn and now progress-animated (see CausalFactors).
function severityClasses(value) {
  if (value > 75) return { fill: 'bg-risks-red', text: 'text-white' };
  if (value >= 50) return { fill: 'bg-risks-orange', text: 'text-white' };
  if (value >= 25) return { fill: 'bg-risks-yellow', text: 'text-slate-900' };
  return { fill: 'bg-accent', text: 'text-slate-900' };
}

const CAUSAL_FACTORS = [
  { key: 'shelterDeficit', label: 'Shelter Deficit' },
  { key: 'populationDensity', label: 'Population Density' },
  { key: 'roadAccessibility', label: 'Road Accessibility' },
  { key: 'infrastructure', label: 'Infrastructure' },
];

const ROAD_STATUS_CLASS = {
  blocked: 'text-risks-red',
  congested: 'text-risks-orange',
};

// Delay between each "phase" of the analyst response revealing (headline
// typing -> stats -> roads -> shelters -> causal bars), so the whole
// turn visibly builds itself rather than dumping at once.
const PHASE_STAGGER_MS = 260;
const HEADLINE_CHAR_DELAY_MS = 14;
const BAR_ANIMATE_DELAY_MS = 80;

/** Inline label/value stat pairs — explicitly NOT bordered tiles, per
 * the "no container inside container" rule (Section 9). */
function StatBlock({ stats }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 animate-[fadeIn_0.35s_ease-out_forwards]">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-baseline justify-between border-b border-hairline pb-1">
          <span className="text-[10px] uppercase tracking-[0.2em] text-ink-dim">{stat.label}</span>
          <span className="font-mono text-sm text-ink">{stat.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Causal-factor bars that visibly fill from 0 to their real value on
 * mount, so this reads as "the system is computing this now" rather
 * than a static pre-filled chart. Exported: also used as the fixed
 * "Quick Analytics" block pinned above the chat panel (ChatPanel.jsx) —
 * no longer rendered inline inside individual chat turns (see note
 * below), so this is now the ONE place these bars render. */
export function CausalFactors({ factors, animate = true }) {
  const [animateIn, setAnimateIn] = useState(!animate);

  useEffect(() => {
    if (!animate) return undefined;
    const id = window.setTimeout(() => setAnimateIn(true), BAR_ANIMATE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [animate]);

  if (!factors) return null;

  return (
    <div className="space-y-2">
      {CAUSAL_FACTORS.map(({ key, label }, index) => {
        const target = Math.max(0, Math.min(100, factors?.[key] ?? 0));
        const value = animateIn ? target : 0;
        const { fill, text } = severityClasses(target);
        const labelFitsInside = value > 20;
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="w-[110px] shrink-0 text-xs text-slate-300">{label}</span>
            <div className="relative h-4 flex-1 rounded-full bg-slate-700/30" role="img" aria-label={`${label}: ${target} percent`}>
              <div
                className={`flex h-full items-center justify-end rounded-full pr-2 transition-all ease-out ${fill}`}
                style={{ width: `${value}%`, transitionDuration: '650ms', transitionDelay: `${index * 90}ms` }}
              >
                {labelFitsInside && <span className={`text-[9px] font-semibold ${text}`}>{target}%</span>}
              </div>
              {!labelFitsInside && (
                <span
                  className="absolute top-1/2 -translate-y-1/2 text-[9px] font-semibold text-slate-300 transition-all ease-out"
                  style={{ left: `calc(${value}% + 8px)`, transitionDuration: '650ms', transitionDelay: `${index * 90}ms` }}
                >
                  {target}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Skeleton placeholder for the "Quick Analytics" bars, shown while
 * `isThinking` spans a scenario activation or a timeline advance
 * (ChatPanel.jsx) — so the panel visibly "processes" instead of
 * snapping to its final values before the response has even landed.
 * Mirrors CausalFactors' exact row layout (same label column width,
 * same bar height) so nothing shifts when the real bars swap in, with
 * each row's shimmer bar set to a different resting width purely for
 * visual variety, not real data. */
export function CausalFactorsSkeleton() {
  const widths = [62, 40, 78, 50];
  return (
    <div className="space-y-2" aria-hidden="true">
      {CAUSAL_FACTORS.map(({ key, label }, index) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-[110px] shrink-0 text-xs text-slate-500">{label}</span>
          <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-slate-700/30">
            <div
              className="h-full animate-pulse rounded-full bg-slate-600/50"
              style={{ width: `${widths[index % widths.length]}%`, animationDelay: `${index * 120}ms` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact roads/shelters chip lists are no longer rendered inline by
 * default on every activation/briefing turn (per explicit follow-up:
 * that repetition was the whole complaint) — they're only shown via
 * `RoadsQueryTurn`/`SheltersQueryTurn` below, reached through the
 * quick-action buttons or a typed query.
 */

// NOTE: the "why this area is at risk" narrative used to render here,
// inline under the causal bars on every activation/briefing turn. It's
// now a FIXED section pinned above the whole chat panel (ChatPanel.jsx),
// sourced directly from CommandShell's current keyframe rather than
// per-turn content, so it stays correct across scrubber drags too —
// not just chat-driven advances. Removed from here to avoid showing it
// twice.

const ROAD_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'congested', label: 'Congested' },
  { key: 'clear', label: 'Open' },
];

/** Quick-action buttons offered at the end of every activation/briefing
 * turn (Task 2 follow-up): "Roads nearby" and "Shelters in range" —
 * distinct color from the "Next" advancement button so they read as a
 * different KIND of action (query, not advance) rather than competing
 * with it. Also reachable by typing the equivalent list command
 * (parseContentQueryIntent in timelineIntent.js). */
function QuickActionButtons({ onQueryRoads, onQueryShelters }) {
  if (!onQueryRoads && !onQueryShelters) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {onQueryRoads && (
        <button
          type="button"
          onClick={() => onQueryRoads('all')}
          className="inline-flex items-center gap-2 border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-cyan-300 transition hover:bg-cyan-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          Roads nearby
        </button>
      )}
      {onQueryShelters && (
        <button
          type="button"
          onClick={onQueryShelters}
          className="inline-flex items-center gap-2 border border-violet-400/40 bg-violet-400/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-violet-300 transition hover:bg-violet-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          Shelters in range
        </button>
      )}
    </div>
  );
}

/** Full, filterable roads roster — rendered for the 'roads-query' turn
 * kind (Roads nearby button / typed "list all blocked roads" etc). Shows
 * EVERY tracked road (not just problem ones), plus its own filter
 * sub-buttons so a person can immediately narrow to just blocked /
 * congested / open without retyping. */
function RoadsQueryTurn({ content, onReveal, onQueryRoads }) {
  const [headlineDone, setHeadlineDone] = useState(false);
  return (
    <div className="border-b border-hairline pb-4">
      <TypewriterHeadline text={content.headline} onReveal={onReveal} onDone={() => setHeadlineDone(true)} />
      {headlineDone && (
        <ul className="mt-3 space-y-1 animate-[fadeIn_0.35s_ease-out_forwards]">
          {content.roads.map((road) => (
            <li key={road.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-300">
                {road.label}
                {road.shelterName && (
                  <span className="block text-[10px] text-ink-faint">→ {road.shelterName} ({road.shelterDistanceKm} km)</span>
                )}
              </span>
              <span className={`shrink-0 uppercase tracking-[0.14em] ${ROAD_STATUS_CLASS[road.status] || 'text-accent'}`}>
                {road.status}
              </span>
            </li>
          ))}
          {content.roads.length === 0 && <li className="text-xs text-ink-faint">None at this checkpoint.</li>}
        </ul>
      )}
      {headlineDone && onQueryRoads && (
        <div className="mt-3 flex flex-wrap gap-2 animate-[fadeIn_0.35s_ease-out_forwards]">
          {ROAD_FILTERS.filter((f) => f.key !== content.filter).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onQueryRoads(f.key)}
              className="inline-flex items-center gap-1 border border-cyan-400/30 bg-cyan-400/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-300/90 transition hover:bg-cyan-400/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Full shelters roster with structural rating + feasibility notes —
 * rendered for the 'shelters-query' turn kind. */
function SheltersQueryTurn({ content, onReveal }) {
  const [headlineDone, setHeadlineDone] = useState(false);
  return (
    <div className="border-b border-hairline pb-4">
      <TypewriterHeadline text={content.headline} onReveal={onReveal} onDone={() => setHeadlineDone(true)} />
      {headlineDone && (
        <ul className="mt-3 space-y-3 animate-[fadeIn_0.35s_ease-out_forwards]">
          {content.shelters.map((shelter) => (
            <li key={shelter.id} className="text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-200">{shelter.name}</span>
                <span className="font-mono text-ink-dim">{shelter.distanceKm.toFixed(2)} km</span>
              </div>
              {shelter.metadata?.structuralRating && (
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                  Structural rating: {shelter.metadata.structuralRating}
                </p>
              )}
              {shelter.metadata?.feasibilityNote && (
                <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">{shelter.metadata.feasibilityNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** User's own typed/echoed chat turn. */
function UserTurn({ text }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] border-b border-hairline pb-2 text-right font-mono text-sm text-ink">
        <span className="text-accent">›</span> {text}
      </p>
    </div>
  );
}

/**
 * Small centered system-style notice — used for "cls" (chat cleared)
 * and "reset" (scene reset) meta-commands. Deliberately much quieter
 * than every other turn kind here (no border-b, no icon row, small
 * dim/uppercase text): these are terminal-style acknowledgements of a
 * meta-command, not analyst content, so they shouldn't compete for
 * attention with the actual briefing turns around them.
 */
function SystemNoticeTurn({ text }) {
  return (
    <div className="flex justify-center py-1">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim/70">{text}</p>
    </div>
  );
}

/** Processing cascade — visually distinct (monospace/system treatment),
 * reveals one line at a time on a fixed cadence so it reads as live
 * processing rather than a dumped block, and stays a real, permanent
 * turn in the scrollable history (Section 2 point 5) once fully
 * revealed — never a transient overlay. */
function ProcessingTurn({ lines, onReveal }) {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (revealedCount >= lines.length) return undefined;
    const id = window.setTimeout(() => {
      setRevealedCount((count) => count + 1);
      onReveal?.();
    }, PROCESSING_LINE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [revealedCount, lines.length, onReveal]);

  return (
    <div className="border-b border-hairline pb-3">
      <div className="space-y-1 font-mono text-[11px] uppercase tracking-[0.08em] text-accent/80">
        {lines.slice(0, revealedCount).map((line) => (
          <p key={line} className="animate-[fadeIn_0.25s_ease-out_forwards]">
            {line}
          </p>
        ))}
        {revealedCount < lines.length && (
          <span className="inline-block h-3 w-1.5 animate-pulse bg-accent/60 align-middle" />
        )}
      </div>
    </div>
  );
}

/** Headline paragraph, revealed character-by-character (typewriter)
 * rather than appearing instantly. */
function TypewriterHeadline({ text, onDone, onReveal }) {
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    if (charCount >= text.length) {
      onDone?.();
      return undefined;
    }
    const id = window.setTimeout(() => {
      setCharCount((count) => count + 1);
      onReveal?.();
    }, HEADLINE_CHAR_DELAY_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charCount, text]);

  const done = charCount >= text.length;

  return (
    <p className="text-sm leading-relaxed text-ink">
      {text.slice(0, charCount)}
      {!done && <span className="inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse bg-accent align-middle" />}
    </p>
  );
}

/** Inline "Next: T+N" button offered at the end of an activation or
 * briefing turn (Task 2). Wired to the same `advanceTimeline` handler
 * the text-dispatcher uses. Omitted entirely once the final keyframe is
 * reached (Task 2's must-deliver list) — callers simply don't pass
 * `onAdvance`/`nextLabel` in that case. */
function NextStepButton({ nextLabel, onAdvance }) {
  if (!nextLabel || !onAdvance) return null;
  return (
    <button
      type="button"
      onClick={onAdvance}
      className="mt-4 inline-flex items-center gap-2 border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-accent transition hover:bg-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      Next: {nextLabel}
    </button>
  );
}

/** Full analyst-response turn — headline types out first, then stats,
 * roads, shelters, and causal factors each reveal in sequence
 * (Section 6) rather than appearing all at once. */
function ActivationResponseTurn({ content, onReveal, nextLabel, onAdvance, onQueryRoads, onQueryShelters }) {
  // 0 = headline typing, 1 = stats shown, 2 = +roads, 3 = +shelters,
  // 4 = +causal factors (fully revealed).
  const [phase, setPhase] = useState(0);
  const [headlineDone, setHeadlineDone] = useState(false);

  // Advance one phase at a time on a fixed stagger, starting only once
  // the headline has finished typing. Each phase change is a single
  // effect run (not something fired during render), so this schedules
  // exactly one timeout per transition.
  useEffect(() => {
    if (!headlineDone || phase >= 4) return undefined;
    const id = window.setTimeout(() => {
      setPhase((p) => p + 1);
      onReveal?.();
    }, PHASE_STAGGER_MS);
    return () => window.clearTimeout(id);
  }, [headlineDone, phase, onReveal]);

  return (
    <div className="border-b border-hairline pb-4">
      <TypewriterHeadline text={content.headline} onReveal={onReveal} onDone={() => setHeadlineDone(true)} />
      {phase >= 1 && <StatBlock stats={content.stats} />}
      {phase >= 4 && <QuickActionButtons onQueryRoads={onQueryRoads} onQueryShelters={onQueryShelters} />}
      {phase >= 4 && <NextStepButton nextLabel={nextLabel} onAdvance={onAdvance} />}
    </div>
  );
}

/** Timeline-briefing turn (Task 2): lighter weight than the activation
 * response — no processing-cascade replay, no camera-flyin narration,
 * and the headline is NOT typewriter-animated (it's a short, already-
 * computed delta sentence, not a "the system is thinking" moment).
 * Stats/roads/shelters/causal-factors still reveal in the same staggered
 * phases so briefings still visibly "build" rather than dumping at once. */
function TimelineBriefingTurn({ content, onReveal, nextLabel, onAdvance, isFinal, onQueryRoads, onQueryShelters }) {
  // 1 = stats shown, 2 = +roads, 3 = +shelters, 4 = +causal factors.
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (phase >= 4) return undefined;
    const id = window.setTimeout(() => {
      setPhase((p) => p + 1);
      onReveal?.();
    }, PHASE_STAGGER_MS);
    return () => window.clearTimeout(id);
  }, [phase, onReveal]);

  return (
    <div className="border-b border-hairline pb-4">
      <p className="text-sm leading-relaxed text-ink">{content.headline}</p>
      {phase >= 1 && <StatBlock stats={content.stats} />}
      {phase >= 4 && <QuickActionButtons onQueryRoads={onQueryRoads} onQueryShelters={onQueryShelters} />}
      {phase >= 4 && isFinal && (
        <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-ink-dim">
          Scenario timeline complete.
        </p>
      )}
      {phase >= 4 && !isFinal && <NextStepButton nextLabel={nextLabel} onAdvance={onAdvance} />}
    </div>
  );
}

/** Intervention-response turn (Task 3): same staggered stat/roads/
 * shelters/causal-factor reveal pattern as the other content turns, but
 * the headline is a short, already-computed before/after narrative (not
 * typewriter-animated, same reasoning as TimelineBriefingTurn), and it
 * closes with a persistent "Intervention active" badge instead of a
 * "Next" button — applying the intervention doesn't advance the
 * timeline, so there's nothing to step to from here. */
function InterventionResponseTurn({ content, onReveal, onQueryRoads, onQueryShelters }) {
  // 1 = stats shown, 2 = +roads, 3 = +shelters, 4 = +causal factors/badge.
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (phase >= 4) return undefined;
    const id = window.setTimeout(() => {
      setPhase((p) => p + 1);
      onReveal?.();
    }, PHASE_STAGGER_MS);
    return () => window.clearTimeout(id);
  }, [phase, onReveal]);

  return (
    <div className="border-b border-hairline pb-4">
      <p className="text-sm leading-relaxed text-ink">{content.headline}</p>
      {phase >= 1 && <StatBlock stats={content.stats} />}
      {phase >= 4 && <QuickActionButtons onQueryRoads={onQueryRoads} onQueryShelters={onQueryShelters} />}
      {phase >= 4 && (
        <p className="mt-4 inline-flex items-center gap-2 border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-emerald-300">
          Intervention active — shelter capacity +{content.percent}%
        </p>
      )}
    </div>
  );
}

/** Capacity-boost "what if" turn (Task 3's dedicated branch): the
 * "very good looking" full shelter roster the person explicitly asked
 * for — name, structural rating, live boosted capacity/occupancy,
 * remaining headroom, and a per-shelter fill bar, plus the
 * network-wide stat strip and causal-factor bars, all computed off the
 * boosted state. Distinct component from SheltersQueryTurn: this one
 * needs capacity/occupancy/headroom numbers and a persistent "+X%"
 * badge, which the plain shelters roster has no reason to carry. */
function CapacityBoostTurn({ content, onReveal, onQueryRoads, onQueryShelters }) {
  const [headlineDone, setHeadlineDone] = useState(false);
  const [phase, setPhase] = useState(0); // 1 = stats, 2 = roster, 3 = causal factors

  useEffect(() => {
    if (!headlineDone || phase >= 3) return undefined;
    const id = window.setTimeout(() => {
      setPhase((p) => p + 1);
      onReveal?.();
    }, PHASE_STAGGER_MS);
    return () => window.clearTimeout(id);
  }, [headlineDone, phase, onReveal]);

  return (
    <div className="border-b border-hairline pb-4">
      <TypewriterHeadline text={content.headline} onReveal={onReveal} onDone={() => setHeadlineDone(true)} />
      {phase >= 1 && <StatBlock stats={content.stats} />}
      {phase >= 1 && (
        <p className="mt-3 inline-flex items-center gap-2 border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-emerald-300">
          Capacity increased by {content.percent}% more
        </p>
      )}
      {phase >= 2 && (
        <ul className="mt-3 space-y-3 animate-[fadeIn_0.35s_ease-out_forwards]">
          {content.shelterRoster.map((shelter) => (
            <li key={shelter.id} className="rounded-md border border-hairline/70 bg-surface/40 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-200">{shelter.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-dim">{shelter.distanceKm} km away</span>
              </div>
              {shelter.structuralRating && (
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                  {shelter.structuralRating.replace('-', ' ')}
                </p>
              )}
              {shelter.capacity != null && (
                <>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-ink-dim">
                    <span>
                      {shelter.occupancy}/{shelter.capacity} occupied
                    </span>
                    <span className="text-emerald-300">{shelter.headroom} free (+{content.percent}%)</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                      style={{ width: `${Math.min(100, shelter.fillPercent)}%` }}
                    />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {phase >= 2 && <QuickActionButtons onQueryRoads={onQueryRoads} onQueryShelters={onQueryShelters} />}
    </div>
  );
}

/** Graceful "didn't understand" turn (Task 2 / Section 5's closing
 * paragraph): shown when typed text matches neither timeline-advancement
 * vocabulary nor any scenario's keywords confidently — instead of
 * silently falling through to generic-fallback. */
function ClarifyFallbackTurn() {
  return (
    <div className="border-b border-hairline pb-4">
      <p className="text-sm leading-relaxed text-ink-dim">
        I didn&apos;t quite catch that. Try describing a scenario (e.g. &ldquo;hostile attack in Central
        Delhi&rdquo;), say &ldquo;next&rdquo; / name a checkpoint (e.g. &ldquo;T+15&rdquo;) to advance an active
        timeline, ask for roads/shelters (e.g. &ldquo;blocked roads&rdquo;, &ldquo;shelters in range&rdquo;),
        apply an intervention (e.g. &ldquo;increase shelter capacity by 20%&rdquo;), ask a &ldquo;what
        if&rdquo; (e.g. &ldquo;what if shelter size increased by 30%&rdquo;), or type &ldquo;cls&rdquo;
        to clear this chat, or &ldquo;reset&rdquo; to rewind the active scenario back to T+0.
      </p>
    </div>
  );
}

export function ChatMessage({ turn, onReveal, onAdvance, onQueryRoads, onQueryShelters }) {
  switch (turn.kind) {
    case 'user':
      return <UserTurn text={turn.text} />;
    case 'system-notice':
      return <SystemNoticeTurn text={turn.text} />;
    case 'processing':
      return <ProcessingTurn lines={turn.lines} onReveal={onReveal} />;
    case 'activation-response':
      return (
        <ActivationResponseTurn
          content={turn.content}
          onReveal={onReveal}
          nextLabel={turn.nextLabel}
          onAdvance={turn.nextLabel ? onAdvance : undefined}
          onQueryRoads={onQueryRoads}
          onQueryShelters={onQueryShelters}
        />
      );
    case 'timeline-briefing':
      return (
        <TimelineBriefingTurn
          content={turn.content}
          onReveal={onReveal}
          nextLabel={turn.nextLabel}
          onAdvance={turn.nextLabel ? onAdvance : undefined}
          isFinal={turn.isFinal}
          onQueryRoads={onQueryRoads}
          onQueryShelters={onQueryShelters}
        />
      );
    case 'roads-query':
      return <RoadsQueryTurn content={turn.content} onReveal={onReveal} onQueryRoads={onQueryRoads} />;
    case 'shelters-query':
      return <SheltersQueryTurn content={turn.content} onReveal={onReveal} />;
    case 'clarify-fallback':
      return <ClarifyFallbackTurn />;
    case 'intervention-response':
      return (
        <InterventionResponseTurn
          content={turn.content}
          onReveal={onReveal}
          onQueryRoads={onQueryRoads}
          onQueryShelters={onQueryShelters}
        />
      );
    case 'capacity-boost-response':
      return (
        <CapacityBoostTurn
          content={turn.content}
          onReveal={onReveal}
          onQueryRoads={onQueryRoads}
          onQueryShelters={onQueryShelters}
        />
      );
    default:
      return null;
  }
}

export default ChatMessage;