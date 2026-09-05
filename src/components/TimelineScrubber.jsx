import { useEffect, useRef, useState } from 'react';

// Auto-play advances one keyframe every 1.5-2s (spec range) — fixed at
// 1700ms rather than randomized, since a scrubber's playback pace reading
// as *consistent* matters more than the "AI thinking" delay's realism.
const PLAY_INTERVAL_MS = 1700;

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M4 2.5v11l10-5.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="2.5" width="3.2" height="11" rx="0.6" />
      <rect x="9.3" y="2.5" width="3.2" height="11" rx="0.6" />
    </svg>
  );
}

/** Parses a "T+15" style label into its minute count, defaulting to the
 * keyframe's own index * 5 if the label doesn't match that shape. */
function minutesFromLabel(label, index) {
  const match = /T\+(\d+)/.exec(label || '');
  return match ? Number(match[1]) : index * 5;
}

/**
 * Stepped (non-continuous) timeline scrubber. Fully controlled: the
 * `currentIndex`/`isPlaying` state lives in CommandShell (same pattern as
 * `activeScenario` from Task 4), since MapView needs the derived merged
 * state as a sibling, not a child, of this component.
 *
 * Props:
 * - keyframes: scenario.timeline array (each entry has a `label`)
 * - currentIndex, onIndexChange(index)
 * - isPlaying, onPlayToggle(nextIsPlaying)
 * - statusText: precomputed diff description for the current step
 */
export function TimelineScrubber({
  keyframes,
  currentIndex,
  onIndexChange,
  isPlaying,
  onPlayToggle,
  statusText,
}) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const safeKeyframes = Array.isArray(keyframes) && keyframes.length > 0 ? keyframes : [{ label: 'T+0' }];
  const keyframeCount = safeKeyframes.length;
  const lastIndex = keyframeCount - 1;
  const clampedIndex = Math.min(currentIndex, lastIndex);

  useEffect(() => {
    if (keyframeCount !== 5) {
      // eslint-disable-next-line no-console
      console.warn(
        `TimelineScrubber: expected 5 keyframes, got ${keyframeCount}. Clamping playback to the available range.`,
      );
    }
  }, [keyframeCount]);

  // Auto-play: advance one step every PLAY_INTERVAL_MS. Stops (does not
  // loop) once it reaches the final keyframe.
  useEffect(() => {
    if (!isPlaying) return undefined;

    if (clampedIndex >= lastIndex) {
      onPlayToggle(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onIndexChange(clampedIndex + 1);
    }, PLAY_INTERVAL_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isPlaying, clampedIndex, lastIndex, onIndexChange, onPlayToggle]);

  function handlePlayClick() {
    if (isPlaying) {
      onPlayToggle(false);
      return;
    }
    // Restart from the beginning if playback already reached the end.
    if (clampedIndex >= lastIndex) {
      onIndexChange(0);
    }
    onPlayToggle(true);
  }

  function indexFromClientX(clientX) {
    const el = trackRef.current;
    if (!el || lastIndex === 0) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
    const clamped = Math.min(1, Math.max(0, ratio));
    return Math.round(clamped * lastIndex);
  }

  function jumpTo(index) {
    const next = Math.min(lastIndex, Math.max(0, index));
    if (next !== clampedIndex) onIndexChange(next);
  }

  function handleTrackPointerDown(event) {
    onPlayToggle(false);
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    jumpTo(indexFromClientX(event.clientX));
  }

  function handleTrackPointerMove(event) {
    if (!dragging) return;
    // Snap to the nearest tick live, as the pointer crosses the halfway
    // point between two ticks — not a free-floating continuous position.
    jumpTo(indexFromClientX(event.clientX));
  }

  function handleTrackPointerUp(event) {
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      jumpTo(clampedIndex + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      jumpTo(clampedIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      jumpTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      jumpTo(lastIndex);
    }
  }

  const progressPercent = lastIndex === 0 ? 100 : (clampedIndex / lastIndex) * 100;
  const currentLabel = safeKeyframes[clampedIndex]?.label || `T+${clampedIndex}`;
  const currentMinutes = minutesFromLabel(currentLabel, clampedIndex);

  return (
    <div className="flex min-w-[200px] flex-1 flex-col gap-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-slate-400">
        <span>Timeline scrubber</span>
        <span className="font-mono normal-case tracking-normal text-slate-300">
          {currentLabel} · {currentMinutes} min elapsed
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handlePlayClick}
          aria-label={isPlaying ? 'Pause scenario timeline' : 'Play scenario timeline'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent transition hover:bg-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <div className="relative flex-1 py-3">
          {/* Track background */}
          <div
            ref={trackRef}
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handleTrackPointerMove}
            onPointerUp={handleTrackPointerUp}
            onPointerCancel={handleTrackPointerUp}
            className="relative h-1 cursor-pointer rounded-full bg-slate-700/40"
          >
            {/* Progress fill behind the playhead */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent/70 transition-[width] duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Ticks */}
            {safeKeyframes.map((keyframe, index) => {
              const left = lastIndex === 0 ? 0 : (index / lastIndex) * 100;
              const passed = index <= clampedIndex;
              const label = keyframe.label || `T+${index}`;
              const minutes = minutesFromLabel(label, index);
              return (
                <button
                  key={label + index}
                  type="button"
                  title={`${minutes} minutes elapsed`}
                  aria-label={`Jump to ${label}, ${minutes} minutes elapsed`}
                  onClick={() => {
                    onPlayToggle(false);
                    jumpTo(index);
                  }}
                  className="group absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center focus:outline-none"
                  style={{ left: `${left}%` }}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full border-2 transition-colors duration-300 ${
                      passed
                        ? 'border-accent bg-accent'
                        : 'border-slate-600 bg-slate-900 group-hover:border-slate-400'
                    }`}
                  />
                  <span
                    className={`mt-2 text-[9px] uppercase tracking-[0.15em] transition-colors duration-300 ${
                      passed ? 'text-accent' : 'text-slate-500'
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}

            {/* Draggable playhead */}
            <div
              role="slider"
              tabIndex={0}
              aria-label="Scenario timeline position"
              aria-valuemin={0}
              aria-valuemax={lastIndex}
              aria-valuenow={clampedIndex}
              aria-valuetext={`${currentLabel}, ${currentMinutes} minutes elapsed`}
              onPointerDown={handleTrackPointerDown}
              onPointerMove={handleTrackPointerMove}
              onPointerUp={handleTrackPointerUp}
              onPointerCancel={handleTrackPointerUp}
              onKeyDown={handleKeyDown}
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-slate-950 bg-accent shadow-[0_0_16px_rgba(94,234,212,0.7)] transition-[left] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:cursor-grabbing"
              style={{ left: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {statusText && (
        <p className="truncate text-[11px] text-slate-400">
          <span className="text-accent">›</span> {statusText}
        </p>
      )}
    </div>
  );
}

export default TimelineScrubber;