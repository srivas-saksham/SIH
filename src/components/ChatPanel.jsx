import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage, CausalFactors, CausalFactorsSkeleton } from './ChatMessage';

/**
 * The chat is the ONLY control surface (Section 1, PROJECT_CONTEXT_V3.md).
 * `turns` is a real, permanently-scrollable, append-only array (Section
 * 2 point 5 / Section 7) — this component never truncates or replaces
 * it, only renders whatever CommandShell has accumulated so far.
 *
 * `scrollNonce` is bumped by CommandShell on every event that should
 * force a jump to the bottom — a turn appended, a reveal tick, a "next"
 * submission — even when `turns` itself hasn't changed length yet (e.g.
 * the instant "next" is submitted, before the briefing turn lands). This
 * guarantees the chat always ends up pinned to its latest content rather
 * than relying solely on `turns` identity changes.
 *
 * Always mounted — header, this panel, and the timeline strip stay
 * visible before AND after scenario activation; only the map viewport
 * (owned by CommandShell) switches between its idle/active look.
 */
export function ChatPanel({
  turns,
  inputValue,
  onInputChange,
  onSubmit,
  isThinking,
  placeholder,
  onAdvance,
  onQueryRoads,
  onQueryShelters,
  scrollNonce,
  causalFactors,
  keyframeLabel,
}) {
  const historyRef = useRef(null);

  // Skeleton must only ever appear ONCE — during the very first scenario
  // activation, before any real causal-factor values have ever existed.
  // Every later "next"/timeline advance re-thinks too (isThinking flips
  // true again), but by then the panel already has real numbers on
  // screen; those should stay put (frozen at their current values) while
  // thinking, then morph smoothly into the new values once they land —
  // never re-blank into a skeleton and "restart" the reveal.
  // `hasShownRealData` latches true the first time real bars are shown
  // and never resets for the lifetime of this component, so it
  // correctly distinguishes "first activation" from every subsequent
  // advance even though `isThinking` looks identical in both cases. Set
  // via the same "adjust state during render" pattern CommandShell uses
  // for `resetForScenarioId` (a conditional setState in the render body
  // that only fires once real data first appears) rather than mutating
  // a ref during render, which React's compiler correctly flags as
  // unsafe.
  const [hasShownRealData, setHasShownRealData] = useState(false);
  if (!hasShownRealData && causalFactors && !isThinking) {
    setHasShownRealData(true);
  }
  const isFirstActivationLoading = isThinking && !hasShownRealData;

  // The panel must appear the instant a scenario starts activating (or
  // a "next" advance starts processing) — not only once `causalFactors`
  // resolves to a value — so it stays visible (as a skeleton, first time
  // only — see above) for the FULL isThinking span rather than popping
  // in only once the response has already landed. `causalFactors` alone
  // still covers the "already activated, not currently thinking" steady
  // state, and also covers "thinking again after the first activation",
  // since the previous real values should stay visible then.
  const showQuickAnalytics = isFirstActivationLoading || Boolean(causalFactors);

  // Always snap to the newest content — including on every incremental
  // reveal tick (a processing line printing, a headline character
  // typing), not just when a whole new turn is appended, so the person
  // never has to manually scroll to follow what's being "typed". Runs
  // twice via requestAnimationFrame (immediate + one frame later) so it
  // still lands correctly even if the new content's height hasn't been
  // committed to layout yet at the moment this fires.
  const scrollToBottom = useCallback(() => {
    const el = historyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    window.requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [turns, scrollNonce, scrollToBottom]);

  return (
    <aside className="flex min-h-0 flex-1 flex-col xl:w-[35%] xl:flex-none">
      {/* Fixed "Quick Analytics" panel — the causal-factor progress bars
          (Shelter Deficit / Population Density / Road Accessibility /
          Infrastructure), pinned above the scrollable chat history as
          its OWN section, not a per-turn chat element. Sourced straight
          from CommandShell's current keyframe (not from whatever's
          inside `turns`), so it updates on every keyframe change —
          including a direct TimelineScrubber drag, not only chat-driven
          "next" turns. No longer duplicated inside individual chat
          turns (ChatMessage.jsx). Re-keyed on the label so the bars
          re-animate from 0 on every keyframe change instead of
          silently jumping to the new value. Only rendered once a
          scenario is active; renders nothing beforehand. */}
      {showQuickAnalytics && (
        <div className="shrink-0 border-b border-hairline bg-canvas px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.28em] text-ink-dim">Quick Analytics</p>
            {isThinking ? (
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Recomputing…
              </span>
            ) : (
              keyframeLabel && (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                  {keyframeLabel}
                </span>
              )
            )}
          </div>
          <div className="mt-2">
            {isFirstActivationLoading ? (
              // First-ever activation only: no real values exist yet at
              // all, so there is nothing to morph from — show the
              // skeleton instead of empty/zeroed bars.
              <CausalFactorsSkeleton />
            ) : (
              // Every subsequent "next"/advance: intentionally NOT
              // re-keyed on `keyframeLabel` anymore. Keeping the same
              // element identity means React updates `factors` in place
              // rather than remounting, so CausalFactors' own
              // `transition-all` bar-width transitions carry it smoothly
              // from its current value to the new one — a morph, not a
              // restart-from-0 reveal. While `isThinking` is true this
              // still shows the PREVIOUS keyframe's values (frozen,
              // since CommandShell only updates `causalFactors` once
              // thinking ends), which is exactly the "stay put, then
              // morph" behavior wanted. `animate` is left at its default
              // (true) so the very first time this element mounts —
              // right as the first-activation skeleton is replaced —
              // it still fills in from 0, rather than snapping straight
              // to full value.
              <CausalFactors factors={causalFactors} />
            )}
          </div>
        </div>
      )}

      <div ref={historyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 && (
          <div className="space-y-3 text-xs text-ink-faint">
            <p>
              This chat is the only control surface. Describe a scenario in plain language and the system will
              activate it, walk the timeline forward, and apply interventions — all from here.
            </p>
            <p className="text-ink-dim">Try something like:</p>
            <ul className="space-y-1 pl-3">
              <li>“high-severity hostile attack in Central Delhi”</li>
              <li>“simulate an earthquake near Connaught Place”</li>
              <li>“flood scenario along the Yamuna”</li>
            </ul>
          </div>
        )}
        {turns.map((turn) => (
          <ChatMessage
            key={turn.id}
            turn={turn}
            onReveal={scrollToBottom}
            onAdvance={onAdvance}
            onQueryRoads={onQueryRoads}
            onQueryShelters={onQueryShelters}
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-hairline px-4 py-4">
        <label htmlFor="chat-input" className="block text-[10px] uppercase tracking-[0.3em] text-ink-dim">
          Command input
        </label>
        <form onSubmit={onSubmit} className="mt-2 flex items-center gap-2 border-b border-hairline pb-2">
          {isThinking ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          ) : (
            <span className="text-accent">›</span>
          )}
          <input
            id="chat-input"
            type="text"
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            disabled={isThinking}
            placeholder={placeholder}
            autoFocus
            className="w-full border-0 bg-transparent font-mono text-sm text-ink outline-none placeholder:text-ink-faint disabled:opacity-60"
          />
        </form>
      </div>
    </aside>
  );
}

export default ChatPanel;