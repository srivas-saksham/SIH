import { useCallback, useMemo, useRef, useState } from 'react';
import { describeDelta } from '../utils/describeKeyframeDelta';
import { mergeKeyframesUpTo } from '../utils/mergeKeyframe';
import { matchScenario, hasNoConfidentScenarioMatch } from '../utils/scenarioMatcher';
import {
  buildAnalystContent,
  buildTimelineBriefingContent,
  buildRoadsQueryContent,
  buildSheltersQueryContent,
  buildInterventionResponseContent,
} from '../utils/buildAnalystContent';
import { computeCausalFactors } from '../utils/causalFactors';
import {
  buildProcessingLines,
  buildTimelineAdvanceLines,
  buildInterventionLines,
  estimateProcessingDurationMs,
} from '../utils/processingCascade';
import {
  parseTimelineIntent,
  parseContentQueryIntent,
  parseInterventionIntent,
  isClearChatCommand,
} from '../utils/timelineIntent';
import { METRO_SHELTERS } from '../data/delhiMetroShelters';
import { ChatPanel } from './ChatPanel';
import { KeyframeBlurb } from './KeyframeBlurb';
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
 * Causal factors are read PRIMARILY from each keyframe's hand-authored
 * `causalFactors` object in the scenario JSON (per follow-up feedback:
 * these are now a deliberately hardcoded, hand-tuned story — shelter
 * deficit rising as shelters fill, road accessibility spiking then
 * recovering as routes reopen, infrastructure damage climbing steadily,
 * population density held roughly flat) rather than purely derived from
 * the merged map state. If a keyframe doesn't define an explicit
 * `causalFactors` object (e.g. a future scenario that hasn't been
 * hand-tuned yet), this falls back to computeCausalFactors, which
 * derives the same four figures live from shelter occupancy ratios,
 * building risk mix, and road status — so every scenario still shows
 * *some* real, moving numbers even without hand-authored data.
 */
function getCausalFactorsForIndex(scenario, index) {
  const timeline = scenario.timeline;
  const explicitOverride =
    Array.isArray(timeline) && timeline.length > 0
      ? timeline[Math.min(Math.max(index, 0), timeline.length - 1)]?.causalFactors
      : undefined;
  if (explicitOverride) return explicitOverride;

  const mapState = getMergedStateForIndex(scenario, index);
  return computeCausalFactors(mapState);
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
  const pendingAdvanceTimeoutRef = useRef(null);
  const pendingInterventionTimeoutRef = useRef(null);

  // Bumped every time a new turn should force the chat to snap to the
  // very bottom, regardless of whether `chatTurns` itself has grown yet
  // (e.g. the moment "next" is submitted, before the briefing turn has
  // even been appended) — ChatPanel scrolls on both `chatTurns` changes
  // AND this counter changing.
  const [scrollNonce, setScrollNonce] = useState(0);
  const bumpScroll = useCallback(() => setScrollNonce((n) => n + 1), []);

  // Timeline scrubber state. Lives here (not inside TimelineScrubber)
  // because MapView/MapLibreView are siblings that also need the derived
  // merged state.
  const [currentKeyframeIndex, setCurrentKeyframeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Whether an intervention has been applied for the current scenario
  // (Task 3). Once true, `activeMapState` below fully swaps to the
  // scenario's single hand-authored `intervention` state — same pattern
  // Task 2 already relied on this state existing for.
  const [interventionApplied, setInterventionApplied] = useState(false);

  // Map toolbar: shelters default OFF.
  const [sheltersVisible, setSheltersVisible] = useState(false);

  // Search-driven camera target for MapLibreView (shelters/roads chat
  // queries). `nonce` is bumped on every submit so a repeat of the same
  // query still re-triggers the flyTo.
  const [flyToTarget, setFlyToTarget] = useState(null);
  const flyToNonceRef = useRef(0);
  const lastShelterIdRef = useRef(null);

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
    setInterventionApplied(false);
    lastShelterIdRef.current = null;
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

  // Fixed "Quick Analytics" panel (pinned above the chat history, not a
  // per-turn element): the causal-factors object for whatever keyframe
  // is currently on screen, derived straight from
  // activeScenario/currentKeyframeIndex — same source
  // ActivationResponseTurn/TimelineBriefingTurn used before these bars
  // were pulled out of chat turns — so it updates on EVERY keyframe
  // change, including a direct TimelineScrubber drag, not only
  // chat-driven "next" turns.
  const currentKeyframe = activeScenario?.timeline?.[currentKeyframeIndex];
  const currentCausalFactors = useMemo(
    () => (activeScenario ? getCausalFactorsForIndex(activeScenario, currentKeyframeIndex) : null),
    [activeScenario, currentKeyframeIndex],
  );

  const appendTurn = useCallback(
    (turn) => {
      setChatTurns((prev) => [...prev, { id: nextTurnId(), ...turn }]);
      bumpScroll();
    },
    [bumpScroll],
  );

  /**
   * The one shared timeline-advancement handler (Task 2's must-deliver
   * list, refined per follow-up feedback): `target` is either the
   * literal string 'next' or an explicit keyframe index. Wired to BOTH
   * the inline "Next: T+N" chat button (rendered at the end of
   * activation/briefing turns) AND the text dispatcher inside
   * handleChatSubmit below — there is only one code path that actually
   * changes `currentKeyframeIndex` and appends a briefing turn, so the
   * two triggers can never drift out of sync.
   *
   * Refinement: this no longer flips `currentKeyframeIndex` (and
   * therefore the map) instantly. It now runs its own processing
   * cascade turn first — mirroring scenario activation's pattern —
   * with the map viewport showing the same "thinking" overlay, and only
   * commits the index change (map update + briefing turn) once that
   * cascade has visibly finished, so advancing a keyframe reads as the
   * system actually recomputing something rather than an instant swap.
   */
  const advanceTimeline = useCallback(
    (target) => {
      if (!activeScenario || !Array.isArray(activeScenario.timeline) || isThinking) return;
      const lastIndex = activeScenario.timeline.length - 1;
      const prevIndex = currentKeyframeIndex;
      const targetIndex = target === 'next' ? prevIndex + 1 : target;
      const clampedIndex = Math.max(0, Math.min(lastIndex, targetIndex));

      // No-op (already at/past this point, or already at the end and
      // asked for "next"): don't run a cascade for nothing.
      if (clampedIndex === prevIndex) return;

      const keyframeLabel = activeScenario.timeline[clampedIndex]?.label || `T+${clampedIndex}`;
      const lines = buildTimelineAdvanceLines(keyframeLabel);
      appendTurn({ kind: 'processing', lines });
      setIsThinking(true);

      if (pendingAdvanceTimeoutRef.current) {
        window.clearTimeout(pendingAdvanceTimeoutRef.current);
      }
      pendingAdvanceTimeoutRef.current = window.setTimeout(() => {
        const prevState = getMergedStateForIndex(activeScenario, prevIndex);
        const nextState = getMergedStateForIndex(activeScenario, clampedIndex);
        const deltaText = describeDelta(prevState, nextState);
        const prevCausalFactors = getCausalFactorsForIndex(activeScenario, prevIndex);
        const causalFactors = getCausalFactorsForIndex(activeScenario, clampedIndex);
        const targetKeyframe = activeScenario.timeline[clampedIndex];
        const content = buildTimelineBriefingContent(
          activeScenario,
          prevState,
          nextState,
          interventionApplied,
          prevCausalFactors,
          causalFactors,
          deltaText,
          keyframeLabel,
          targetKeyframe?.phase,
          Boolean(targetKeyframe?.isAttack),
        );

        const isFinal = clampedIndex >= lastIndex;
        const nextLabel = isFinal ? null : activeScenario.timeline[clampedIndex + 1]?.label;

        // Commit the map/timeline change and the briefing turn together,
        // right as the cascade finishes — same "real update lands when
        // the fake processing visibly completes" pattern as activation.
        setCurrentKeyframeIndex(clampedIndex);
        appendTurn({ kind: 'timeline-briefing', content, isFinal, nextLabel });
        setIsThinking(false);
      }, estimateProcessingDurationMs(lines) + RESPONSE_APPEND_BUFFER_MS);
    },
    [activeScenario, currentKeyframeIndex, interventionApplied, isThinking, appendTurn],
  );

  /**
   * Follow-up must-deliver: "Roads nearby" / "Shelters in range" are now
   * ALSO reachable as their own dedicated turns — via the quick-action
   * buttons rendered on every activation/briefing turn, AND via typed
   * commands ("list all blocked roads", "shelters in range") caught by
   * parseContentQueryIntent below. Both paths land here. Unlike
   * advanceTimeline, this never changes `currentKeyframeIndex` or replays
   * a processing cascade — it's a lightweight "re-show me that block"
   * request against whatever keyframe is already on screen, so it
   * appends its turn immediately.
   */
  const handleQueryRoads = useCallback(
    (filter = 'all') => {
      if (!activeScenario) return;
      const content = buildRoadsQueryContent(activeScenario, mergedMapState, filter);
      appendTurn({ kind: 'roads-query', content });
      // Requirement: fly to a road matching the asked-for filter
      // (blocked/congested/clear); 'all' just takes the first road.
      const roads = mergedMapState?.roads;
      const road = Array.isArray(roads)
        ? (filter === 'all' ? roads[0] : roads.find((r) => r.status === filter)) || roads[0]
        : null;
      const coords = road?.coords;
      if (coords && coords.length > 0) {
        const [lat, lng] = coords[Math.floor(coords.length / 2)];
        flyToNonceRef.current += 1;
        setFlyToTarget({ lat, lng, zoom: 17, nonce: flyToNonceRef.current });
      }
    },
    [activeScenario, mergedMapState, appendTurn],
  );

  const handleQueryShelters = useCallback(() => {
    if (!activeScenario) return;
    // Typing/clicking a shelters query is a reasonable proxy for "I want
    // to see them on the map too" — flips the MapToolbar toggle on
    // rather than leaving the person to separately click it.
    setSheltersVisible(true);
    const content = buildSheltersQueryContent(activeScenario);
    appendTurn({ kind: 'shelters-query', content });
    // Requirement: the very first shelters query always flies to Rajiv
    // Chowk. Every query after that flies to a random OTHER shelter
    // (never repeats the one currently shown).
    let target;
    if (!lastShelterIdRef.current) {
      target = METRO_SHELTERS.find((s) => s.id === 'rajiv-chowk') || METRO_SHELTERS[0];
    } else {
      const others = METRO_SHELTERS.filter((s) => s.id !== lastShelterIdRef.current);
      const pool = others.length > 0 ? others : METRO_SHELTERS;
      target = pool[Math.floor(Math.random() * pool.length)];
    }
    if (target) {
      lastShelterIdRef.current = target.id;
      flyToNonceRef.current += 1;
      setFlyToTarget({ lat: target.lat, lng: target.lng, zoom: 17, nonce: flyToNonceRef.current });
    }
  }, [activeScenario, appendTurn]);

  /**
   * Intervention command (Task 3): "increase shelter capacity by 20%",
   * "apply intervention", "deploy more shelters", etc. Mirrors
   * advanceTimeline's pattern — a processing cascade turn first, then
   * the real state change (interventionApplied -> true, which swaps
   * `activeMapState` to the scenario's authored `intervention` state)
   * commits together with the intervention-response chat turn right as
   * the cascade finishes.
   *
   * Re-typing an intervention command once one is already applied is
   * treated as "show me that again" rather than an error or a second
   * cascade — there is only one authored intervention outcome, so
   * there's nothing further to compute.
   */
  const handleApplyIntervention = useCallback(
    (percent) => {
      if (!activeScenario || isThinking) return;

      if (interventionApplied) {
        const content = buildInterventionResponseContent(activeScenario, percent);
        appendTurn({ kind: 'intervention-response', content });
        return;
      }

      const lines = buildInterventionLines(percent);
      appendTurn({ kind: 'processing', lines });
      setIsThinking(true);

      if (pendingInterventionTimeoutRef.current) {
        window.clearTimeout(pendingInterventionTimeoutRef.current);
      }
      pendingInterventionTimeoutRef.current = window.setTimeout(() => {
        const content = buildInterventionResponseContent(activeScenario, percent);
        setInterventionApplied(true);
        appendTurn({ kind: 'intervention-response', content });
        setIsThinking(false);
      }, estimateProcessingDurationMs(lines) + RESPONSE_APPEND_BUFFER_MS);
    },
    [activeScenario, interventionApplied, isThinking, appendTurn],
  );

  // Intent dispatcher (Task 2's must-deliver list): runs BEFORE
  // matchScenario. Checks the typed text against the small fixed
  // timeline-advancement vocabulary first; only falls through to
  // matchScenario (today's only prior path) if it doesn't match. This is
  // the fix for the Section 5 "typing 'next' currently re-activates the
  // scenario" behavior — "next" no longer reaches matchScenario at all.
  function handleChatSubmit(event) {
    event.preventDefault();
    if (isThinking) return; // ignore double-submits mid "thinking"

    const query = inputValue.trim();
    if (!query) return;

    // "cls" (Task 2 follow-up): clears the entire chat history outright.
    // Checked before the user's own turn is echoed (echoing it first
    // would just be wiped in the same tick anyway, since React batches
    // both state updates into one render) and before every other
    // intent — it's a meta-command, not scenario/timeline content.
    if (isClearChatCommand(query)) {
      setChatTurns([]);
      setInputValue('');
      return;
    }

    appendTurn({ kind: 'user', text: query });
    setInputValue('');

    // Only meaningful once a scenario is active — there is no timeline
    // to advance before that, so an active scenario's keyframes are
    // passed in; if none is active this only recognizes bare "next"-
    // style words, which parseTimelineIntent still returns for (there's
    // simply nothing to do with them below).
    const timelineIntent = parseTimelineIntent(query, activeScenario?.timeline);
    if (timelineIntent && activeScenario) {
      if (timelineIntent.type === 'next') {
        advanceTimeline('next');
      } else {
        advanceTimeline(timelineIntent.index);
      }
      return;
    }

    // Intervention-command intent (Task 3) — checked BEFORE the
    // content-query intent below. Deliberately ordered this way: several
    // intervention phrasings ("increase shelter capacity by 20%",
    // "deploy more shelters") also contain the word "shelter(s)", which
    // parseContentQueryIntent alone would otherwise match first and
    // misroute to a shelters-query turn instead of actually applying the
    // intervention.
    const interventionIntent = parseInterventionIntent(query);
    if (interventionIntent && activeScenario) {
      handleApplyIntervention(interventionIntent.percent);
      return;
    }

    // Content-query intent ("list all blocked roads", "shelters in
    // range") — checked right after timeline-advancement/intervention,
    // still before matchScenario, and also only meaningful once a
    // scenario is active.
    const contentQueryIntent = parseContentQueryIntent(query);
    if (contentQueryIntent && activeScenario) {
      if (contentQueryIntent.type === 'roads') {
        handleQueryRoads(contentQueryIntent.filter);
      } else if (contentQueryIntent.type === 'shelters') {
        handleQueryShelters();
      }
      return;
    }

    // matchScenario always returns *some* scenario (even the generic
    // fallback) on zero keyword matches — it never signals "I don't know
    // what you mean" on its own. hasNoConfidentScenarioMatch is the
    // separate check Task 2 needs to catch stray/unclear input and show
    // the clarify-fallback turn instead of silently activating
    // generic-fallback.
    if (hasNoConfidentScenarioMatch(query)) {
      appendTurn({ kind: 'clarify-fallback' });
      return;
    }

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
      const hasMultipleKeyframes = Array.isArray(matched.timeline) && matched.timeline.length > 1;
      const nextLabel = hasMultipleKeyframes ? matched.timeline[1]?.label : null;
      appendTurn({ kind: 'activation-response', content, nextLabel });
      setIsThinking(false);
    }, estimateProcessingDurationMs(lines) + RESPONSE_APPEND_BUFFER_MS);
  }

  // TASK 2 DECISION (Section 3's flagged judgment call): TimelineScrubber
  // stays fully interactive rather than becoming read-only. Chat is the
  // primary/advertised control surface (inline "Next" button + typed
  // commands), but the scrubber is left as a secondary, direct-manipulation
  // shortcut for judges/demo audiences who want to jump around without
  // typing — dragging it is an instant, silent jump (no cascade, no
  // briefing turn), since it's treated as "looking", not "asking the
  // analyst for a briefing".
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
                  flyToTarget={flyToTarget}
                />
                <MapToolbar sheltersVisible={sheltersVisible} onToggleShelters={setSheltersVisible} />
                <KeyframeBlurb
                  label={activeScenario.timeline?.[currentKeyframeIndex]?.label}
                  text={activeScenario.timeline?.[currentKeyframeIndex]?.blurb}
                />
              </>
            ) : (
              <MapView scenario={mapViewScenario} />
            )}

            {isThinking && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-canvas/70 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  {/* A simple pulsing building silhouette, so the map
                      viewport reads as "actively building the scene"
                      rather than just a spinner. Also shown during
                      timeline advancement now, not just activation, so
                      "next" visibly re-processes the map instead of
                      instant-swapping. */}
                  <svg viewBox="0 0 64 48" width="56" height="42" className="animate-pulse text-accent/70" fill="none">
                    <rect x="6" y="20" width="12" height="24" fill="currentColor" opacity="0.5" />
                    <rect x="22" y="10" width="12" height="34" fill="currentColor" opacity="0.75" />
                    <rect x="38" y="26" width="10" height="18" fill="currentColor" opacity="0.4" />
                    <rect x="50" y="16" width="10" height="28" fill="currentColor" opacity="0.6" />
                  </svg>
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                  <p className="animate-pulse text-[11px] uppercase tracking-[0.32em] text-accent">
                    {isActivated ? 'Recomputing threat picture…' : 'Compiling threat picture…'}
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
          onAdvance={() => advanceTimeline('next')}
          onQueryRoads={handleQueryRoads}
          onQueryShelters={handleQueryShelters}
          scrollNonce={scrollNonce}
          causalFactors={isActivated ? currentCausalFactors : null}
          keyframeLabel={currentKeyframe?.label}
          placeholder={
            isActivated ? 'e.g. next, or describe a new scenario' : 'e.g. high-severity hostile attack in Central Delhi'
          }
        />
      </main>
    </div>
  );
}

export default CommandShell;