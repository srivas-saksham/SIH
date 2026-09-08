/**
 * Task 3 — "what if shelter size/capacity increased by X%" live
 * transform. Deliberately separate from the existing intervention
 * system (see timelineIntent.js's parseCapacityBoostIntent doc comment
 * for why): that path replays ONE hand-authored `intervention` state;
 * this one mathematically rescales WHATEVER merged state is currently
 * on screen, for an arbitrary caller-supplied percent.
 *
 * Explicit requirement (confirmed): impact radii must NOT change at
 * all. This function only ever touches the `shelters` array — every
 * other field on the input state (buildings, roads, roadCongestion,
 * impactPoint, redRadiusKm/yellowRadiusKm/greenRadiusKm, etc.) is
 * carried through completely untouched via the top-level spread, so
 * there is no way for this to accidentally leak into the radii/building
 * risk engine.
 *
 * Per-shelter math:
 *   - capacity: scaled up by the given percent (rounded to a whole
 *     number — a shelter can't hold a fractional person).
 *   - occupancy: left exactly as-is. The boost is additional physical
 *     capacity, not a change in how many people are currently sheltering
 *     — the same headcount now occupies a proportionally SMALLER slice
 *     of the new, larger capacity, which is exactly what "reduce their
 *     capacity progress bar by that proportional amount" means: the
 *     bar's percentage (occupancy / capacity) drops on its own once
 *     capacity grows, with no separate occupancy-scaling step needed.
 */

/**
 * @param {object} mapState - a merged keyframe state (or baseline),
 *   shaped like scenario.baseline — must have a `shelters` array of
 *   `{ id, capacity, occupancy, ... }` entries (the small s1..s4 JSON
 *   model, NOT METRO_SHELTERS — see buildAnalystContent.js's
 *   buildCapacityBoostResponseContent for how the two get correlated
 *   for display).
 * @param {number} percent - positive percentage to scale capacity up by
 *   (e.g. 30 for "30% more"). Not clamped here — parseCapacityBoostIntent
 *   already clamps to a sane 1-500 range before this ever gets called.
 * @returns {object} a new state object, safe to hand straight to
 *   MapLibreView / buildCapacityBoostResponseContent / causal-factor
 *   computation as if it were any other merged state.
 */
export function applyShelterCapacityBoost(mapState, percent) {
  if (!mapState) return mapState;
  const multiplier = 1 + percent / 100;
  const shelters = Array.isArray(mapState.shelters) ? mapState.shelters : [];

  return {
    ...mapState,
    shelters: shelters.map((shelter) => ({
      ...shelter,
      capacity: Math.max(0, Math.round((shelter.capacity || 0) * multiplier)),
      // occupancy intentionally unchanged — see doc comment above.
    })),
  };
}

export default applyShelterCapacityBoost;