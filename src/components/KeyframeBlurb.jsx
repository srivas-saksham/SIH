import { useEffect, useState } from 'react';

const CHAR_DELAY_MS = 12;

/**
 * Floating description card, bottom-left of the map viewport — mirrors
 * MapToolbar's floating-chrome treatment (top-left) but for a different
 * purpose: a short (~15-20 word) sentence of what actually happened at
 * the CURRENT keyframe, sourced from that keyframe's own `blurb` field
 * in the scenario JSON. Changes every time `keyframeIndex` changes,
 * types itself out character-by-character on each change (same
 * technique as ChatMessage.jsx's TypewriterHeadline) so it visibly
 * reads as "live", not a static caption sitting in the corner.
 *
 * Pure UI chrome, same reasoning as MapToolbar: absolutely positioned
 * over the map `<div>`, not a maplibregl.Marker or map layer.
 *
 * Task 3 addition: `label`/`text` can be overridden by CommandShell to
 * show a dedicated blurb for the capacity-boost "what if" keyframe
 * (e.g. "Capacity +30%" / "Every shelter's rated capacity increased by
 * 30% more…") instead of whatever the underlying T+N keyframe's own
 * `blurb` says. This is a plain prop override, not a second code path —
 * CommandShell decides which text to pass down, this component just
 * types out whatever it's given, exactly as before.
 */
export function KeyframeBlurb({ label, text }) {
  const [charCount, setCharCount] = useState(0);

  // Restart the typewriter whenever the text itself changes (i.e. a new
  // keyframe is active). Adjusted during render (React's documented
  // "adjust state when a prop changes" pattern — same technique
  // CommandShell already uses for its own scenario-switch reset) rather
  // than in an effect, so the reset lands in the same commit as the
  // text change instead of an extra render.
  const [lastText, setLastText] = useState(text);
  if (text !== lastText) {
    setLastText(text);
    setCharCount(0);
  }

  useEffect(() => {
    if (!text || charCount >= text.length) return undefined;
    const id = window.setTimeout(() => setCharCount((count) => count + 1), CHAR_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [charCount, text]);

  if (!text) return null;

  const done = charCount >= text.length;

  return (
    <div
        className="pointer-events-none absolute left-3 z-30 max-w-[340px]"
        style={{ bottom: '10px' }}
        >
      <div className="pointer-events-auto rounded-lg border border-hairline bg-canvas/85 px-3 py-2 backdrop-blur-sm">
        {label && <p className="text-[12px] uppercase tracking-[0.24em] text-accent/80">{label}</p>}
        <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">
          {text.slice(0, charCount)}
          {!done && <span className="inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-accent align-middle" />}
        </p>
      </div>
    </div>
  );
}

export default KeyframeBlurb;