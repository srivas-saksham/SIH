/**
 * Floating map toggle row — absolutely positioned CSS chrome on top of
 * the MapLibre canvas (NOT a maplibregl.Marker or map layer; this is UI
 * chrome, same reasoning NEXT_STEPS.md gives for the T+0 attack notice:
 * it doesn't need to be world-anchored, so plain `position: absolute`
 * inside the same wrapping component as the map `<div>` is correct
 * here). Pinned to the map's top-left corner, a single horizontal row
 * of bare toggle buttons — no label/heading/panel chrome around them,
 * per explicit person request.
 *
 * Switch rebuilt on a REAL native <input type="checkbox">, not a
 * plain <button> faking a switch with manually-computed
 * translate-x/absolute-positioned dot math — that version's thumb
 * visibly overflowed its track when toggled on. A native checkbox
 * (visually hidden via `sr-only`) drives real checked/unchecked state
 * plus native click/keyboard/focus handling.
 *
 * ROOT CAUSE of the old overflow bug: the thumb span was nested INSIDE
 * the track span. Tailwind's `peer-checked:*` only ever compiles to a
 * `.peer:checked ~ .peer-checked\:{utility}` sibling selector — it can
 * only ever match elements that are literal siblings of the `.peer`
 * input under the same parent, never a descendant nested inside one of
 * those siblings. So the thumb's `peer-checked:translate-x-*` was
 * silently never applying against the track's real bounds; whatever
 * looked like "the dot going out" was actually the thumb rendered at
 * its default resting position with no working toggle transform at
 * all. Fixed by making BOTH the track and the thumb direct siblings of
 * the checkbox (all three are direct children of the same relatively-
 * positioned <label>), each absolutely positioned independently — now
 * `peer-checked:` genuinely applies to both.
 *
 * Track is 40px wide (w-10) with a 2px inset on each side; thumb is
 * 16px (w-4), so it always has exactly 2px clearance on whichever side
 * it rests against. The "on" position translates it by exactly
 * track-width − thumb-width − (2 × inset) = 40 − 16 − 4 = 20px
 * (translate-x-5) — landing it flush against the right inset with zero
 * overflow, not a guessed offset. `pl-12` on the label reserves exactly
 * the track's footprint (8px left offset + 40px width = 48px) so the
 * "Shelters" text starts right after it instead of overlapping.
 *
 * Currently a single toggle — "Shelters" — per explicit person request:
 * shelters (footprint polygons + floating status cards) should NOT
 * appear automatically the instant the scenario activates at T+0; they
 * default to hidden and are shown only once the person deliberately
 * flips this on. Built as a row that can take more buttons later (e.g.
 * "Labels", "Roads") without a redesign.
 */
export function MapToolbar({ sheltersVisible, onToggleShelters }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-30 flex flex-row gap-2">
      <label
        className={`pointer-events-auto relative flex cursor-pointer items-center rounded-full border py-1.5 pl-12 pr-3 text-[11px] uppercase tracking-[0.18em] backdrop-blur-sm transition-colors ${
          sheltersVisible
            ? 'border-accent bg-accent/15 text-ink'
            : 'border-hairline bg-canvas/85 text-ink-dim hover:border-ink-dim hover:bg-surface/85 hover:text-ink'
        }`}
      >
        <input
          type="checkbox"
          checked={sheltersVisible}
          onChange={(event) => onToggleShelters(event.target.checked)}
          className="peer sr-only"
        />
        <span className="absolute left-2 top-1/2 h-5 w-10 -translate-y-1/2 rounded-full bg-ink-dim transition-colors peer-checked:bg-accent" />
        <span className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 translate-x-0 rounded-full bg-canvas transition-transform peer-checked:translate-x-5" />
        <span className="ml-2"> Shelters </span>
      </label>
    </div>
  );
}