import { useEffect, useRef, useState } from 'react';
import { THEME_IDS, THEME_LABELS } from './maplibre/mapEngineCore';

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
 * Originally a single toggle — "Shelters" — per explicit person
 * request: shelters (footprint polygons + floating status cards)
 * should NOT appear automatically the instant the scenario activates
 * at T+0; they default to hidden and are shown only once the person
 * deliberately flips this on. Built as a row that can take more
 * buttons later without a redesign — which is exactly what the theme
 * control below is: the first thing added to that row since.
 *
 * Theme control (expanded from a dark/light toggle to a 3-theme
 * cycle — dark / light / satellite, ids+labels from mapEngineCore's
 * THEME_IDS/THEME_LABELS, the same list MapLibreEngine's STYLE_URLS
 * indexes into — see the big comment above STYLE_URLS in
 * mapEngineCore.js for what each theme actually loads). Per explicit
 * person request this is a plain <button>, not a second toggle switch
 * — that checkbox/peer-checked pattern models a binary on/off
 * *feature flag* (Shelters shown or hidden), whereas this control's
 * default action is "cycle to the next theme", a plain click action,
 * not a state switch a person would expect a track/thumb for.
 *
 * Cycle + dropdown split (new, per explicit person request): clicking
 * the button's LABEL TEXT advances mapTheme to the next entry in
 * THEME_IDS (wrapping back to the first after the last) — the same
 * "just cycle" behavior the old dark<->light toggle had, generalized
 * to N themes instead of hardcoding a 2-way flip. Clicking the small
 * chevron beside it instead opens a dropdown listing every theme in
 * THEME_IDS, so the person can jump straight to one without cycling
 * through the others. These are two SEPARATE <button> elements side
 * by side inside one shared pill container, not one button with two
 * click zones on the same element — a single element can't cleanly
 * give onClick two different meanings depending on exactly which
 * pixel was hit. The dropdown only ever opens from the chevron;
 * clicking the label while the dropdown happens to be open closes it
 * (via the cycle click handler's setIsMenuOpen(false)) and still
 * cycles, so cycling never leaves a stale open menu behind.
 *
 * Dropdown dismissal: closes on picking an option, on clicking the
 * chevron again (toggle), and on any click elsewhere in the document
 * (the useEffect'd 'pointerdown' listener + menuRef below) — standard
 * "click-outside-closes" menu behavior, listening on 'pointerdown'
 * rather than 'click' so it fires before a click on some other
 * element's own handler, same reasoning most dropdown/menu
 * implementations use.
 */
const SHARED_PILL_CLASSES = 'pointer-events-auto relative flex items-center rounded-full border py-1.5 text-[11px] uppercase tracking-[0.18em] backdrop-blur-sm transition-colors';

export function MapToolbar({
  sheltersVisible,
  onToggleShelters,
  mapTheme = 'dark',
  onToggleMapTheme,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const currentIndex = Math.max(THEME_IDS.indexOf(mapTheme), 0);
  const currentLabel = THEME_LABELS[mapTheme] || THEME_LABELS[THEME_IDS[0]];

  // Click-outside-closes: only listens while the menu is actually
  // open, and only for the duration it's open — added/removed inside
  // the same effect run rather than a session-long listener, so this
  // costs nothing when the dropdown is closed (the common case).
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    function onPointerDownOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDownOutside);
    return () => document.removeEventListener('pointerdown', onPointerDownOutside);
  }, [isMenuOpen]);

  function handleCycleClick() {
    setIsMenuOpen(false);
    const nextTheme = THEME_IDS[(currentIndex + 1) % THEME_IDS.length];
    onToggleMapTheme(nextTheme);
  }

  function handleThemePick(themeId) {
    setIsMenuOpen(false);
    if (themeId !== mapTheme) onToggleMapTheme(themeId);
  }

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-30 flex flex-row gap-2">
      <label
        className={`${SHARED_PILL_CLASSES} cursor-pointer pl-12 pr-3 ${
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

      <div ref={menuRef} className={`${SHARED_PILL_CLASSES} gap-0 border-hairline bg-canvas/85 pl-3 pr-1 text-ink-dim`}>
        <button
          type="button"
          onClick={handleCycleClick}
          aria-label={`Map theme: ${currentLabel}. Click to switch to the next theme.`}
          title={`Map theme: ${currentLabel} (click to cycle)`}
          className="cursor-pointer pr-2 hover:text-ink"
        >
          {currentLabel}
        </button>

        {/* Chevron — the ONLY thing that opens the dropdown; the label
            button above never does. A thin border-l separates the two
            click zones visually so it's clear they're not one button. */}
        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label={isMenuOpen ? 'Close theme menu' : 'Open theme menu'}
          aria-expanded={isMenuOpen}
          title="Choose a theme"
          className="cursor-pointer border-l border-hairline py-0.5 pl-2 pr-1 hover:text-ink"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            className={`transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {isMenuOpen ? (
          <div className="absolute left-0 top-[calc(100%+6px)] flex min-w-full flex-col overflow-hidden rounded-lg border border-hairline bg-canvas/95 py-1 normal-case tracking-normal backdrop-blur-sm">
            {THEME_IDS.map((themeId) => (
              <button
                key={themeId}
                type="button"
                onClick={() => handleThemePick(themeId)}
                className={`whitespace-nowrap px-3 py-1.5 text-left text-[11px] uppercase tracking-[0.18em] transition-colors ${
                  themeId === mapTheme
                    ? 'bg-accent/15 text-ink'
                    : 'text-ink-dim hover:bg-surface/85 hover:text-ink'
                }`}
              >
                {THEME_LABELS[themeId]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}