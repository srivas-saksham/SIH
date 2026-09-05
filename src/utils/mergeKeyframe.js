/**
 * Merges a partial timeline keyframe diff onto a base scenario state
 * (baseline or a previously-merged state), returning a brand new full
 * state object. Keyframes only list the buildings/roads/shelters that
 * changed at that point in time — this is what expands them back into a
 * complete snapshot the map/UI can render directly.
 *
 * Both `buildings` and `shelters` are matched and merged by `id`.
 * `roads` are matched and merged by `id` too. Any field present on the
 * diff entry overwrites the corresponding field on the base entry;
 * fields not mentioned in the diff (e.g. lat/lng on a building) are kept
 * from the base entry. Entries in the diff whose id isn't found in the
 * base list are appended as new entries (useful for interventions that
 * add a shelter, etc.).
 *
 * This function does not mutate its inputs.
 *
 * @param {object} baseState - full state, e.g. scenario.baseline
 * @param {object} keyframe - partial diff, e.g. scenario.timeline[i]
 * @returns {object} a new full state with the diff applied
 */
export function mergeKeyframe(baseState, keyframe) {
  if (!keyframe) {
    return cloneState(baseState);
  }

  return {
    ...baseState,
    buildings: mergeById(baseState.buildings, keyframe.buildings),
    roads: mergeById(baseState.roads, keyframe.roads),
    shelters: mergeById(baseState.shelters, keyframe.shelters),
  };
}

/**
 * Merges an array of scenario timeline keyframes in order onto a base
 * state, useful for scrubbing straight to keyframe index N without
 * replaying every step individually (each keyframe already represents a
 * diff relative to the previous rendered state, so they're folded
 * cumulatively).
 *
 * @param {object} baseState - starting full state, e.g. scenario.baseline
 * @param {object[]} keyframes - ordered array of partial diffs
 * @param {number} uptoIndex - inclusive index of the last keyframe to apply
 * @returns {object} the resulting full state
 */
export function mergeKeyframesUpTo(baseState, keyframes, uptoIndex) {
  let state = cloneState(baseState);
  const lastIndex = Math.min(uptoIndex, keyframes.length - 1);

  for (let i = 0; i <= lastIndex; i += 1) {
    state = mergeKeyframe(state, keyframes[i]);
  }

  return state;
}

function mergeById(baseList = [], diffList = []) {
  if (!diffList || diffList.length === 0) {
    return baseList.map((item) => ({ ...item }));
  }

  const merged = baseList.map((item) => ({ ...item }));
  const indexById = new Map(merged.map((item, index) => [item.id, index]));

  diffList.forEach((diffItem) => {
    const existingIndex = indexById.get(diffItem.id);
    if (existingIndex === undefined) {
      merged.push({ ...diffItem });
      indexById.set(diffItem.id, merged.length - 1);
    } else {
      merged[existingIndex] = { ...merged[existingIndex], ...diffItem };
    }
  });

  return merged;
}

function cloneState(state) {
  return {
    ...state,
    buildings: (state.buildings || []).map((item) => ({ ...item })),
    roads: (state.roads || []).map((item) => ({ ...item })),
    shelters: (state.shelters || []).map((item) => ({ ...item })),
  };
}

export default mergeKeyframe;