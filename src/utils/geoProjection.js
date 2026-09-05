/**
 * Lightweight lat/lng -> 2D viewport projection for the stylized command
 * center map. This is NOT a real geospatial projection (no Mercator, no
 * datum handling) — it's a simple linear fit of a scenario's coordinate
 * bounding box onto an SVG viewBox, which is all a scripted demo needs.
 */

const DEFAULT_PADDING = 40;

/**
 * Computes the lat/lng bounding box across every building/road/shelter in
 * a scenario state object.
 */
export function computeBounds(state) {
  const points = [];

  (state.buildings || []).forEach((b) => points.push([b.lat, b.lng]));
  (state.shelters || []).forEach((s) => points.push([s.lat, s.lng]));
  (state.roads || []).forEach((r) => (r.coords || []).forEach((c) => points.push(c)));

  if (points.length === 0) {
    // Fallback bounds so projection never divides by zero.
    return { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
  }

  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);

  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

/**
 * Builds a projector function that converts [lat, lng] into [x, y] pixel
 * coordinates within the given viewBox width/height, preserving relative
 * spacing and leaving a padding margin. North (higher lat) renders toward
 * the top of the viewBox, matching normal map orientation.
 */
export function createProjector(bounds, { width, height, padding = DEFAULT_PADDING } = {}) {
  const latSpan = bounds.maxLat - bounds.minLat || 1;
  const lngSpan = bounds.maxLng - bounds.minLng || 1;

  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return function project(lat, lng) {
    const xRatio = (lng - bounds.minLng) / lngSpan;
    const yRatio = (lat - bounds.minLat) / latSpan;

    const x = padding + xRatio * usableWidth;
    // Invert y so higher latitude (north) is toward the top.
    const y = padding + (1 - yRatio) * usableHeight;

    return [x, y];
  };
}