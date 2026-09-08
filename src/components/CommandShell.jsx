import { useCallback, useMemo, useRef, useState } from 'react';
import { describeDelta } from '../utils/describeKeyframeDelta';
import { mergeKeyframesUpTo } from '../utils/mergeKeyframe';
import { matchScenario } from '../utils/scenarioMatcher';
import { buildAnalystContent } from '../utils/buildAnalystContent';
import { buildProcessingLines, estimateProcessingDurationMs } from '../utils/processingCascade';
import { ChatPanel } from './ChatPanel';
import { MapLibreView } from './MapLibreView';
import { MapToolbar } from './MapToolbar';
import { MapView } from './MapView';
import { TimelineScrubber } from './TimelineScrubber';
import { TopNav } from './TopNav';

/**
 * Computes the full merged map state for a given timeline position.
 * Index 0 (T+0) renders the plain scenario baseline; any later index
 * folds `scenario.timeline[0..index]` cumulatively onto that baseline via
 * mergeKeyframesUpTo. Wrapped defensively: if a scenario's timeline is
 * malformed (missing, wrong shape, or a keyframe that fails to merge),
 * this logs a warning and falls back to the baseline rather than crashing
 * the UI.
 */
function getMergedStateForIndex(scenario, index) {
  if (!scenario || index <= 0 || !Array.isArray(scenario.timeline) || scenario.timeline.length === 0) {
    return scenario ? scenario.baseline : null;
  }
  try {
    return mergeKeyframesUpTo(scenario.baseline, scenario.timeline, index);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`CommandShell: failed to merge timeline keyframes for "${scenario.id}" at index ${index}.`, error);
    return scenario.baseline;
  }
}

/**
 * Causal factors are a static per-scenario snapshot by default, with an
 * optional per-keyframe override (unchanged from the prior docked-panel
 * era — Task 1 only changes WHERE this renders, not how it's derived).
 */
function getCausalFactorsForIndex(scenario, index) {
  const timeline = scenario.timeline;
  if (!Array.isArray(timeline) || timeline.length === 0 || index <= 0) {
    return scenario.causalFactors;
  }
  const clampedIndex = Math.min(index, timeline.length - 1);
  return timeline[clampedIndex]?.causalFactors ?? scenario.causalFactors;
}

// Small buffer added on top of the processing cascade's own reveal
// duration (Section 6) before the analyst-response turn appends, so the
// last cascade line has fully faded in rather than the response landing
// mid-animation.
const RESPONSE_APPEND_BUFFER_MS = 200;

let turnIdCounter = 0;
function nextTurnId() {
  turnIdCounter += 1;
  return `turn-${turnIdCounter}`;
}

export function CommandShell() {
  // Nullable: no scenario is active until the person types one into
  // chat (Section 4). The shell (header/chat/timeline slot) is always
  // rendered regardless — only the map viewport changes look.
  const [activeScenario, setActiveScenario] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  // Chat history: a real, permanently-scrollable, append-only array of
  // turns (Section 2 point 5 / Section 7) — never replaced wholesale.
  const [chatTurns, setChatTurns] = useState([]);
  const pendingResponseTimeoutRef = useRef(null);

  // Timeline scrubber state. Lives here (not inside TimelineScrubber)
  // because MapView/MapLibreView are siblings that also need the derived
  // merged state.
  const [currentKeyframeIndex, setCurrentKeyframeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Whether an intervention has been applied for the current scenario.
  // Owned here (same pattern as the timeline state above) even though
  // no chat command drives this yet — Task 3 wires the chat-triggered
  // path; this task just keeps the underlying state/derivation intact
  // so MapLibreView's props don't need to change shape again later.
  const [interventionApplied] = useState(false);

  // Map toolbar: shelters default OFF.
  const [sheltersVisible, setSheltersVisible] = useState(false);

  // Switching scenarios (via chat) must never carry a mid-timeline
  // position into the newly-activated scenario. Reset it during render
  // (React's documented "adjust state when a prop changes" pattern)
  // rather than in a useEffect, so the reset lands in the same commit as
  // the scenario change instead of flashing the old state for one extra
  // frame.
  const [resetForScenarioId, setResetForScenarioId] = useState(activeScenario?.id ?? null);
  if (resetForScenarioId !== (activeScenario?.id ?? null)) {
    setResetForScenarioId(activeScenario?.id ?? null);
    setCurrentKeyframeIndex(0);
    setIsPlaying(false);
    setSheltersVisible(false);
  }

  const mergedMapState = useMemo(
    () => (activeScenario ? getMergedStateForIndex(activeScenario, currentKeyframeIndex) : null),
    [activeScenario, currentKeyframeIndex],
  );

  const activeMapState = interventionApplied && activeScenario ? activeScenario.intervention : mergedMapState;

  // MapView already renders `scenario.baseline` as its data source, so
  // the simplest way to feed it either the time-merged state or the
  // intervention state is to pass a shallow-cloned scenario with
  // `baseline` swapped for whichever applies.
  const mapViewScenario = useMemo(
    () => (activeScenario ? { ...activeScenario, baseline: activeMapState } : null),
    [activeScenario, activeMapState],
  );

  const timelineStatusText = useMemo(() => {
    if (!activeScenario) return '';
    if (currentKeyframeIndex <= 0) return 'Scenario baseline established.';
    const prevState = getMergedStateForIndex(activeScenario, currentKeyframeIndex - 1);
    return describeDelta(prevState, mergedMapState);
  }, [activeScenario, currentKeyframeIndex, mergedMapState]);

  // NOTE: per-keyframe causal factors (getCausalFactorsForIndex) are
  // recomputed directly inside handleChatSubmit for the T+0 activation
  // response below. A `currentKeyframeIndex`-reactive version of this
  // will be needed again once Task 2 builds the timeline-briefing turn
  // for later keyframes.

  const appendTurn = useCallback((turn) => {
    setChatTurns((prev) => [...prev, { id: nextTurnId(), ...turn }]);
  }, []);

  // The one chat-intent handler this task implements: scenario
  // activation (Section 5 item 1). Timeline advancement and intervention
  // parsing are Task 2/3's job — anything typed here today still runs
  // through matchScenario, same as the old free-text input did. A
  // fixed, dedicated intent dispatcher (so e.g. "next" doesn't
  // re-trigger a full scenario re-activation) is explicitly Task 2's
  // scope (Section 5's closing paragraph / Task 2's must-deliver list).
  function handleChatSubmit(event) {
    event.preventDefault();
    if (isThinking) return; // ignore double-submits mid "thinking"

    const query = inputValue.trim();
    if (!query) return;

    appendTurn({ kind: 'user', text: query });
    setInputValue('');

    const matched = matchScenario(query);

    // Real work (map mount / camera fly-in) starts immediately, running
    // CONCURRENTLY with the fake processing cascade below — not gated
    // behind it (Section 6).
    setActiveScenario(matched);

    const lines = buildProcessingLines(matched);
    appendTurn({ kind: 'processing', lines });
    setIsThinking(true);

    if (pendingResponseTimeoutRef.current) {
      window.clearTimeout(pendingResponseTimeoutRef.current);
    }
    // Timed to line up with how long the cascade visibly takes to
    // finish printing its lines (see ProcessingTurn in ChatMessage.jsx),
    // plus a small settle buffer.
    pendingResponseTimeoutRef.current = window.setTimeout(() => {
      const t0MapState = getMergedStateForIndex(matched, 0);
      const t0CausalFactors = getCausalFactorsForIndex(matched, 0);
      const content = buildAnalystContent(matched, t0MapState, false, t0CausalFactors);
      appendTurn({ kind: 'activation-response', content });
      setIsThinking(false);
    }, estimateProcessingDurationMs(lines) + RESPONSE_APPEND_BUFFER_MS);
  }

  // Task 1 keeps TimelineScrubber fully interactive (unchanged from
  // before) — whether it becomes read-only once chat drives advancement
  // is Task 2's explicitly-flagged judgment call (Section 3), not
  // resolved here.
  function handleTimelineIndexChange(nextIndex) {
    setCurrentKeyframeIndex(nextIndex);
  }

  const isActivated = Boolean(activeScenario);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      {/* Header, chat panel, and the timeline slot below are ALWAYS
          rendered — only the map viewport itself switches between its
          idle (pre-activation) and active look. */}
      <header className="shrink-0 border-b border-hairline bg-canvas">
        <TopNav />
      </header>

      <main className="flex min-h-0 flex-1 flex-col xl:flex-row">
        {/* LEFT: map viewport (hero element) + timeline strip pinned beneath it */}
        <section className="flex min-h-0 flex-1 flex-col border-hairline xl:w-[65%] xl:flex-none xl:border-r">
          <div className="relative min-h-[320px] flex-1 bg-canvas">
            {!isActivated ? (
              // Idle map viewport (Section 4): full-black canvas, no map
              // mounted, brand text centered within the viewport only —
              // header/chat/timeline stay visible around it.
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-2xl uppercase tracking-[0.5em] text-ink-dim/70">Foreseen</p>
              </div>
            ) : activeScenario.id === 'security-attack' ? (
              <>
                {/*
                  TEMPORARY BRIDGE: MapLibreView (real 3D MapLibre GL JS
                  map) is wired up for the security-attack scenario ONLY.
                  Every other scenario still renders through the legacy
                  SVG MapView, untouched — unrelated to this task's chat
                  redesign.
                */}
                <MapLibreView
                  scenario={mapViewScenario}
                  timelineIndex={currentKeyframeIndex}
                  sheltersVisible={sheltersVisible}
                />
                <MapToolbar sheltersVisible={sheltersVisible} onToggleShelters={setSheltersVisible} />
              </>
            ) : (
              <MapView scenario={mapViewScenario} />
            )}

            {isThinking && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-canvas/70 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  {/* A simple pulsing building silhouette, so the map
                      viewport reads as "actively building the scene"
                      rather than just a spinner. */}
                  <svg viewBox="0 0 64 48" width="56" height="42" className="animate-pulse text-accent/70" fill="none">
                    <rect x="6" y="20" width="12" height="24" fill="currentColor" opacity="0.5" />
                    <rect x="22" y="10" width="12" height="34" fill="currentColor" opacity="0.75" />
                    <rect x="38" y="26" width="10" height="18" fill="currentColor" opacity="0.4" />
                    <rect x="50" y="16" width="10" height="28" fill="currentColor" opacity="0.6" />
                  </svg>
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                  <p className="animate-pulse text-[11px] uppercase tracking-[0.32em] text-accent">
                    Compiling threat picture…
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 px-4 py-3">
            {isActivated ? (
              <TimelineScrubber
                keyframes={activeScenario.timeline}
                currentIndex={currentKeyframeIndex}
                onIndexChange={handleTimelineIndexChange}
                isPlaying={isPlaying}
                onPlayToggle={setIsPlaying}
                statusText={timelineStatusText}
              />
            ) : (
              // Same slot/height as the real scrubber so the layout
              // never shifts on activation — just an inactive label
              // until a scenario exists to scrub through.
              <div className="flex h-[52px] items-center text-[10px] uppercase tracking-[0.3em] text-ink-faint">
                Timeline — awaiting scenario activation
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: the chat — the ONLY control surface (Section 1),
            always visible, input pinned in place regardless of
            activation state. */}
        <ChatPanel
          turns={chatTurns}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSubmit={handleChatSubmit}
          isThinking={isThinking}
          placeholder={
            isActivated ? 'e.g. next, or describe a new scenario' : 'e.g. high-severity hostile attack in Central Delhi'
          }
        />
      </main>
    </div>
  );
}

export default CommandShell;