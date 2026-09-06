import { useMemo, useState } from 'react';
import { systemOverview } from '../data/systemOverview';
import { scenarioPresets } from '../scenarios/scenarioPresets';
import { describeDelta } from '../utils/describeKeyframeDelta';
import { mergeKeyframesUpTo } from '../utils/mergeKeyframe';
import { getScenarioById, matchScenario, scenarios } from '../utils/scenarioMatcher';
import { CausalBreakdown } from './CausalBreakdown';
import { ComparisonPanel } from './ComparisonPanel';
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
 * the UI, per Task 5's data-requirements spec.
 */
function getMergedStateForIndex(scenario, index) {
  if (index <= 0 || !Array.isArray(scenario.timeline) || scenario.timeline.length === 0) {
    return scenario.baseline;
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
 * Causal factors are a static per-scenario snapshot by default (Task 2's
 * data model — one `causalFactors` object per scenario, not per
 * keyframe). This adds a lightweight, backward-compatible per-keyframe
 * override on top of that: if the keyframe object at `scenario.timeline`
 * index `index` optionally carries its own `causalFactors`, that's used
 * instead; otherwise this falls back to the scenario-level static value.
 * No existing scenario JSON needs to change for this — none of the four
 * current datasets define per-keyframe factors yet, so today's behavior
 * is identical to the plain static approach, but a future task/dataset
 * can add per-keyframe factors without touching this code again.
 */
function getCausalFactorsForIndex(scenario, index) {
  const timeline = scenario.timeline;
  if (!Array.isArray(timeline) || timeline.length === 0 || index <= 0) {
    return scenario.causalFactors;
  }
  const clampedIndex = Math.min(index, timeline.length - 1);
  return timeline[clampedIndex]?.causalFactors ?? scenario.causalFactors;
}

// Fake "AI thinking" delay range (ms) for free-text scenario input, so
// the keyword match feels like real processing rather than an instant
// lookup. Preset chips skip this entirely (see handlePresetClick).
const THINKING_DELAY_MIN = 1100;
const THINKING_DELAY_MAX = 1900;

function randomThinkingDelay() {
  return THINKING_DELAY_MIN + Math.random() * (THINKING_DELAY_MAX - THINKING_DELAY_MIN);
}

// Task 8: preset chips lost their bordered/pill treatment in the flat
// layout, but still need to read as a severity signal at a glance — so
// each chip's label color (not a border/background) maps to its
// existing `severity` field via the same risks-* tokens riskStyles.js
// already uses elsewhere.
const PRESET_TEXT_CLASS = {
  green: 'text-risks-green',
  yellow: 'text-risks-yellow',
  orange: 'text-risks-orange',
  red: 'text-risks-red',
};

export function CommandShell() {
  // Security scenarios are the primary demo use case, so that's the
  // default active scenario (matches Task 3's hardcoded starting point).
  const [activeScenario, setActiveScenario] = useState(scenarios[0]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  // Timeline scrubber state. Lives here (not inside TimelineScrubber)
  // because MapView is a sibling that also needs the derived merged
  // state — same reasoning as why activeScenario lives here (Task 4).
  const [currentKeyframeIndex, setCurrentKeyframeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Task 7: whether the user has clicked "Apply intervention" for the
  // current scenario. Owned here, same pattern as the timeline state
  // above, since both ComparisonPanel and MapView need to react to it.
  const [interventionApplied, setInterventionApplied] = useState(false);

  // Switching scenarios (free-text match or preset chip) must never carry
  // a mid-timeline position — or an applied intervention — into the
  // newly-selected scenario. Reset it during render (React's documented
  // "adjust state when a prop changes" pattern) rather than in a
  // useEffect, so the reset lands in the same commit as the scenario
  // change instead of flashing the old state for one extra frame.
  const [resetForScenarioId, setResetForScenarioId] = useState(activeScenario.id);
  if (resetForScenarioId !== activeScenario.id) {
    setResetForScenarioId(activeScenario.id);
    setCurrentKeyframeIndex(0);
    setIsPlaying(false);
    setInterventionApplied(false);
  }

  const mergedMapState = useMemo(
    () => getMergedStateForIndex(activeScenario, currentKeyframeIndex),
    [activeScenario, currentKeyframeIndex],
  );

  // Task 7: when an intervention has been applied, MapView shows the
  // scenario's `intervention` state instead of the timeline-merged one —
  // chosen over trying to also fold the current `currentKeyframeIndex` on
  // top of it, since `intervention` already represents a full alternate
  // baseline-shaped end-state ("what we did about it"), not another point
  // on the same unmitigated timeline. Combining both cleanly would need a
  // second merge axis for comparatively little demo value. Scrubbing the
  // timeline while an intervention is active resets `interventionApplied`
  // instead (see handleTimelineIndexChange) specifically so this override
  // can stay this simple without the two ever needing to coexist.
  const activeMapState = interventionApplied ? activeScenario.intervention : mergedMapState;

  // MapView already renders `scenario.baseline` as its data source (Task
  // 3/4), so the simplest way to feed it either the time-merged state or
  // the intervention state is to pass a shallow-cloned scenario with
  // `baseline` swapped for whichever applies — no MapView changes needed
  // for *which* state it renders, and it animates into the new state via
  // the same CSS-transition/ghost-crossfade machinery from Task 5.
  const mapViewScenario = useMemo(
    () => ({ ...activeScenario, baseline: activeMapState }),
    [activeScenario, activeMapState],
  );

  const timelineStatusText = useMemo(() => {
    if (currentKeyframeIndex <= 0) return 'Scenario baseline established.';
    const prevState = getMergedStateForIndex(activeScenario, currentKeyframeIndex - 1);
    return describeDelta(prevState, mergedMapState);
  }, [activeScenario, currentKeyframeIndex, mergedMapState]);

  const activeCausalFactors = useMemo(
    () => getCausalFactorsForIndex(activeScenario, currentKeyframeIndex),
    [activeScenario, currentKeyframeIndex],
  );

  // Task 8: "Quick Analytics" glanceable stat tiles. Derived entirely from
  // data already flowing into CausalBreakdown/ComparisonPanel — the three
  // comparisonStats figures (flipping to the "after" value once an
  // intervention is applied, same convention ComparisonPanel itself uses)
  // plus a shelter count read off the same activeMapState already passed
  // to MapView. No new data source is introduced for this panel.
  const quickStats = useMemo(() => {
    const stats = activeScenario.comparisonStats;
    return [
      {
        key: 'evacTime',
        label: 'Evac time',
        value: `${interventionApplied ? stats.evacTimeAfter : stats.evacTimeBefore} min`,
      },
      {
        key: 'overload',
        label: 'Overload',
        value: `${interventionApplied ? stats.overloadAfter : stats.overloadBefore}%`,
      },
      {
        key: 'riskZones',
        label: 'Risk zones',
        value: `${interventionApplied ? stats.riskZonesAfter : stats.riskZonesBefore}`,
      },
      {
        key: 'shelters',
        label: 'Shelters',
        value: `${activeMapState.shelters.length}`,
      },
    ];
  }, [activeScenario, interventionApplied, activeMapState]);

  function handleScenarioSubmit(event) {
    event.preventDefault();
    if (isThinking) return; // ignore double-submits mid "thinking"

    const query = inputValue;
    setIsThinking(true);

    // Fake AI processing delay — the actual match is instant, but a
    // real lookup happening in 0ms wouldn't sell the "AI interpreting
    // your scenario" moment the demo is going for.
    window.setTimeout(() => {
      const matched = matchScenario(query);
      setActiveScenario(matched);
      setIsThinking(false);
    }, randomThinkingDelay());
  }

  function handlePresetClick(scenarioId) {
    // Preset chips are a known, direct scenario reference — no need to
    // run them through the matcher or fake a thinking delay.
    const matched = getScenarioById(scenarioId);
    setActiveScenario(matched);
    setInputValue('');
  }

  // Task 7, point 4: scrubbing the timeline while an intervention is
  // applied automatically clears `interventionApplied` — treated as
  // "stepping back into the unmitigated timeline." Chosen over dimming
  // the scrubber and ignoring input, since a single choke point here
  // (every drag/click/keyboard/autoplay path in TimelineScrubber routes
  // through onIndexChange) is simpler to get right than disabling an
  // interactive control mid-gesture.
  function handleTimelineIndexChange(nextIndex) {
    if (interventionApplied) setInterventionApplied(false);
    setCurrentKeyframeIndex(nextIndex);
  }

  // Task 7, point 5: no revert affordance — once applied, the button is
  // simply disabled (see ComparisonPanel) until a scenario switch or
  // timeline scrub resets it. Simpler than adding a secondary "Reset"
  // link, and those two existing reset paths already cover "I want to see
  // the baseline again" without a redundant third control.
  function handleApplyIntervention() {
    if (interventionApplied) return;
    setInterventionApplied(true);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      <header className="shrink-0 border-b border-hairline bg-canvas">
        <TopNav />
      </header>

      <main className="flex min-h-0 flex-1 flex-col xl:flex-row">
        {/* LEFT: map (hero element) + timeline scrubber pinned beneath it */}
        <section className="flex min-h-0 flex-1 flex-col border-hairline xl:w-[65%] xl:flex-none xl:border-r">
          <div className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-ink-dim">Network overview</p>
              <h2 className="mt-1 text-lg font-semibold text-ink">{systemOverview.incident}</h2>
            </div>
            <div className="rounded-full border border-risks-red/40 bg-risks-red/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-risks-red">
              {isThinking ? 'Interpreting scenario…' : activeScenario.name}
            </div>
          </div>

          <div className="relative min-h-[320px] flex-1">
            <MapView scenario={mapViewScenario} />

            {isThinking && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-canvas/70 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                  <p className="animate-pulse text-[11px] uppercase tracking-[0.32em] text-accent">
                    AI interpreting scenario…
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 px-4 py-3">
            <TimelineScrubber
              keyframes={activeScenario.timeline}
              currentIndex={currentKeyframeIndex}
              onIndexChange={handleTimelineIndexChange}
              isPlaying={isPlaying}
              onPlayToggle={setIsPlaying}
              statusText={timelineStatusText}
            />
          </div>
        </section>

        {/* RIGHT: quick analytics / detailed analytics / scenario chat, each
            separated by a single hairline divider — no nested card boxes */}
        <aside className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:w-[35%] xl:flex-none">
          <div className="shrink-0 border-b border-hairline px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.28em] text-ink-dim">Quick analytics</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {quickStats.map((stat) => (
                <div key={stat.key} className="rounded-lg bg-surface px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-ink-dim">{stat.label}</p>
                  <p className="mt-1 text-xl font-semibold text-ink">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto border-b border-hairline px-4 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-ink-dim">Detailed analytics</p>
              <div className="mt-3">
                <CausalBreakdown factors={activeCausalFactors} />
              </div>
            </div>

            <ComparisonPanel
              comparisonStats={activeScenario.comparisonStats}
              interventionApplied={interventionApplied}
              onApply={handleApplyIntervention}
            />
          </div>

          <div className="shrink-0 border-t border-hairline px-4 py-4">
            <div className="flex flex-wrap gap-1">
              {scenarioPresets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handlePresetClick(preset.scenarioId)}
                  className={`rounded-md px-2 py-1 text-[10px] uppercase tracking-[0.24em] transition hover:bg-surface ${
                    PRESET_TEXT_CLASS[preset.severity] || 'text-ink-dim'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>

            <label htmlFor="scenario" className="mt-3 block text-[10px] uppercase tracking-[0.3em] text-ink-dim">
              Scenario input
            </label>
            <form
              onSubmit={handleScenarioSubmit}
              className="mt-2 flex items-center gap-2 border-b border-hairline pb-2"
            >
              {isThinking ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              ) : (
                <span className="text-accent">›</span>
              )}
              <input
                id="scenario"
                type="text"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                disabled={isThinking}
                placeholder="e.g. high-severity hostile attack in Central Delhi"
                className="w-full border-0 bg-transparent font-mono text-sm text-ink outline-none placeholder:text-ink-faint disabled:opacity-60"
              />
            </form>
          </div>
        </aside>
      </main>
    </div>
  );
}