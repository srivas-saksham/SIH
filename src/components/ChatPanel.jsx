import { useCallback, useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';

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
}) {
  const historyRef = useRef(null);

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