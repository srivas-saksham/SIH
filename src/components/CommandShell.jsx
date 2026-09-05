import { useMemo, useState } from 'react';
import { systemOverview } from '../data/systemOverview';
import { scenarioPresets } from '../scenarios/scenarioPresets';
import { describeDelta } from '../utils/describeKeyframeDelta';
import { mergeKeyframesUpTo } from '../utils/mergeKeyframe';
import { getRiskClasses } from '../utils/riskStyles';
import { getScenarioById, matchScenario, scenarios } from '../utils/scenarioMatcher';
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

// Fake "AI thinking" delay range (ms) for free-text scenario input, so
// the keyword match feels like real processing rather than an instant
// lookup. Preset chips skip this entirely (see handlePresetClick).
const THINKING_DELAY_MIN = 1100;
const THINKING_DELAY_MAX = 1900;

function randomThinkingDelay() {
  return THINKING_DELAY_MIN + Math.random() * (THINKING_DELAY_MAX - THINKING_DELAY_MIN);
}

function Dot({ level }) {
  const { dot } = getRiskClasses(level);
  return <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />;
}

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

  // Switching scenarios (free-text match or preset chip) must never carry
  // a mid-timeline position into the newly-selected scenario. Reset it
  // during render (React's documented "adjust state when a prop changes"
  // pattern) rather than in a useEffect, so the reset lands in the same
  // commit as the scenario change instead of flashing the old timeline
  // position for one extra frame.
  const [resetForScenarioId, setResetForScenarioId] = useState(activeScenario.id);
  if (resetForScenarioId !== activeScenario.id) {
    setResetForScenarioId(activeScenario.id);
    setCurrentKeyframeIndex(0);
    setIsPlaying(false);
  }

  const mergedMapState = useMemo(
    () => getMergedStateForIndex(activeScenario, currentKeyframeIndex),
    [activeScenario, currentKeyframeIndex],
  );

  // MapView already renders `scenario.baseline` as its data source (Task
  // 3/4), so the simplest way to feed it the time-merged state is to pass
  // a shallow-cloned scenario with `baseline` swapped for the merged
  // state — no MapView changes needed for *which* state it renders.
  const mapViewScenario = useMemo(
    () => ({ ...activeScenario, baseline: mergedMapState }),
    [activeScenario, mergedMapState],
  );

  const timelineStatusText = useMemo(() => {
    if (currentKeyframeIndex <= 0) return 'Scenario baseline established.';
    const prevState = getMergedStateForIndex(activeScenario, currentKeyframeIndex - 1);
    return describeDelta(prevState, mergedMapState);
  }, [activeScenario, currentKeyframeIndex, mergedMapState]);

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

  return (
    <div className="min-h-screen bg-background text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-5 lg:px-8">
        <header className="rounded-2xl border border-slate-800 bg-slate-950/70 shadow-[0_0_0_1px_rgba(15,23,42,0.8)] backdrop-blur">
          <TopNav />
        </header>

        <main className="mt-4 grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_360px]">
          <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.8)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(94,234,212,0.12),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.4),rgba(2,6,23,0.8))]" />
            <div className="relative flex h-full min-h-[540px] flex-col">
              <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Network overview</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-50">{systemOverview.incident}</h2>
                </div>
                <div className="rounded-full border border-risks-red/40 bg-risks-red/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-risks-red">
                  {isThinking ? 'Interpreting scenario…' : activeScenario.name}
                </div>
              </div>

              <div className="relative mt-4 min-h-[420px] flex-1 overflow-hidden">
                <MapView scenario={mapViewScenario} />

                {isThinking && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-slate-950/70 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                      <p className="animate-pulse text-[11px] uppercase tracking-[0.32em] text-accent">
                        AI interpreting scenario…
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.8)]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Causal breakdown</p>
                <span className="text-xs text-slate-300">4 nodes</span>
              </div>

              <div className="mt-4 space-y-3">
                {systemOverview.causalBreakdown.map((item) => {
                  const { pill } = getRiskClasses(item.risk);
                  return (
                    <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                          <Dot level={item.risk} />
                          {item.title}
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${pill}`}>
                          {item.risk}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Comparison</p>
              <div className="mt-4 space-y-3">
                {systemOverview.comparison.map((item, index) => (
                  <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-risks-green' : index === 1 ? 'bg-risks-red' : 'bg-risks-yellow'}`} />
                      <span className="text-sm text-slate-300">{item.label}</span>
                    </div>
                    <span className="font-mono text-sm text-slate-50">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </main>

        <footer className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.8)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <TimelineScrubber
              keyframes={activeScenario.timeline}
              currentIndex={currentKeyframeIndex}
              onIndexChange={setCurrentKeyframeIndex}
              isPlaying={isPlaying}
              onPlayToggle={setIsPlaying}
              statusText={timelineStatusText}
            />

            <div className="flex flex-1 flex-col gap-2 xl:max-w-[420px]">
              <label htmlFor="scenario" className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Scenario input
              </label>
              <form
                onSubmit={handleScenarioSubmit}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3"
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
                  className="w-full border-0 bg-transparent font-mono text-sm text-slate-100 outline-none placeholder:text-slate-500 disabled:opacity-60"
                />
              </form>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              {scenarioPresets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handlePresetClick(preset.scenarioId)}
                  className={`rounded-full border px-3 py-2 text-[10px] uppercase tracking-[0.24em] transition hover:brightness-125 ${getRiskClasses(preset.severity).pill}`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}