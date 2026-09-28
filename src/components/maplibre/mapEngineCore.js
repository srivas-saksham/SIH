/**
 * mapEngineCore — scene-agnostic constants + pure helper functions for
 * MapLibreEngine.jsx.
 *
 * Extracted from the original monolithic MapLibreView.jsx (3,722 lines,
 * everything in one file) as part of the modularization pass that added
 * a second scene (Tehri Dam breach) alongside the original security-
 * attack scene. Nothing in this file is new logic or a rewrite — every
 * constant/function below is byte-for-byte (or, for the three
 * explicitly called out near the bottom, parameter-for-parameter)
 * identical to what already existed in MapLibreView.jsx. See
 * PROJECT_CONTEXT.md's agent notes for the full modularization
 * rationale and file-tree decision.
 *
 * What stayed OUT of this file (and why): anything that was specific to
 * the security-attack scene's Central Delhi geography — the
 * FALLBACK_CENTER coordinate, IMPACT_ZONE_RADIUS_KM (and the
 * DEFAULT_RED/YELLOW/GREEN_RADIUS_KM derived from it), and
 * KARTAVYA_PATH_NAME_PATTERN — moved to scenes/securityAttackScene.js
 * instead, since a second scene (scenes/tehriDamBreachScene.js) needs
 * its own different values for all four. The handful of functions that
 * used to close over those scenario-specific module constants
 * (resolveShelterAccessible, resolveActiveRadii, deriveLandmarkRisk)
 * now take the equivalent value as an explicit parameter instead — see
 * the "Scene-config-driven versions" section near the end of this file
 * for those three; everything else below is unchanged.
 */
import * as turf from '@turf/turf';
import { RISK_HEX } from '../MapView';

// Task 8d FIX 1: OpenFreeMap's dark style, forked from
// openmaptiles/dark-matter-gl-style — free, no key, same zero-config
// setup as bright. Confirmed live at this exact URL (it's listed on
// OpenFreeMap's own Quick Start guide alongside bright/liberty/positron).
//
// Theme cycle (expanded from the original dark/light toggle — see
// THEME_IDS/THEME_LABELS below). Verified directly against
// openfreemap.org/quick_start (Sep 2026): OpenFreeMap's own default
// style set is Positron, Bright, Liberty, Dark, Fiord, 3D — vector
// styles only, no satellite imagery of any kind. So:
//   - 'dark'  -> OpenFreeMap's dark style (unchanged from before).
//   - 'light' -> switched from Positron to OpenFreeMap's LIBERTY style.
//     Positron is deliberately near-monochrome/grayscale by design
//     (openfreemap-styles' own README: "Positron, as a special clean
//     looking style, has POIs removed..."), which read as "plain
//     white" — not what was asked for. Liberty (a fork of OSM
//     Bright/osm-liberty, actively maintained per that same README)
//     renders real color: blue water, green parks/vegetation, tinted
//     land use — the colored/terrain-ish look requested — while still
//     being one of OpenFreeMap's own zero-config, no-key default
//     styles, so it's exactly as reliable as dark was.
//   - 'satellite' -> NOT an OpenFreeMap style (they don't have one).
//     This is a real raster imagery source instead: Esri's public
//     World Imagery tile service, served from
//     server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/
//     MapServer — the standard free/no-API-key satellite basemap used
//     across many independent MapLibre projects (Esri's own docs,
//     mapatlas.xyz, gpx.studio's "Liberty Satellite" style, etc.).
//     Because this isn't a style URL MapLibre can just load like the
//     vector ones, it's built as an inline style object below
//     (SATELLITE_STYLE) with its own raster source + layer, applied
//     the same way as any other style URL/object. Esri doesn't
//     publish a rate-limit/SLA guarantee for this specific free
//     endpoint (per Esri's own community forum), so it's included as
//     a genuinely free but not contractually-guaranteed option — the
//     same caveat that would apply to any no-key third-party tile
//     service.
// STYLE_URLS keys by the same theme id MapToolbar's cycle/dropdown
// use, so MapLibreEngine can just index into this with whatever theme
// prop it's handed. STYLE_URL is kept as an alias to STYLE_URLS.dark
// so nothing that imported the old single constant needs to change.
const SATELLITE_ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS community';
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    'esri-world-imagery': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: SATELLITE_ATTRIBUTION,
    },
  },
  layers: [
    {
      id: 'esri-world-imagery',
      type: 'raster',
      source: 'esri-world-imagery',
    },
  ],
};

const STYLE_URLS = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/liberty',
  satellite: SATELLITE_STYLE,
};
const STYLE_URL = STYLE_URLS.dark;

// Theme cycle order + display labels, single source of truth for both
// MapToolbar's cycle-on-click behavior and its dropdown list — so
// adding/reordering a theme only ever needs to change this one place.
const THEME_IDS = ['dark', 'light', 'satellite'];
const THEME_LABELS = {
  dark: 'Dark',
  light: 'Light',
  satellite: 'Satellite',
};

// Mirrors MapView's TRANSITION_MS convention (Task 5) so landmark risk
// color changes crossfade at the same speed as every other risk-driven
// visual in this app, instead of introducing a new timing constant.
const TRANSITION_MS = 400;
const RISK_RANK = { red: 4, orange: 3, yellow: 2, green: 1 };
const IMPACT_ZONE_GROW_MS = 1800;
const ROUTE_ANIMATE_MS = 2200;
// ---------------------------------------------------------------------
// Per-building spatial risk engine (new — see MAPLIBRE_RESEARCH_FINDINGS.md).
//
// This replaces the old "5 fixed landmarks only" model with a real
// distance-based evaluation of every building near the impact point.
// Three concentric bands (red/yellow/green — no orange in this path,
// per the task's acceptance checklist) are evaluated by geographic
// distance from the current impactPoint, using radii that grow/shrink
// as the timeline advances. Buildings outside all three bands are left
// at the style's default gray.
// ---------------------------------------------------------------------

// Only three colors exist in the building-risk path (research §3, §9):
// a `match` expression on ['feature-state','riskLevel'] with an
// explicit gray fallback branch for 'none' / null / never-set. We
// explicitly set 'none' (rather than calling removeFeatureState) when a
// building leaves every band, per research §2/§9 — this keeps the
// animation hot path down to a single API (setFeatureState) and
// sidesteps the unresolved question of whether a truly-never-set
// feature-state value falls through `match` identically to an
// explicitly-removed one.
const BUILDING_RISK_HEX = {
  red: RISK_HEX.red,
  yellow: RISK_HEX.yellow,
  green: RISK_HEX.green,
};
const BUILDING_DEFAULT_GRAY = '#5a5a62';

// ---------------------------------------------------------------------
// Road congestion overlay — REVISED per explicit correction: the first
// pass of this feature styled the fake `roads` array from
// security-attack.json (hand-invented straight-line coordinates, used
// only by the legacy SVG MapView.jsx for a rough illustrative sketch).
// That is NOT acceptable for the MapLibre scene: every road drawn here
// must be a real OSM road geometry read from the same vector tile
// source already used for buildings. `state.roads` (the fake array) is
// no longer read by this component at all — it's left completely alone
// for MapView.jsx's own SVG rendering, which is a separate, unrelated
// consumer of that field.
//
// This mirrors the buildings pipeline's actual proven shape (see the
// big BUILDINGS_SOURCE_ID/EXPLODED_BUILDINGS_SOURCE_ID comment block
// above): read geometry from the real vector tile source, key
// setFeatureState off the tile's native numeric id (NOT a promoteId
// property — `osm_id` was already proven not to exist as an emitted
// building property, and there is no reason to assume `transportation`
// exposes one either, so this must be empirically checked the same way,
// not assumed).
//
// IMPORTANT — this codebase has no live browser/devtools access from
// this authoring environment, so steps that require inspecting a
// running map (confirming the source-layer name, confirming ids are
// stable, confirming a specific named real road recolors on click) have
// NOT been empirically verified here and must not be reported as done.
// See the `window.__debugRoads` helpers wired up below (search for
// "DEVTOOLS VERIFICATION HELPERS") — run those in your own browser
// console against the live map and report back what they print before
// treating this as finished.
const ROADS_SOURCE_LAYER = 'transportation'; // per MapLibre/OpenMapTiles convention — VERIFY against map.getStyle().sources.openmaptiles / the actual tile schema before trusting this, same as the instruction requires.
const ROAD_CONGESTION_HEX = {
  jammed: '#ef4444', // reuses BUILDING_RISK_HEX.red's hue family for visual consistency
  slow: '#f97316',
};

// ---------------------------------------------------------------------
// Task 9: shelter / metro-station safe-zone overlay. Deliberately a
// distinct teal/cyan, NOT RISK_HEX.green or the literal string 'green' —
// reusing either would be a real feature-state collision risk with
// building-risk bands on any layer that also handles those (see
// PROJECT_CONTEXT.md §9's resolved design decisions). Reuses the same
// hex already used by the existing `evac-point-circle` layer so the
// "this is safe" visual language stays consistent across the app rather
// than introducing a third color for the same concept.
// ---------------------------------------------------------------------
const SAFE_ZONE_HEX = '#5eead4';

// Extrusion height (map units) for every safe-zone polygon's fill.
// Reported bug fix: at the old fixed height (10), a shelter's teal
// block got visually swallowed once the growing impact-zone-red (18)
// and building-risk red (`max(40, render_height)` — see the
// 3d-buildings-risk layer's 'fill-extrusion-height' expression) blocks
// grew past it. 55 sits above BOTH of those ceilings so a shelter stays
// visible through the whole T+0→T+30 scrub. NOTE: an individual real
// building taller than 55 inside the red band can still poke up further
// than this in principle — accepted edge case for this demo scene, not
// something this single constant tries to solve for every possible
// building height.
const SAFE_ZONE_FILL_HEIGHT = 55;

// Multiplier applied to a shelter's own footprint size (its LARGER
// semi-axis, see buildShelterFootprint) to derive
// resolveShelterExclusionRadiusKm's per-shelter building-risk exclusion
// radius. Replaces the old single fixed EXCLUSION_RADIUS_KM now that
// shelters have real, differently-sized footprints (a ~1.3km tunnel
// area and a small metro concourse shouldn't share one exclusion
// radius). >1 so the exclusion always comfortably clears the drawn
// polygon's own edge (plus its jitter), not just be tangent to it — not
// derived from any engineering standard, picked to look right at this
// scene's zoom level, same honesty standard as the old constant's
// comment.
const EXCLUSION_MARGIN_FACTOR = 1.6;

// Discrete occupancy states a shelter's label cycles through as the
// timeline advances (see resolveShelterOccupancyLevel below) —
// deliberately a small fixed enum, not a numeric percentage, since
// there's no real population/capacity model backing a number here.
const SHELTER_OCCUPANCY_LEVELS = ['Standing by', 'Filling up', 'Near capacity', 'At capacity'];

// Outline color the active scene's one "inaccessible shelter" (see
// each scenes/*.js's own pick + reasoning) flips to once
// resolveShelterAccessible resolves it inaccessible (replaces
// SAFE_ZONE_HEX for that shelter only). Reuses
// ROAD_CONGESTION_HEX.slow's amber hue rather than the 'jammed' red —
// the shelter itself isn't on fire/destroyed, it's just unreachable, a
// materially different situation from a building actually inside the
// blast radius.
const SHELTER_INACCESSIBLE_HEX = ROAD_CONGESTION_HEX.slow;

// ---------------------------------------------------------------------
// Floating shelter status card (canvas-rendered map icon, not a plain
// GL text layer or a DOM marker — see renderShelterCardCanvas below and
// the SHELTER_CARD_* constants further down for why). One color per
// SHELTER_OCCUPANCY_LEVELS index, same array length/order so
// resolveShelterStatusHex can index directly rather than another
// lookup table. Deliberately a DIFFERENT palette from
// SHELTER_INACCESSIBLE_HEX's amber — 'blocked' is a distinct situation
// (can't be reached at all) from 'at capacity but still reachable', and
// re-using the same amber for both would read as the same problem when
// they aren't.
// ---------------------------------------------------------------------
const SHELTER_STATUS_HEX = [
  '#5eead4', // Standing by   — same teal as the base safe-zone color, nothing alarming yet
  '#a3e635', // Filling up    — lime, still comfortably fine
  '#f59e0b', // Near capacity — amber, worth noting
  '#ef4444', // At capacity   — red, the shelter itself is the constraint now
];

// ---------------------------------------------------------------------
// Shelter card v2 — rendered as a real MapLibre symbol-layer icon
// (canvas -> map.addImage -> icon-image), NOT a maplibregl.Marker DOM
// element. This is a deliberate rewrite after the person explicitly
// rejected the DOM-marker version: a Marker is a screen-space overlay
// (fixed CSS pixel size regardless of zoom, positioned via a hardcoded
// pixel offset that only lines up at one specific camera angle) — see
// the continuation prompt's root-cause writeup for the full reasoning.
// A symbol layer's icon is real map content: it's anchored to a real
// [lng, lat] in world space, reprojects correctly on every pitch/
// rotate/pan with zero manual offset math, and — critically — its
// on-screen size is driven by 'icon-size', which we key off ['zoom']
// below (see the `shelter-cards-symbol` layer), so it shrinks/grows
// with the camera the way a real object in the scene would instead of
// staying a fixed CSS size.
//
// icon-pitch-alignment / icon-rotation-alignment are both set to
// 'viewport' on that layer (verified against MapLibre's style-spec
// docs, not guessed): 'map' alignment would lie the icon flat into the
// ground plane and rotate/tilt it WITH the camera (right for something
// like a road shield, wrong here — the person wants a readable card
// that faces them). 'viewport' keeps the card always facing the
// camera/screen while its ANCHOR POINT stays locked to the shelter's
// real world coordinate and zoom-scales with it — i.e. exactly "lives
// in the 3D scene, positioned on the polygon, but still readable as a
// card" rather than a flat ground decal.
// ---------------------------------------------------------------------

// Card canvas authored at this fixed CSS-equivalent size...
const SHELTER_CARD_CSS_WIDTH = 176;
const SHELTER_CARD_CSS_HEIGHT = 176;
// ...rendered at this many device pixels per CSS pixel for crisp text
// (canvas is created at CSS_WIDTH*RATIO x CSS_HEIGHT*RATIO, then
// map.addImage is told `pixelRatio: SHELTER_CARD_PIXEL_RATIO` so
// MapLibre displays it at the intended CSS size when icon-size is 1 —
// this is what keeps the text from looking blurry/pixelated once
// zoomed in, same reason any hi-DPI canvas asset uses a supersampled
// backing store).
const SHELTER_CARD_PIXEL_RATIO = 3;

// icon-size expression: interpolated by zoom so the card visually
// shrinks when zooming out and grows when zooming in (the person's
// explicit complaint #3 — the old Marker version was a fixed CSS size
// at every zoom). Anchored so the card reads at its "natural" 1x size
// at this scene's fixed activation zoom (16.5 — see
// applyScenarioActivation's flyTo), smaller below that and larger
// above it. These three stops are tuned by eye for THIS scene's actual
// zoom range (roughly 14–18 per the existing flyTo/maxPitch config),
// not derived from any formula — same honesty standard as this file's
// other "tuned to look right at this scene" constants.
// =====================================================================
// LABEL SIZE TUNING — edit these numbers to change label sizes.
// (icon-size multiplies the label image: 1 = its natural size.)
// Labels used to keep shrinking (down to 0.5 / 0.45) as you zoomed out,
// so they were unreadable in wide shots. Now they hold a FIXED size at
// and below LABEL_HOLD_ZOOM (the "limit" — zooming out further never
// makes them smaller OR bigger), then grow again as you zoom in past
// the close-up stops.
//   LABEL_HOLD_ZOOM      zoom at/below which size stops changing
//                        (higher = size stops shrinking sooner)
//   SHELTER_CARD_FAR_SIZE  shelter card (+ capacity badge) size when far
//   LABEL_PILL_FAR_SIZE    area / landmark / road label size when far
// =====================================================================
const LABEL_HOLD_ZOOM = 14;
const SHELTER_CARD_FAR_SIZE = 0.8;
const LABEL_PILL_FAR_SIZE = 0.8;

const SHELTER_CARD_ICON_SIZE_EXPR = [
  'interpolate', ['linear'], ['zoom'],
  LABEL_HOLD_ZOOM, SHELTER_CARD_FAR_SIZE,
  16.5, 1,
  18, 1.4,
];

// Small vertical lift, in rendered-icon pixels (i.e. AFTER icon-size
// scaling is applied — confirmed against the style-spec's icon-offset
// definition before using it, since getting the units wrong here would
// exactly reproduce the "looks right at one zoom, wrong at another"
// bug this whole rewrite exists to fix), so the card's bottom edge
// clears the extruded polygon's apex rather than sitting exactly on
// the anchor point. Deliberately small: most of the "floats above the
// shelter" effect already comes from `icon-anchor: 'bottom'` placing
// the card's bottom edge (not center) at the shelter's ground-plane
// point, plus the card's own drawn tail pointing down at that point —
// this offset just nudges it clear of the tail itself. Still an
// approximation (see SAFE_ZONE_FILL_HEIGHT's own comment on the exact
// same limitation): MapLibre GL JS symbol layers anchor at a ground-
// plane lng/lat, not a true 3D XYZ point, so there's no clean way to
// say "hover exactly at world-height 55" without a custom WebGL layer
// — flagged explicitly rather than silently faked.
const SHELTER_CARD_ICON_OFFSET = [0, -4];

// ---------------------------------------------------------------------
// Task 3 follow-up: a SECOND, separate floating label — the capacity-
// boost badge — stacked directly above each shelter's own status card,
// per explicit request ("it should be two floating labels... right
// above the label itself"). This is deliberately its own small
// canvas -> map.addImage -> symbol-layer icon (same proven pattern as
// the shelter card and the landmark/road pills), NOT a second row baked
// into renderShelterCardCanvas — a genuinely separate floating element
// stacked above the card, matching what was asked for literally.
//
// Sizing/placement is tuned by eye, same honesty standard as every
// other "looks right at this scene's zoom range" constant in this file
// (see SHELTER_CARD_ICON_SIZE_EXPR's own comment): shelter cards are a
// variable height (renderShelterCardCanvas derives it from wrapped
// content, up to roughly ~165 CSS px at this card's current max
// content — 2-line name + boost row + badge/distance row + bar +
// status line + 5-line note), so CAPACITY_BADGE_ICON_OFFSET is set
// clear of that realistic maximum plus a small gap, rather than
// computed exactly per-shelter from each card's real measured height.
// A shelter with an unusually short note will show a slightly larger
// gap between its card and badge — an accepted cosmetic imprecision,
// not a positioning bug, consistent with this file's other
// "approximation, not a true 3D anchor" notes (see
// SHELTER_CARD_ICON_OFFSET's own comment for the same tradeoff).
// Reuses SHELTER_CARD_ICON_SIZE_EXPR (the card's own zoom curve, not a
// new one) so the badge scales in lockstep with the card it sits above
// instead of drifting apart at different zoom levels.
const CAPACITY_BADGE_CSS_WIDTH = 168;
const CAPACITY_BADGE_CSS_HEIGHT = 30;
const CAPACITY_BADGE_PIXEL_RATIO = 3;
const CAPACITY_BADGE_ICON_OFFSET = [0, -186];
// Emerald — same "things got better" tone already used for this exact
// message inside the card (see renderShelterCardCanvas's own boost-row
// fillStyle), kept consistent between the two now-separate elements.
const CAPACITY_BADGE_HEX = '#34d399';
/**
 * Draws the standalone "▲ +X% Capacity" pill shown above a shelter's
 * card while a Task 3 capacity-boost what-if is active. Same rounded-
 * pill construction as renderLabelPillCanvas (dark translucent fill,
 * colored border, centered text) but simpler — a single line, no
 * status dot, no distance line — since this is purely an annotation on
 * top of the card below it, not a standalone label needing its own
 * identity marker.
 */
function renderCapacityBadgeCanvas(percent) {
  const w = CAPACITY_BADGE_CSS_WIDTH;
  const h = CAPACITY_BADGE_CSS_HEIGHT;
  const ratio = CAPACITY_BADGE_PIXEL_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, w, h);

  const radius = h / 2;
  ctx.beginPath();
  drawRoundedRectPath(ctx, 0, 0, w, h, radius);
  ctx.fillStyle = 'rgba(6, 30, 24, 0.9)';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = CAPACITY_BADGE_HEX;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = CAPACITY_BADGE_HEX;
  ctx.fillText(`\u25b2 Capacity +${percent}%`, w / 2, h / 2 + 1);
  ctx.textAlign = 'left'; // reset — every other canvas function in this file assumes the default alignment

  return canvas;
}

// ---------------------------------------------------------------------
// Landmark / road labels — the SAME proven canvas -> map.addImage ->
// symbol-layer `icon-image` pattern the shelter cards use (see the
// SHELTER_CARD_* block above for the full reasoning on why a symbol
// layer, not a Marker/DOM element, and why 'viewport' pitch/rotation
// alignment). Deliberately a much smaller, simpler pill than the
// shelter card: a landmark/road doesn't have a shelter's richness of
// state (occupancy, accessibility, feasibility notes) — just a name and
// a live distance-from-impact — so the canvas render function below is
// a stripped-down sibling of renderShelterCardCanvas, not a reuse of it.
// ---------------------------------------------------------------------
const LABEL_PILL_CSS_WIDTH = 168;
const LABEL_PILL_CSS_HEIGHT = 40;
const LABEL_PILL_PIXEL_RATIO = 3;

// Smaller/more conservative zoom curve than the shelter cards' — these
// pills carry far less information (one line of text) and are meant to
// read as lightweight tags dotted around the scene, not primary focal
// cards, so they shouldn't dominate the view at high zoom the way a
// full shelter card is allowed to.
const LABEL_PILL_ICON_SIZE_EXPR = [
  'interpolate', ['linear'], ['zoom'],
  LABEL_HOLD_ZOOM, LABEL_PILL_FAR_SIZE,
  16.5, 1.1,
  18, 1.3,
];
const LABEL_PILL_ICON_OFFSET = [0, -2];

/**
 * Draws one landmark or road label pill: a compact rounded-rect tag
 * with a small colored status dot, the place/road name (single line,
 * ellipsized rather than wrapped — these are meant to be short), and
 * its live distance from the current impact point. `accentHex` colors
 * the dot (and the pill's thin border) so a landmark's risk color or a
 * road's congestion color still reads at a glance even in this
 * stripped-down format, without needing a full second badge/bar the
 * way the shelter card has.
 */
function renderLabelPillCanvas(name, distanceKm, accentHex) {
  const w = LABEL_PILL_CSS_WIDTH;
  const h = LABEL_PILL_CSS_HEIGHT;
  const ratio = LABEL_PILL_PIXEL_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, w, h);

  const radius = h / 2;
  ctx.beginPath();
  drawRoundedRectPath(ctx, 0, 0, w, h, radius);
  ctx.fillStyle = 'rgba(10, 10, 11, 0.88)';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = accentHex;
  ctx.stroke();

  // Status dot
  const dotCx = 16;
  const dotCy = h / 2;
  ctx.beginPath();
  ctx.arc(dotCx, dotCy, 4, 0, Math.PI * 2);
  ctx.fillStyle = accentHex;
  ctx.fill();

  const textX = dotCx + 12;
  const maxTextWidth = w - textX - 10;

  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#e4e4e7';
  const [nameLine] = wrapCanvasText(ctx, name, maxTextWidth, 1);
  ctx.fillText(nameLine, textX, h / 2 - 3);

  ctx.font = '400 9px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(`${distanceKm.toFixed(2)} km from impact`, textX, h / 2 + 11);

  return canvas;
}

/**
 * Deterministic seeded PRNG (mulberry32, keyed off a string seed via a
 * cheap string hash), used only to jitter buildShelterFootprint's ring
 * vertices. Deterministic — not Math.random — so a given shelter's
 * polygon looks IDENTICAL on every reload/re-render instead of
 * reshaping itself each time map.on('load') reruns, which would read as
 * a bug ("why did the shelter change shape") rather than the intended
 * one-time "hand-drawn" irregularity.
 */
function seededRandom(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
/**
 * Builds one METRO_SHELTERS entry's safe-zone polygon as a real
 * (non-circular) shape: a turf.ellipse sized/oriented per the entry's
 * own `footprint` metadata (see delhiMetroShelters.js), then perturbed
 * with small deterministic per-vertex jitter so it reads as "an actual,
 * slightly irregular structure" rather than a perfect geometric
 * primitive. Replaces the old plain turf.circle(...) per person's
 * explicit "not just a simple radius, actually a good polygon" request.
 * NOT survey-accurate geometry — nothing in this codebase has traced a
 * real footprint for these shelters (contrast with delhiLandmarks.js's
 * LANDMARKS, which back a queryRenderedFeatures lookup against real
 * building polygons); this is a deliberately-labeled illustrative shape,
 * same honesty standard as every other shelter-geometry comment in this
 * file and in delhiMetroShelters.js.
 */
function buildShelterFootprint(shelter) {
  const { xSemiAxisKm, ySemiAxisKm, bearingDeg, jitterFraction = 0.12 } = shelter.footprint;
  const base = turf.ellipse([shelter.lng, shelter.lat], xSemiAxisKm, ySemiAxisKm, {
    steps: 48,
    units: 'kilometers',
    angle: bearingDeg,
  });
  const ring = base.geometry.coordinates[0];
  const rand = seededRandom(shelter.id);
  const jittered = ring.map((coord, i) => {
    // Keep the closing vertex identical to the first so the ring stays
    // closed — GeoJSON polygons require first === last coordinate, and
    // jittering them independently would leave a visible gap/seam.
    if (i === ring.length - 1) return coord;
    const jitterKm = Math.max(xSemiAxisKm, ySemiAxisKm) * jitterFraction * rand();
    const jitterBearing = rand() * 360;
    return turf.destination(coord, jitterKm, jitterBearing, { units: 'kilometers' }).geometry.coordinates;
  });
  jittered[jittered.length - 1] = jittered[0];
  return turf.polygon([jittered], { shelterId: shelter.id });
}

/**
 * Per-shelter building-risk exclusion radius, replacing the old single
 * fixed EXCLUSION_RADIUS_KM constant now that shelters have real,
 * differently-sized footprints. Derived from the shelter's own larger
 * semi-axis so a bigger footprint (e.g. pragati-maidan-tunnel) gets a
 * proportionally bigger exclusion zone than a small metro concourse.
 */
function resolveShelterExclusionRadiusKm(shelter) {
  const { xSemiAxisKm, ySemiAxisKm } = shelter.footprint;
  return Math.max(xSemiAxisKm, ySemiAxisKm) * EXCLUSION_MARGIN_FACTOR;
}
/**
 * "Shelters fill up as time/keyframes advance, closer ones fill faster"
 * — explicit person request. Pure function of the current
 * `timelineIndex` (0-based position in scenario.timeline, already used
 * elsewhere in this file as a time proxy since keyframes are labeled
 * T+0/T+5/T+10/...) and the shelter's real distance from the current
 * impact point: closer shelters are assumed to get discovered/used
 * first, so their occupancy ramp advances a level per timeline step
 * sooner than a farther shelter's does. No claim to a real
 * evacuation/crowd-flow model — a monotonic, demo-plausible ramp over
 * the small SHELTER_OCCUPANCY_LEVELS enum, kept deliberately simple per
 * the brief's "keep this simple" scope note rather than a numeric
 * capacity/headcount model with nothing real backing its precision.
 */
function resolveShelterOccupancyLevel(timelineIndex, distanceKm) {
  if (typeof timelineIndex !== 'number' || timelineIndex < 0) return SHELTER_OCCUPANCY_LEVELS[0];
  // distanceKm / 1.5: a shelter ~1.5km farther away needs roughly one
  // extra elapsed timeline step to reach the same occupancy level as a
  // shelter right next to the impact point. Picked to be demo-legible
  // across this scenario's actual shelter distances (0.3–3.0km, see
  // delhiMetroShelters.js's header) rather than tuned against any real
  // pedestrian-flow rate.
  const effectiveSteps = timelineIndex - Math.floor(distanceKm / 1.5);
  const levelIndex = Math.min(SHELTER_OCCUPANCY_LEVELS.length - 1, Math.max(0, effectiveSteps));
  return SHELTER_OCCUPANCY_LEVELS[levelIndex];
}
/**
 * Occupancy level -> card color. Pure lookup into SHELTER_STATUS_HEX by
 * SHELTER_OCCUPANCY_LEVELS index, isolated into its own function (rather
 * than inlined at each call site) so 'blocked' state's override lives
 * in exactly one place: an inaccessible shelter always renders
 * SHELTER_INACCESSIBLE_HEX regardless of whatever occupancy level it
 * happens to also be at, since "can't be reached at all" is a strictly
 * worse, and visually distinct, situation than "reachable but full".
 */
function resolveShelterStatusHex(occupancyLevel, accessible) {
  if (!accessible) return SHELTER_INACCESSIBLE_HEX;
  const index = SHELTER_OCCUPANCY_LEVELS.indexOf(occupancyLevel);
  return SHELTER_STATUS_HEX[index === -1 ? 0 : index];
}

/**
 * Word-wraps `text` to fit within `maxWidth` canvas px at the context's
 * CURRENT font, returning up to `maxLines` lines with an ellipsis
 * appended to the last line if content was truncated. Plain manual
 * wrap via ctx.measureText — canvas 2D has no built-in text-wrap, this
 * is the standard way to fake it.
 */
function wrapCanvasText(ctx, text, maxWidth, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (let i = 0; i < words.length; i += 1) {
    const attempt = current ? `${current} ${words[i]}` : words[i];
    if (ctx.measureText(attempt).width > maxWidth && current) {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines) break;
    } else {
      current = attempt;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  const truncated = lines.length === maxLines
    && (words.join(' ').length > lines.join(' ').length);
  if (truncated) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}\u2026`).width > maxWidth && last.length > 0) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last}\u2026`;
  }
  return lines;
}

/**
 * Manual rounded-rect path helper, replacing CanvasRenderingContext2D's
 * native `roundRect()` method. `roundRect` is a genuinely recent
 * addition to the Canvas 2D API — NOT safe to assume is available in
 * every browser/engine this app might run in — and this codebase
 * learned that the hard way: calling it unconditionally threw
 * `TypeError: ctx.roundRect is not a function` on the very first
 * shelter card, which aborted the rest of `map.on('load', ...)`
 * (everything after that point in the callback — impact-zone circle
 * growth, building-risk coloring, road congestion, evac route — never
 * ran, since it's all one synchronous callback; see this pass's
 * continuation prompt for the full trace). This is drawn with plain
 * `moveTo`/`lineTo`/`arcTo`, a completely standard technique with
 * universal support, so this function can never be the thing that
 * takes the rest of the scene down. Adds a rect path to the CURRENT
 * path (same calling convention as native roundRect) — caller still
 * owns beginPath()/fill()/stroke().
 */
function drawRoundedRectPath(ctx, x, y, width, height, r) {
  const radius = Math.min(r, width / 2, height / 2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/**
 * Draws ONE shelter's floating status card onto a fresh canvas — the
 * visual replacement for the old buildShelterCardElement DOM version
 * (background panel, colored border, downward tail, name, structural
 * badge, live distance, progress bar, status line, feasibility note —
 * same content, same information, different rendering primitive so it
 * can live as a real map `icon-image` instead of a screen-space DOM
 * node; see the SHELTER_CARD_* constants' doc comment for why).
 * Returns the canvas, which the caller registers/updates via
 * map.addImage / map.updateImage.
 */
function renderShelterCardCanvas(shelter, {
  occupancy, accessible, distanceKm, fillPercent, statusHex, capacityBoostPercent = null,
  // Scene-config-driven (was hardcoded to the security-attack scene's
  // own "Kartavya Path jammed" wording) — see each scenes/*.js's
  // `blockedShelterLabel` for the active scene's own reason text.
  blockedLabel = '\u26d4 Blocked',
}) {
  const w = SHELTER_CARD_CSS_WIDTH;
  const ratio = SHELTER_CARD_PIXEL_RATIO;
  const padX = 10;
  const tailH = 8;
  const radius = 10;
  const bottomPad = 10;
  const hasBoost = typeof capacityBoostPercent === 'number' && capacityBoostPercent > 0;

  // --- measurement pass (font metrics only depend on the font string,
  // not the canvas's pixel size, so this scratch context can safely
  // decide the wrapped line counts before the real canvas is sized) ---
  // Fix: the panel used to be a fixed 176px tall regardless of content,
  // which clamped the feasibility note to 3 lines and left a large
  // empty gap below short notes. Now the card's height is derived from
  // its actual measured content, and the note is allowed to wrap up to
  // 5 lines (still ellipsized past that) instead of 3.
  const measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = '700 12px system-ui, -apple-system, sans-serif';
  const nameLines = wrapCanvasText(measureCtx, shelter.name, w - padX * 2, 2);
  measureCtx.font = '400 9px system-ui, -apple-system, sans-serif';
  const noteLines = wrapCanvasText(measureCtx, shelter.metadata.feasibilityNote, w - padX * 2, 5);

  let y = 18;
  y += nameLines.length * 14;
  y += 2; // gap after name
  // Task 3: an extra row above the badge/distance row when a capacity
  // boost is active ("+X% capacity" banner) — added to the measurement
  // pass first so the card's own computed height accounts for it,
  // exactly like every other row here.
  if (hasBoost) y += 13;
  y += 14; // badge + distance row
  y += 5 + 13; // progress bar + gap
  y += 13; // status line
  const contentBottomY = y + noteLines.length * 11;
  const panelH = contentBottomY + bottomPad;
  const h = panelH + tailH;

  const canvas = document.createElement('canvas');
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, w, h);

  // --- panel background (rounded rect) ---
  ctx.beginPath();
  drawRoundedRectPath(ctx, 0, 0, w, panelH, radius);
  ctx.fillStyle = 'rgba(10, 10, 11, 0.88)';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = statusHex;
  ctx.stroke();

  // --- downward-pointing tail, same statusHex as the border ---
  ctx.beginPath();
  ctx.moveTo(w / 2 - 7, panelH - 1);
  ctx.lineTo(w / 2 + 7, panelH - 1);
  ctx.lineTo(w / 2, panelH + tailH - 1);
  ctx.closePath();
  ctx.fillStyle = statusHex;
  ctx.fill();

  y = 18;
  ctx.textBaseline = 'alphabetic';

  // --- name ---
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#e4e4e7';
  nameLines.forEach((line) => {
    ctx.fillText(line, padX, y);
    y += 14;
  });
  y += 2;

  // --- capacity-boost banner (Task 3): "Capacity increased by X% more"
  // — only drawn while a what-if capacity boost is active, in the same
  // emerald tone used elsewhere in this app for "things got better"
  // states (see SHELTER_STATUS_HEX's own green, and
  // InterventionResponseTurn's badge in ChatMessage.jsx), so it reads
  // consistently as a positive, non-alarm annotation distinct from the
  // status-colored border/tail.
  if (hasBoost) {
    ctx.font = '700 9px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText(`▲ Capacity increased by ${capacityBoostPercent}% more`, padX, y);
    y += 13;
  }

  // --- structural badge + distance ---
  const badgeLabel = shelter.metadata.structuralRating.replace('-', ' ').toUpperCase();
  ctx.font = '600 9px system-ui, -apple-system, sans-serif';
  const badgeTextWidth = ctx.measureText(badgeLabel).width;
  const badgePadX = 5;
  const badgeW = badgeTextWidth + badgePadX * 2;
  const badgeH = 13;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  drawRoundedRectPath(ctx, padX, y - badgeH + 3, badgeW, badgeH, 4);
  ctx.fill();
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(badgeLabel, padX + badgePadX, y);
  ctx.font = '400 10px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(`${distanceKm.toFixed(2)} km from impact`, padX + badgeW + 8, y);
  y += 14;

  // --- progress bar track + fill ---
  const barW = w - padX * 2;
  const barH = 5;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  drawRoundedRectPath(ctx, padX, y, barW, barH, 3);
  ctx.fill();
  const fillW = Math.max(barH, (fillPercent / 100) * barW);
  ctx.fillStyle = statusHex;
  ctx.beginPath();
  drawRoundedRectPath(ctx, padX, y, fillW, barH, 3);
  ctx.fill();
  y += barH + 13;

  // --- status line ---
  ctx.font = '600 10px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = statusHex;
  const statusLabel = accessible
    ? `\u25cf ${occupancy} (${fillPercent}%)`
    : blockedLabel;
  ctx.fillText(statusLabel, padX, y);
  y += 13;

  // --- feasibility note, now wrapped to fit the card's own measured
  // height instead of being clipped to a fixed 3 lines ---
  ctx.font = '400 9px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#a1a1aa';
  noteLines.forEach((line) => {
    ctx.fillText(line, padX, y);
    y += 11;
  });

  return canvas;
}

/**
 * Registers or updates a shelter's card image on the map. First call
 * for a given shelter uses map.addImage; every subsequent call (a
 * scenario/timelineIndex change) uses map.updateImage to replace the
 * bitmap in place — MapLibre re-renders any symbol layer referencing
 * that image id automatically, no source/layer touch needed. Tracked
 * via `registeredIds` (a Set held in a ref by the caller) since
 * map.hasImage exists but re-checking it on every call is no cheaper
 * than just tracking it ourselves alongside the rest of this file's
 * ref-based bookkeeping.
 */
/**
 * Registers or updates a shelter's card image on the map. Uses
 * map.hasImage as the SOLE source of truth for whether to addImage vs
 * updateImage — a prior version tracked this with our own Set instead,
 * which desynced from the map's real registry under React
 * StrictMode's double-effect-invoke / Vite HMR in dev.
 *
 * ROOT CAUSE of the `RangeError: mismatched image size. expected: 0
 * but got: 1115136` crash (this pass's actual fix): that error was
 * firing on the very FIRST addImage call for a brand-new image id, not
 * just on updateImage/re-add — meaning it was never about stale state,
 * it was about the argument shape. We were handing map.addImage a raw
 * HTMLCanvasElement directly. This installed maplibre-gl build reads
 * that canvas's pixel data via its own internal image-decoding path,
 * and something in that path was resolving the canvas's width/height
 * as 0 while still reading its full pixel buffer (528x528x4 =
 * 1,115,136 bytes) — an internal RGBAImage-vs-source-dimensions
 * mismatch, not a bug in our canvas drawing code at all. The fix is to
 * stop handing MapLibre a canvas element and instead extract a real
 * `ImageData` ourselves via `ctx.getImageData(...)` — ImageData is
 * one of addImage's officially documented, unambiguous input shapes
 * (`{width, height, data}`, guaranteed internally consistent since the
 * browser itself constructs it), so there's no decoding path left for
 * MapLibre to get the dimensions wrong on.
 */
function canvasToImageData(canvas) {
  const ctx = canvas.getContext('2d');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Stable image ids for landmark/road label pills — module-level so both
// the one-time map.on('load') setup and the recurring update functions
// (updateLandmarkLabels/updateRoadLabels) agree on the same id for a
// given landmark/road without needing to pass a closure around.
function landmarkLabelImageId(landmarkId) {
  return `landmark-label-${landmarkId}`;
}
function roadLabelImageId(dedupeKey) {
  return `road-label-${dedupeKey}`;
}

function upsertShelterCardImage(map, imageId, canvas) {
  const imageData = canvasToImageData(canvas);
  if (map.hasImage(imageId)) {
    try {
      map.updateImage(imageId, imageData);
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`updateImage failed for ${imageId}, falling back to re-add`, err);
      map.removeImage(imageId);
    }
  }
  map.addImage(imageId, imageData, { pixelRatio: SHELTER_CARD_PIXEL_RATIO });
}


// ---------------------------------------------------------------------
// Automatic road-congestion resolver (pivot away from hand-authored
// per-id `roadCongestion` JSON entries — see the continuation prompt /
// PROJECT_CONTEXT.md for the full history of why). Person has no way to
// hand-pick real road ids via the live map, so instead of relying on
// security-attack.json's (now permanently empty) `roadCongestion`
// arrays, real roads near the impact point are classified automatically
// every tick, using the SAME red/yellow/green radii already driving the
// building-risk engine and impact-zone circles (resolveActiveRadii).
// Mirrors resolveBuildingCandidates/applyBuildingRiskForRadii's shape as
// closely as possible so this is a straightforward sibling system, not
// a new one-off pattern.
// ---------------------------------------------------------------------

// Promoted out of the `sampleMajorRoads` devtools closure (it was
// trapped there for that helper's own filtering) into a real
// module-level constant, since resolveRoadCandidates below needs the
// exact same "is this actually a drivable street" filter, not the raw
// unfiltered dump of every transportation feature (which is
// overwhelmingly footpaths/service tracks/transit lines — see the
// devtools findings above).
const DRIVABLE_CLASSES = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link',
  'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'residential', 'unclassified',
  'living_street',
]);

// The security-attack timeline's own explicit rule: the ATTACK itself
// happens at T+15, not T+0. General distance-based road classification
// (classifyRoadCongestion, below) now runs on every tick from T+0
// onward, off the exact same radii already driving buildings/circles —
// it naturally produces a near-empty result at T+0–T+10 since those
// keyframes' red/yellow radii are tiny (0.08–0.42km), without needing a
// hard gate. What DOES still need a hard T+15 gate is the Kartavya Path
// forced-jam override just below: the brief wants that specific
// boulevard to snap to fully jammed at the actual attack moment, not
// gradually creep red from T+0 the way a purely distance-derived road
// would. Gating off the keyframe LABEL (found by name in
// scenario.timeline, not a hardcoded array index) so this still holds
// even if keyframes are reordered/added/removed later.
const ROADS_ACTIVATION_LABEL = 'T+15';
/**
 * Per-road distance -> congestion classification, deliberately mirroring
 * classifyBuildingRisk's shape/innermost-wins ordering above. Roads
 * inside the red radius jam hardest and earliest; roads inside the
 * (larger) yellow radius are merely 'slow'; anything at or beyond the
 * green radius is 'none' (fully transparent, matched by the layer's own
 * opacity fallback). This is intentionally a simple two-tier version of
 * classifyBuildingRisk (no separate green-band congestion level exists —
 * a road doesn't have a 3rd degraded state the way a building has a
 * distinct green risk color) rather than a novel traffic-simulation
 * model, per the task's explicit "don't overengineer" guidance.
 *
 * @returns {'jammed'|'slow'|'none'}
 */
function classifyRoadCongestion(distanceKm, radii) {
  if (distanceKm <= radii.red) return 'jammed';
  if (distanceKm <= radii.yellow) return 'slow';
  return 'none';
}
/**
 * Per-building distance -> band classification. Pure function, no map
 * access, so it's trivially testable and reusable from the animation
 * loop without any MapLibre-specific state.
 *
 * Bands are innermost-wins: red first, then yellow, then green: a
 * building inside the red radius is red even though it's technically
 * also inside the (larger) yellow/green radii. Radii are treated as
 * whatever order they come in — if a keyframe is authored with, say,
 * yellowRadiusKm < redRadiusKm (a malformed keyframe), the innermost-
 * wins check order still yields a sane (if visually odd) result rather
 * than throwing, since we don't assume ordering, only compare each
 * radius directly against distance.
 *
 * @returns {'red'|'yellow'|'green'|'none'}
 */
function classifyBuildingRisk(distanceKm, radii) {
  if (distanceKm <= radii.red) return 'red';
  if (distanceKm <= radii.yellow) return 'yellow';
  if (distanceKm <= radii.green) return 'green';
  return 'none';
}
// Task 8f FIX A (random building recoloring): MapLibre's setFeatureState
// is keyed by { source, sourceLayer, id } — and vector-tile feature ids
// are only guaranteed unique WITHIN a single tile, not globally across
// the whole source. As the camera moves/zooms and different tiles load
// (or the same tile gets re-requested at a different zoom), a totally
// unrelated building can coincidentally carry the same numeric id a
// landmark used, and silently inherit its highlight color the instant
// that tile renders — this is the "random buildings turning
// orange/red" symptom. The fix is `promoteId`: it tells MapLibre to key
// feature state off a feature PROPERTY instead of the tile-local id, so
// the same real-world building keeps the same identity across every
// tile/zoom it ever appears in, and two different buildings can never
// collide.
//
// We can't just add `promoteId` to the *existing* `openmaptiles` source
// (it's declared by the base style itself, and changing it would mean
// tearing down and re-adding every layer that already reads from it —
// roads, water, labels, the works). Instead we add a SECOND vector
// source pointing at the exact same tiles, with promoteId set only for
// the `building` source-layer, and point `3d-buildings` at that one.
// Every other layer in the style is left completely alone.
//
// CORRECTION (researched against OpenMapTiles' own published building
// layer schema + OpenFreeMap's tile generator): `osm_id` is NOT a
// property/tag exposed on building features in these tiles. It only
// ever appears as an internal SQL join key in the legacy Postgres/
// ST_AsMVT pipeline's query (`SELECT osm_id, geometry, render_height,
// render_min_height, colour, hide_3d FROM layer_building(...)`) — the
// *emitted* tile fields for the `building` layer are render_height,
// render_min_height, colour, and hide_3d only; osm_id is consumed by
// the query, never written out as a feature property. OpenFreeMap
// itself is generated by Planetiler (not that Postgres pipeline)
// anyway. `promoteId: { building: 'osm_id' }` was therefore looking
// for a property that never exists on any building feature — every
// single feature silently resolved to `id === undefined`, which
// resolveBuildingCandidates below correctly (and silently) drops. That
// is the actual root cause of "no buildings ever get colored": the
// candidate list was empty on every run, not a timing/query-order bug.
//
// The fix is to stop using promoteId at all and rely on the vector
// tile's own native numeric `id` element instead. Planetiler (which
// builds OpenFreeMap's tiles) documents writing that id as
// `{OSM element id} * 10 + {1 node / 2 way / 3 relation / 0 other}`
// for every feature by default — i.e. it's already derived from the
// real-world OSM id, not a tile-local index, so it's already globally
// stable across every tile/zoom a building appears in. That's exactly
// the property `promoteId` exists to provide, except MapLibre gets it
// for free from the tile's id slot here, no property lookup needed.
// generateId (MapLibre's *other* id-assignment option) is documented
// as GeoJSON-source-only and doesn't apply to vector sources at all,
// so it was never a viable fallback here either.
const BUILDINGS_SOURCE_ID = 'openmaptiles-buildings';

// --- Building-color-bleed fix (see BUILDING_COLOR_BLEED_ROOT_CAUSE.md) ---
//
// A single vector-tile "building" feature is not guaranteed to be one
// visual building: Planetiler merges nearby buildings into one feature
// at z13, and independently of that, OSM building complexes (attached
// row-houses, courtyards, government/campus blocks — common around a
// dense civic core) are frequently tagged as a single multipolygon
// relation. setFeatureState keys by { source, sourceLayer, id } and
// recolors the ENTIRE feature in one call — every ring/part — with no
// way to color just one part of a multipolygon. Since
// resolveBuildingCandidates below only ever computed one
// turf.pointOnFeature point (and therefore one distance/band) per
// feature, a single merged feature with even one part near the impact
// point got its whole geometry — including far-flung parts — painted
// the same color. That's the "whole tile/cluster recolors together"
// symptom.
//
// The fix: stop driving the extrusion layer's feature-state directly
// off the vector tile source. Instead, on every resolveBuildingCandidates
// run we explode every vector-tile building feature into individual
// Polygon features (turf.flatten), assign each exploded polygon its own
// synthetic sequential id, and feed the result into this separate
// client-held GeoJSON source. `3d-buildings` reads from this source, so
// setFeatureState now targets one real, spatially-local polygon per id
// instead of one (possibly multi-building) OSM relation. The vector
// source (BUILDINGS_SOURCE_ID) is still queried for geometry — it's
// just no longer what the layer paints from.
const EXPLODED_BUILDINGS_SOURCE_ID = 'exploded-buildings';

/** Highest-severity building in a baseline, or null if there are none. */
function findPrimaryImpactBuilding(baseline) {
  const buildings = baseline?.buildings || [];
  if (buildings.length === 0) return null;
  return [...buildings].sort((a, b) => (RISK_RANK[b.riskLevel] || 0) - (RISK_RANK[a.riskLevel] || 0))[0];
}
/** Highest-capacity shelter in a baseline — used as the evac route target. */
function findTargetShelter(baseline) {
  const shelters = baseline?.shelters || [];
  if (shelters.length === 0) return null;
  return [...shelters].sort((a, b) => (b.capacity || 0) - (a.capacity || 0))[0];
}

/**
 * Finds a style's label layer so new layers (3d-buildings) can be
 * inserted below it — i.e. buildings render under text, not over it.
 *
 * Task 8d FIX 1: bright and dark are two DIFFERENT upstream style
 * families (bright is OpenFreeMap's own composed style; dark is an
 * unmodified port of openmaptiles/dark-matter-gl-style — see
 * PROJECT_CONTEXT.md), so their layer ids/ordering aren't guaranteed to
 * match. Naively grabbing the very first `type: 'symbol'` layer is
 * fragile: dark-matter-gl-style's earliest symbol layers are
 * line-placed labels running along roads/rivers (e.g. `water_name`,
 * `road_name`), not point-placed place/POI labels — inserting buildings
 * immediately below one of those would leave the buildings layer very
 * low in the stack, likely under road/water fill layers that come
 * later. Point-placed symbol layers (`symbol-placement` defaulting to
 * `point`, i.e. NOT explicitly `'line'`) are a much closer proxy for
 * "the actual place/POI labels", so those are preferred; falling back
 * to the first symbol layer of any kind, then to `undefined` (which
 * makes MapLibre's addLayer put the new layer on TOP of everything —
 * still visible, just not tucked under labels) if the style somehow has
 * no symbol layers at all. The `undefined` fallback path is logged so
 * this never fails silently.
 */
function findLabelLayerId(map) {
  const layers = map.getStyle()?.layers || [];
  const symbolLayers = layers.filter((layer) => layer.type === 'symbol');
  const pointLabelLayer = symbolLayers.find(
    (layer) => layer.layout?.['symbol-placement'] !== 'line',
  );
  const chosen = pointLabelLayer || symbolLayers[0];
  if (!chosen) {
    // eslint-disable-next-line no-console
    console.warn(
      '[MapLibreView] findLabelLayerId: no symbol layer found in this style — '
        + '3d-buildings will be added on top of the whole style instead of below labels.',
    );
  }
  return chosen?.id;
}

// A single projected pixel rarely lands exactly on a real building
// polygon — delhiLandmarks.js's coordinates are approximate lookups, not
// survey-accurate, and a landmark's true footprint centroid can be a few
// meters off from where its label/POI sits. Querying a small box around
// the projected point (instead of the bare point) tolerates that slop
// without risking false matches — 24px is roughly one building's width
// at the zoom levels this scene actually uses (15–16.5).
const FEATURE_QUERY_RADIUS_PX = 12;

function queryBoxAround(point) {
  return [
    [point.x - FEATURE_QUERY_RADIUS_PX, point.y - FEATURE_QUERY_RADIUS_PX],
    [point.x + FEATURE_QUERY_RADIUS_PX, point.y + FEATURE_QUERY_RADIUS_PX],
  ];
}


// ---------------------------------------------------------------------
// Scene-config-driven versions (Modularization pass — see
// sceneRegistry.js / scenes/*.js). These three functions used to close
// over module-level constants (INACCESSIBLE_AFTER_KARTAVYA_JAM_SHELTER_ID,
// DEFAULT_RED/YELLOW/GREEN_RADIUS_KM derived from IMPACT_ZONE_RADIUS_KM,
// LANDMARK_IDS) that were specific to the security-attack scene. Now
// that MapLibreEngine.jsx is shared across multiple scenes, each of
// those values comes from the active scene's config object instead, so
// each function takes it as an explicit parameter — same logic,
// same behavior for security-attack (its scene config carries the exact
// values these constants used to hold), just no longer hardcoded.
// ---------------------------------------------------------------------

/**
 * The hardcoded "one shelter becomes inaccessible once the scene's
 * named forced-jam corridor activates" rule — explicit person request,
 * originally Kartavya-Path-specific, now scene-config-driven.
 * `inaccessibleShelterId` is the active scene's own pick (see each
 * scenes/*.js file for the geography-backed reasoning behind its
 * choice); gated by the SAME `kartavyaOverrideActive` boolean already
 * driving that scene's forced-jam road override, so both effects flip
 * at exactly the same timeline step.
 */
function resolveShelterAccessible(shelterId, kartavyaOverrideActive, inaccessibleShelterId) {
  if (!inaccessibleShelterId || shelterId !== inaccessibleShelterId) return true;
  return !kartavyaOverrideActive;
}

/**
 * Resolves the "current" impact point + three radii from whatever
 * scenario/state object MapLibreEngine was handed (baseline, or a
 * timeline-keyframe-merged state — both flow through mergeKeyframe.js).
 * Falls back to `defaultRadii` (the active scene's own
 * impactZoneRadiusKm-derived red/yellow/green trio — see each
 * scenes/*.js's `defaultRadii`) if a state doesn't define these fields
 * at all, so this never throws on an older/malformed scenario object.
 */
function resolveActiveRadii(state, impactCenter, defaultRadii) {
  const hasExplicitRadii = typeof state?.redRadiusKm === 'number'
    || typeof state?.yellowRadiusKm === 'number'
    || typeof state?.greenRadiusKm === 'number';

  const point = state?.impactPoint || impactCenter;

  if (!hasExplicitRadii) {
    return {
      point,
      red: defaultRadii.red,
      yellow: defaultRadii.yellow,
      green: defaultRadii.green,
    };
  }

  return {
    point,
    red: state.redRadiusKm ?? defaultRadii.red,
    yellow: state.yellowRadiusKm ?? defaultRadii.yellow,
    green: state.greenRadiusKm ?? defaultRadii.green,
  };
}

/**
 * Assigns each of the active scene's landmark ids a riskLevel drawn
 * from the scenario's own highest-severity buildings, since a
 * scenario's `buildings` are generic/unnamed (b1..b10) and don't
 * correspond to real landmark names. Buildings are ranked by severity
 * (ties keep JSON order) and handed out to landmarks in `landmarkIds`
 * order (the active scene's own landmark roster — see scenes/*.js), so
 * the most dramatic buildings drive the most prominent landmarks —
 * landmarks beyond the number of available buildings default to
 * 'green'.
 */
function deriveLandmarkRisk(baseline, landmarkIds) {
  const buildings = baseline?.buildings || [];
  const ranked = [...buildings].sort((a, b) => (RISK_RANK[b.riskLevel] || 0) - (RISK_RANK[a.riskLevel] || 0));
  const riskById = {};
  (landmarkIds || []).forEach((id, index) => {
    riskById[id] = ranked[index]?.riskLevel || 'green';
  });
  return riskById;
}


export {
  // constants
  STYLE_URL, STYLE_URLS, THEME_IDS, THEME_LABELS, TRANSITION_MS, RISK_RANK, IMPACT_ZONE_GROW_MS, ROUTE_ANIMATE_MS,
  BUILDING_RISK_HEX, BUILDING_DEFAULT_GRAY, ROADS_SOURCE_LAYER, ROAD_CONGESTION_HEX,
  SAFE_ZONE_HEX, SAFE_ZONE_FILL_HEIGHT, EXCLUSION_MARGIN_FACTOR,
  SHELTER_OCCUPANCY_LEVELS, SHELTER_INACCESSIBLE_HEX, SHELTER_STATUS_HEX,
  SHELTER_CARD_CSS_WIDTH, SHELTER_CARD_CSS_HEIGHT, SHELTER_CARD_PIXEL_RATIO,
  SHELTER_CARD_ICON_SIZE_EXPR, SHELTER_CARD_ICON_OFFSET,
  CAPACITY_BADGE_CSS_WIDTH, CAPACITY_BADGE_CSS_HEIGHT, CAPACITY_BADGE_PIXEL_RATIO,
  CAPACITY_BADGE_ICON_OFFSET, CAPACITY_BADGE_HEX,
  LABEL_PILL_CSS_WIDTH, LABEL_PILL_CSS_HEIGHT, LABEL_PILL_PIXEL_RATIO,
  LABEL_PILL_ICON_SIZE_EXPR, LABEL_PILL_ICON_OFFSET,
  DRIVABLE_CLASSES, ROADS_ACTIVATION_LABEL,
  BUILDINGS_SOURCE_ID, EXPLODED_BUILDINGS_SOURCE_ID, FEATURE_QUERY_RADIUS_PX,
  // canvas render helpers
  renderCapacityBadgeCanvas, renderLabelPillCanvas, wrapCanvasText, drawRoundedRectPath,
  renderShelterCardCanvas, canvasToImageData, landmarkLabelImageId, roadLabelImageId,
  upsertShelterCardImage,
  // geometry / classification helpers
  seededRandom, buildShelterFootprint, resolveShelterExclusionRadiusKm,
  resolveShelterOccupancyLevel, resolveShelterAccessible, resolveShelterStatusHex,
  classifyRoadCongestion, classifyBuildingRisk, resolveActiveRadii,
  findPrimaryImpactBuilding, deriveLandmarkRisk, findTargetShelter,
  findLabelLayerId, queryBoxAround,
};