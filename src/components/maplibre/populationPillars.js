/**
 * Pure, framework-free helpers for the Tehri flood population-
 * entrapment pillars (see data/floodPopulationPillars.js for the data
 * and MapLibreEngine.jsx for the wiring). Nothing here touches the map
 * or React — the engine only calls these and pushes results into
 * GeoJSON sources, and CommandShell / PopulationPanel reuse the same
 * computePillarStates() so the map and the panel can never disagree.
 *
 * All figures are illustrative demo numbers (see the data file).
 */
import * as turf from '@turf/turf';
import { RISK_HEX } from '../MapView';
import {
  drawRoundedRectPath, wrapCanvasText, LABEL_PILL_ICON_SIZE_EXPR,
} from './mapEngineCore';

// =====================================================================
// PILLAR TUNING — edit these numbers to change how the pillars look.
// Extrusions are sized in METRES, but the Tehri camera goes from zoom
// ~16.5 down to ~7.8, so height + radius are multiplied by a zoom
// compensation factor (metres-per-pixel at the current zoom ÷ at
// REFERENCE_ZOOM) to keep their ON-SCREEN size roughly constant.
// (Values below are *at REFERENCE_ZOOM*; NOT verified in a live
// browser — derived from geometry, expect a round of by-eye tuning.)
//
//   REFERENCE_ZOOM          zoom at which the metre values below apply.
//                           Only shifts everything together; leave at 9
//                           (≈132 m/px at Tehri's latitude).
//   HEIGHT_PER_PERSON       metres of bar per trapped person at
//                           REFERENCE_ZOOM. HIGHER = taller bars.
//                           0.3 → tallest (66,800) ≈ 20 km ≈ 120 px tall
//                           at pitch ~55° (target 90–160 px).
//   HEIGHT_MODE             'linear' (honest bar chart, default) or
//                           'sqrt' (compresses the tallest, lifts the
//                           small hill pillars — use if one bar dwarfs
//                           the rest). SQRT_REF_PEOPLE keeps the sqrt
//                           tallest bar about the same height as linear.
//   MIN_BAR_M_AT_REF        visibility floor so a few-hundred-person
//                           hamlet is still a visible stub (~6 px).
//                           Deliberately breaks strict proportionality
//                           for tiny values only; set 0 to disable.
//   PILLAR_RADIUS_M_AT_REF  cylinder radius. 1200 m ≈ 9 px → ~18 px
//                           wide (target 12–24 px). HIGHER = fatter.
//   FOOTPRINT_RADIUS_FACTOR cut-off red footprint radius ÷ pillar
//                           radius (spec: 2–3×).
//   LABEL_GAP_M_AT_REF      air gap between pillar top and label.
//   HEIGHT_ANIM_MS          height/lerp duration on keyframe change.
//   ZOOM_REBUILD_STEP       geometry only rebuilt when zoom moved this
//                           much (or on moveend) — never per frame.
//   FRONT_LEAD_KM/RAMP_KM   a pillar starts growing when the flood
//                           front is LEAD km short of it and is full
//                           size RAMP km later (front = the flood
//                           ribbon's own live extent, not recomputed).
//   BOOST_TRAPPED_RELIEF    max fraction of trapped people relieved by
//                           the shelter-capacity what-if (scaled by
//                           boost% and the pillar's shelterDeficit).
//   LABEL_LIFT_MODE         'elevated' = MapLibre's per-feature
//                           `symbol-height-offset` (metres above ground,
//                           present in the installed maplibre-gl 6.7
//                           style spec) puts the label at the pillar's
//                           top. 'screen-offset' = fallback that lifts
//                           the icon by a computed pixel `icon-offset`
//                           instead. Flip to it if the label looks
//                           glued to the base in a live browser.
// =====================================================================
export const REFERENCE_ZOOM = 9;
export const HEIGHT_PER_PERSON = 0.3;
export const HEIGHT_MODE = 'linear';
export const SQRT_REF_PEOPLE = 70000;
export const MIN_BAR_M_AT_REF = 900;
export const PILLAR_RADIUS_M_AT_REF = 1200;
export const FOOTPRINT_RADIUS_FACTOR = 2.5;
export const LABEL_GAP_M_AT_REF = 800;
export const HEIGHT_ANIM_MS = 900;
export const ZOOM_REBUILD_STEP = 0.25;
export const FRONT_LEAD_KM = 3;
export const FRONT_RAMP_KM = 3;
export const BOOST_TRAPPED_RELIEF = 0.5;
export const LABEL_LIFT_MODE = 'elevated';
export const PILLAR_CIRCLE_STEPS = 32;

// Entrapment Severity Index weights (sum = 100) and band cut-offs.
// Illustrative model: trapped share of the exposed population (40),
// every road out blocked (25), short warning time (15), children/
// elderly share (10), nearest shelter's lack of headroom (10).
export const ESI_WEIGHTS = {
  trappedShare: 40, cutOff: 25, warning: 15, vulnerable: 10, shelter: 10,
};
export const ESI_WARNING_HORIZON_MIN = 240; // ETA ≥ this → no warning-time points
export const ESI_VULNERABLE_CAP_PCT = 30; // vulnerable% at/above this → full points
export const ESI_BANDS = { yellow: 25, orange: 50, red: 75 };

/** Web-mercator metres per CSS pixel (MapLibre uses 512 px tiles). */
export function metersPerPixel(zoom, latDeg) {
  return (78271.517 * Math.cos((latDeg * Math.PI) / 180)) / 2 ** zoom;
}

/** Height/radius multiplier that keeps on-screen size ~constant. */
export function zoomScale(zoom, latDeg) {
  return metersPerPixel(zoom, latDeg) / metersPerPixel(REFERENCE_ZOOM, latDeg);
}

/** Bar height in metres for `trapped` people at this zoom. */
export function pillarHeightM(trapped, zoom, latDeg) {
  if (!(trapped > 0)) return 0;
  const base = HEIGHT_MODE === 'sqrt'
    ? Math.sqrt(trapped * SQRT_REF_PEOPLE) * HEIGHT_PER_PERSON
    : trapped * HEIGHT_PER_PERSON;
  // Floor ramps in for very small values so 0 → tiny still animates.
  const floor = MIN_BAR_M_AT_REF * Math.min(1, trapped / 500);
  return Math.max(base, floor) * zoomScale(zoom, latDeg);
}

export function pillarRadiusM(zoom, latDeg) {
  return PILLAR_RADIUS_M_AT_REF * zoomScale(zoom, latDeg);
}

export function labelGapM(zoom, latDeg) {
  return LABEL_GAP_M_AT_REF * zoomScale(zoom, latDeg);
}

/**
 * On-screen height in px of a bar of `heightM` metres — used only by
 * the 'screen-offset' label fallback. A vertical edge projects with
 * sin(pitch) in MapLibre (pitch 0 = straight down, where extrusions
 * collapse to a point), NOT cos(pitch).
 */
export function heightToScreenPx(heightM, zoom, latDeg, pitchDeg) {
  return (heightM / metersPerPixel(zoom, latDeg)) * Math.sin((pitchDeg * Math.PI) / 180);
}

/** JS mirror of LABEL_PILL_ICON_SIZE_EXPR (same stops) — fallback only. */
export function labelIconSizeAtZoom(zoom) {
  // Stops mirror mapEngineCore.js: [LABEL_HOLD_ZOOM, LABEL_PILL_FAR_SIZE],
  // [16.5, 1.1], [18, 1.3]; read from the live expression so retuning
  // the label-size block there flows through automatically.
  const stops = [];
  for (let i = 3; i < LABEL_PILL_ICON_SIZE_EXPR.length; i += 2) {
    stops.push([LABEL_PILL_ICON_SIZE_EXPR[i], LABEL_PILL_ICON_SIZE_EXPR[i + 1]]);
  }
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i += 1) {
    if (zoom <= stops[i][0]) {
      const [z0, s0] = stops[i - 1];
      const [z1, s1] = stops[i];
      return s0 + ((s1 - s0) * (zoom - z0)) / (z1 - z0);
    }
  }
  return stops[stops.length - 1][1];
}

// ---------------------------------------------------------------------
// Placement — pillar = along-path position + small perpendicular offset
// ---------------------------------------------------------------------

/**
 * @param {import('../../data/floodPopulationPillars').FloodPillar} pillar
 * @param {object} floodLine turf LineString of the scene's floodPath
 * @returns {{lng:number, lat:number, atKm:number, distToRiverKm:number}}
 */
export function resolvePillarPlacement(pillar, floodLine) {
  const snapped = turf.nearestPointOnLine(floodLine, turf.point(pillar.anchor), { units: 'kilometers' });
  const atKm = snapped.properties.location;
  const totalKm = turf.length(floodLine, { units: 'kilometers' });
  // Local flow direction from a short look-ahead (or look-back at the end).
  const a = turf.along(floodLine, Math.max(0, Math.min(atKm, totalKm - 0.6)), { units: 'kilometers' });
  const b = turf.along(floodLine, Math.max(0, Math.min(atKm, totalKm - 0.6)) + 0.5, { units: 'kilometers' });
  const heading = turf.bearing(a, b);
  const p0 = turf.along(floodLine, atKm, { units: 'kilometers' });
  const dest = turf.destination(p0, pillar.offsetKm, heading + 90 * pillar.side, { units: 'kilometers' });
  const [lng, lat] = dest.geometry.coordinates;
  const distToRiverKm = turf.pointToLineDistance(dest, floodLine, { units: 'kilometers' });
  return { lng, lat, atKm, distToRiverKm };
}

/** Placements for a whole scene: { [pillarId]: {lng, lat, atKm, distToRiverKm} }. */
export function resolveAllPlacements(pillars, floodPath) {
  const floodLine = turf.lineString(floodPath);
  const out = {};
  pillars.forEach((p) => { out[p.id] = resolvePillarPlacement(p, floodLine); });
  return out;
}

/** 0 → hidden, 1 → full, based on the flood ribbon's live extent. */
export function frontVisibility(extentKm, atKm) {
  const v = (extentKm - atKm + FRONT_LEAD_KM) / FRONT_RAMP_KM;
  return Math.max(0, Math.min(1, v));
}

// ---------------------------------------------------------------------
// ESI + states
// ---------------------------------------------------------------------

export function computeEsi(pillar, trapped, cutOff) {
  const share = pillar.populationTotal > 0 ? Math.min(1, trapped / pillar.populationTotal) : 0;
  const warn = 1 - Math.max(0, Math.min(1, pillar.arrivalMinutes / ESI_WARNING_HORIZON_MIN));
  const vuln = Math.max(0, Math.min(1, pillar.vulnerablePct / ESI_VULNERABLE_CAP_PCT));
  const w = ESI_WEIGHTS;
  const score = w.trappedShare * share
    + (cutOff ? w.cutOff : 0)
    + w.warning * warn
    + w.vulnerable * vuln
    + w.shelter * Math.max(0, Math.min(1, pillar.shelterDeficit));
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function esiBand(score) {
  if (score >= ESI_BANDS.red) return 'red';
  if (score >= ESI_BANDS.orange) return 'orange';
  if (score >= ESI_BANDS.yellow) return 'yellow';
  return 'green';
}

export function bandHex(band) {
  return RISK_HEX[band] || RISK_HEX.green;
}

/**
 * Per-pillar live state for one timeline keyframe. `boostPercent` is
 * the shelter-capacity what-if (null = off): it relieves a share of the
 * trapped people, more where the nearest shelter had little headroom.
 */
export function computePillarStates(pillars, keyframeIndex, boostPercent = null) {
  const k = Math.max(0, Math.min(keyframeIndex ?? 0, 4));
  const relief = boostPercent != null
    ? Math.max(0, Math.min(1, boostPercent / 100)) * BOOST_TRAPPED_RELIEF
    : 0;
  return pillars.map((p) => {
    const raw = p.trappedByKeyframe[k] ?? 0;
    const trapped = Math.round(raw * (1 - relief * p.shelterDeficit));
    const cutOff = Boolean(p.cutOffByKeyframe[k]) && trapped > 0;
    const esi = computeEsi(p, trapped, cutOff);
    const band = esiBand(esi);
    return {
      ...p,
      trapped,
      cutOff,
      pctTrapped: p.populationTotal > 0 ? Math.round((trapped / p.populationTotal) * 100) : 0,
      depthM: p.floodDepthM[k] ?? 0,
      esi,
      band,
      hex: bandHex(band),
    };
  });
}

/** Panel / chat summary of one keyframe's states. */
export function summarizeStates(states) {
  const active = states.filter((s) => s.trapped > 0);
  const totalTrapped = active.reduce((sum, s) => sum + s.trapped, 0);
  const worst = [...active].sort((a, b) => b.esi - a.esi || b.trapped - a.trapped);
  return {
    totalTrapped,
    cutOffCount: active.filter((s) => s.cutOff).length,
    areaCount: active.length,
    tallestTrapped: active.reduce((m, s) => Math.max(m, s.trapped), 0),
    worst,
  };
}

/** Total trapped at every keyframe (for the sparkline). */
export function totalsByKeyframe(pillars, boostPercent = null) {
  return [0, 1, 2, 3, 4].map((k) => summarizeStates(computePillarStates(pillars, k, boostPercent)).totalTrapped);
}

// ---------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------

export function pillarLabelImageId(id) {
  return `pillar-label-${id}`;
}

export function pillarLabelLine2(state) {
  return `${state.trapped.toLocaleString('en-US')} trapped \u00b7 ${state.pctTrapped}%${state.cutOff ? ' \u00b7 CUT OFF' : ''}`;
}

const LABEL_CSS_W = 208;
const LABEL_CSS_H = 44;
const LABEL_PIXEL_RATIO = 3;

/**
 * Two-line label: severity accent bar + area name + "48,200 trapped ·
 * 62%" (+ " · CUT OFF"). Same visual language as renderLabelPillCanvas.
 */
export function renderPillarLabelCanvas(name, line2, accentHex, cutOff) {
  const w = LABEL_CSS_W;
  const h = LABEL_CSS_H;
  const ratio = LABEL_PIXEL_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, w, h);

  ctx.beginPath();
  drawRoundedRectPath(ctx, 0, 0, w, h, 9);
  ctx.fillStyle = 'rgba(10, 10, 11, 0.9)';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = cutOff ? '#ef4444' : accentHex;
  ctx.stroke();

  // Severity accent bar down the left edge.
  ctx.beginPath();
  drawRoundedRectPath(ctx, 6, 7, 5, h - 14, 2.5);
  ctx.fillStyle = accentHex;
  ctx.fill();

  const textX = 19;
  const maxTextWidth = w - textX - 8;
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#e4e4e7';
  const [nameLine] = wrapCanvasText(ctx, name, maxTextWidth, 1);
  ctx.fillText(nameLine, textX, 19);

  ctx.font = '600 10.5px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = cutOff ? '#fca5a5' : '#a1a1aa';
  const [line] = wrapCanvasText(ctx, line2, maxTextWidth, 1);
  ctx.fillText(line, textX, 34);
  return canvas;
}