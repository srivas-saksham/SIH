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
 * than a static pre-filled chart. */
function CausalFactors({ factors }) {
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setAnimateIn(true), BAR_ANIMATE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  if (!factors) return null;

  return (
    <div className="mt-4 space-y-2 animate-[fadeIn_0.35s_ease-out_forwards]">
      <p className="text-[10px] uppercase tracking-[0.28em] text-ink-dim">Why this area is at risk</p>
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

/** Compact roads/shelters chip lists are no longer rendered inline by
 * default on every activation/briefing turn (per explicit follow-up:
 * that repetition was the whole complaint) — they're only shown via
 * `RoadsQueryTurn`/`SheltersQueryTurn` below, reached through the
 * quick-action buttons or a typed query.
 */

/** The "why this area is at risk" narrative — a real sentence or two
 * that names the dominant causal factor(s) and ties them to the
 * scenario's attack timing/phase, replacing the old static caption that
 * sat above the bars unchanged every keyframe. Rendered right below the
 * bars (per explicit follow-up: evac time / overload / risk zones /
 * shelters, THEN this, every single time). */
function WhyAtRiskNarrative({ text }) {
  if (!text) return null;
  return (
    <p className="mt-2 text-xs leading-relaxed text-ink-dim animate-[fadeIn_0.35s_ease-out_forwards]">{text}</p>
  );
}

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
      {phase >= 1 && <WhyAtRiskNarrative text={content.whyAtRisk} />}
      {phase >= 4 && <CausalFactors factors={content.causalFactors} />}
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
      {phase >= 1 && <WhyAtRiskNarrative text={content.whyAtRisk} />}
      {phase >= 4 && <CausalFactors factors={content.causalFactors} />}
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
        timeline, ask for roads/shelters (e.g. &ldquo;blocked roads&rdquo;, &ldquo;shelters in range&rdquo;), or
        type &ldquo;cls&rdquo; to clear this chat.
      </p>
    </div>
  );
}

export function ChatMessage({ turn, onReveal, onAdvance, onQueryRoads, onQueryShelters }) {
  switch (turn.kind) {
    case 'user':
      return <UserTurn text={turn.text} />;
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
    // 'intervention-response' is stubbed/reserved for Task 3 (Section 7)
    // — not built yet.
    default:
      return null;
  }
}

export default ChatMessage;