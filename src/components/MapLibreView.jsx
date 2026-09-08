import { useEffect, useRef } from 'react';
// maplibre-gl v6's ESM build has no default export (named exports only),
// so this uses a namespace import and refers to maplibregl.Map /
// maplibregl.NavigationControl below.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre-gl v6 needs its Web Worker location told to it explicitly
// under bundlers: `import.meta.url` (which the library normally uses to
// auto-locate the worker) doesn't reliably resolve inside Vite's module
// graph. `?worker&url` routes the worker file through Vite's own worker
// pipeline so it — and the maplibre-gl-shared.mjs sibling chunk it
// imports — actually get emitted, instead of `?url` alone which drops
// that sibling and leaves the worker unable to load. This one-time call
// (see below, right after the imports) is what makes tile parsing work
// in dev; without it the map silently never leaves an unloaded state
// (root cause of the Task 8b blank-map bug — see PROJECT_CONTEXT.md).
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import * as turf from '@turf/turf';
import { RISK_HEX } from './MapView';
import { LANDMARK_IDS, LANDMARKS } from '../data/delhiLandmarks';

/**
 * MapLibreView — Task 8b proof-of-concept 3D map, wired up for the
 * security-attack scenario ONLY. CommandShell renders this in place of
 * the SVG MapView exclusively when `activeScenario.id === 'security-attack'`;
 * every other scenario still renders through the original MapView.
 * See CommandShell.jsx for the conditional-render bridge and its
 * documentation.
 *
 * Prop contract is IDENTICAL to MapView: a single `scenario` object
 * shaped like a scenario JSON entry, with `baseline` already swapped for
 * whichever timeline-merged / intervention state CommandShell wants
 * rendered (see CommandShell's `mapViewScenario`). This component never
 * needs to know about timeline indices, intervention flags, etc. — it
 * just renders whatever `scenario.baseline` currently says.
 */

// Must run before the first `new maplibregl.Map(...)` anywhere in the
// app. Module-level (not inside the component/effect) so it only ever
// runs once, regardless of how many times MapLibreView mounts.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

// Task 8d FIX 1: OpenFreeMap's dark style, forked from
// openmaptiles/dark-matter-gl-style — free, no key, same zero-config
// setup as bright. Confirmed live at this exact URL (it's listed on
// OpenFreeMap's own Quick Start guide alongside bright/liberty/positron).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

// Mirrors MapView's TRANSITION_MS convention (Task 5) so landmark risk
// color changes crossfade at the same speed as every other risk-driven
// visual in this app, instead of introducing a new timing constant.
const TRANSITION_MS = 400;

// Central Delhi centroid for the security-attack scenario's building
// cluster (mean of the 10 baseline building coordinates in
// src/scenarios/security-attack.json) — used only as a last-resort
// fallback if a scenario is ever passed in with no buildings at all.
const FALLBACK_CENTER = { lat: 28.6134, lng: 77.2096 };

const RISK_RANK = { red: 4, orange: 3, yellow: 2, green: 1 };

const IMPACT_ZONE_RADIUS_KM = 0.3; // ~300m "affected area" radius, used only as a fallback when a scenario/keyframe has no explicit radii (see resolveActiveRadii)
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

// Fallback radii (km) used only if a scenario/keyframe defines no
// explicit impactPoint/radii at all (research §9's approach assumes
// these are always present; this is the "smallest reasonable
// assumption" fallback called out in the task prompt for anything the
// research artifact doesn't cover — flagged in the implementation
// summary).
const DEFAULT_RED_RADIUS_KM = IMPACT_ZONE_RADIUS_KM * 0.4;
const DEFAULT_YELLOW_RADIUS_KM = IMPACT_ZONE_RADIUS_KM * 0.7;
const DEFAULT_GREEN_RADIUS_KM = IMPACT_ZONE_RADIUS_KM;

// Research §7/§9: only re-evaluate a building's band on ticks where the
// growing/shrinking radius has actually crossed that building's
// precomputed distance, rather than calling setFeatureState on every
// candidate building every animation frame. RADIUS_EPSILON_KM guards
// against float-jitter re-triggering a "band changed" recompute when
// the radius is effectively unchanged between ticks.
const RADIUS_EPSILON_KM = 0.0005; // 0.5m

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

/**
 * Resolves the "current" impact point + three radii from whatever
 * scenario/state object MapLibreView was handed (baseline, or a
 * timeline-keyframe-merged state — both flow through mergeKeyframe.js,
 * see that file's updated field-passthrough). Falls back to the
 * primary-impact-building heuristic / fixed radii used by the old
 * single-circle code if a state doesn't define these fields at all, so
 * this never throws on an older/malformed scenario object.
 */
function resolveActiveRadii(state, impactCenter) {
  const hasExplicitRadii = typeof state?.redRadiusKm === 'number'
    || typeof state?.yellowRadiusKm === 'number'
    || typeof state?.greenRadiusKm === 'number';

  const point = state?.impactPoint || impactCenter;

  if (!hasExplicitRadii) {
    return {
      point,
      red: DEFAULT_RED_RADIUS_KM,
      yellow: DEFAULT_YELLOW_RADIUS_KM,
      green: DEFAULT_GREEN_RADIUS_KM,
    };
  }

  return {
    point,
    red: state.redRadiusKm ?? DEFAULT_RED_RADIUS_KM,
    yellow: state.yellowRadiusKm ?? DEFAULT_YELLOW_RADIUS_KM,
    green: state.greenRadiusKm ?? DEFAULT_GREEN_RADIUS_KM,
  };
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

/**
 * Assigns each of the 5 landmark ids a riskLevel drawn from the
 * scenario's own highest-severity buildings, since security-attack.json's
 * buildings are generic/unnamed (b1..b10) and don't correspond to real
 * landmark names. Buildings are ranked by severity (ties keep JSON
 * order) and handed out to landmarks in LANDMARK_IDS order, so the most
 * dramatic buildings drive the most prominent landmarks — landmarks
 * beyond the number of available buildings default to 'green'.
 */
function deriveLandmarkRisk(baseline) {
  const buildings = baseline?.buildings || [];
  const ranked = [...buildings].sort((a, b) => (RISK_RANK[b.riskLevel] || 0) - (RISK_RANK[a.riskLevel] || 0));
  const riskById = {};
  LANDMARK_IDS.forEach((id, index) => {
    riskById[id] = ranked[index]?.riskLevel || 'green';
  });
  return riskById;
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

export function MapLibreView({ scenario }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false);

  // Animation bookkeeping, kept in refs since none of it should trigger
  // React re-renders — it's imperative canvas/map state.
  const impactZoneFrameRef = useRef(null);
  const routeFrameRef = useRef(null);
  const routeLineRef = useRef(null); // current evac route GeoJSON LineString

  // Task 8c: landmark highlighting via setFeatureState instead of a
  // drawn overlay. landmarkFeatureRef maps each landmark id to the real
  // 3d-buildings feature MapLibre found for it ({ id, source,
  // sourceLayer }, MapLibre's own setFeatureState target shape) once
  // queryRenderedFeatures has successfully located it — see
  // tryResolveLandmarkFeatures. currentRiskByIdRef holds the latest
  // desired riskLevel per landmark id (from applyLandmarkRisk) so that a
  // landmark resolved LATE (found on some subsequent 'idle' after
  // already being assigned a risk level) still gets that risk level
  // applied retroactively instead of silently staying unhighlighted.
  const landmarkFeatureRef = useRef({});
  const currentRiskByIdRef = useRef({});

  // ---------------------------------------------------------------
  // Per-building risk engine bookkeeping (new).
  // buildingCandidatesRef: [{ featureTarget, distanceKm }, ...] for
  //   every candidate building resolved near the current impact point.
  //   Resolved ONCE per impact-point placement (research §9 — "do this
  //   candidate enumeration once ... not every frame"), not per tick.
  // buildingBandByKeyRef: last-applied band per building (keyed by a
  //   stable string derived from the featureTarget id), so the
  //   animation loop only calls setFeatureState when a building's band
  //   actually changes on a given tick (research §7/§9 throttling).
  // riskZoneFrameRef: the single rAF handle driving BOTH the concentric
  //   circles and the building recolor loop (research §9 — "drive both
  //   ... off one requestAnimationFrame loop").
  // ---------------------------------------------------------------
  const buildingCandidatesRef = useRef([]);
  const buildingBandByKeyRef = useRef({});
  // Building-recoloring-never-sticks fix: MapLibre GeoJSON sources only
  // preserve feature-state across setData() for features that KEEP THE
  // SAME id — reassigning fresh sequential ids on every
  // resolveBuildingCandidates call (as this used to do) meant every
  // setData() wiped every previously-set color, and since the
  // session-long 'idle' listener calls resolveBuildingCandidates on
  // every idle tick, colors were being erased faster than the browser
  // could ever paint a frame with them showing. This ref persists a
  // stable numeric id per dedupeKey ACROSS calls, so a building that
  // was already resolved keeps the same id (and therefore its
  // feature-state) on every subsequent rebuild — only genuinely new
  // buildings get a newly-assigned id.
  const buildingIdByDedupeKeyRef = useRef(new Map());
  const nextSyntheticIdRef = useRef(1);
  const riskZoneFrameRef = useRef(null);
  // lastRadiiRef: the most recently fully-settled { point, red, yellow,
  // green } radii, used as the animation's start point so scrubbing the
  // timeline forward/backward always animates a smooth grow/shrink from
  // wherever the zones currently are, rather than restarting from ~0
  // every time. null until the first activation completes.
  const lastRadiiRef = useRef(null);
  // currentRadiiRef: the radii actually rendered on the MOST RECENT
  // animation tick, updated every frame (unlike lastRadiiRef, which
  // only updates when an animation fully settles). See the BUGFIX
  // comment in animateRiskZones for why this exists.
  const currentRadiiRef = useRef(null);
  // currentImpactCenterRef: the impact point from the most recent
  // activation, kept in a ref (not just closed over inside
  // applyScenarioActivation) so the session-long 'idle' listener added
  // in map.on('load', ...) below can always re-resolve building
  // candidates against wherever the impact point CURRENTLY is, instead
  // of only the point one specific activation started with.
  const currentImpactCenterRef = useRef(FALLBACK_CENTER);

  // -------------------------------------------------------------------
  // Map init — runs once on mount.
  //
  // Root cause of the Task 8b blank-map bug (see PROJECT_CONTEXT.md /
  // MAPLIBRE_DEBUG_PROMPT.md for the full investigation trail): under
  // Vite, maplibre-gl v6's Web Worker (which does all vector-tile
  // parsing) never resolved, because `import.meta.url` — which the
  // library normally uses to auto-locate its worker script — doesn't
  // reliably resolve inside Vite's dev module graph. That's a
  // bundler-level resolution failure, not a MapLibre runtime error, so
  // it never surfaced as an `error` event on the map: tiles fetched
  // fine, the style loaded fine, but nothing was ever decoded, so
  // `load`/`idle` never fired. Fixed via the explicit setWorkerUrl()
  // call at module scope above, paired with excluding maplibre-gl from
  // Vite's dependency pre-bundling in vite.config.js (pre-bundling was
  // the specific thing breaking the worker chunk's emission). The
  // StrictMode double-invoke theory from the earlier debugging session
  // was investigated and ruled out — it was never the actual cause.
  // -------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [FALLBACK_CENTER.lng, FALLBACK_CENTER.lat],
      zoom: 15,
      pitch: 55,
      bearing: -15,
      // Task 8e: MapLibre's own hard ceiling for pitch is 85° (it's
      // baked into the renderer, not a config choice — the library
      // simply won't go higher than this regardless of setMaxPitch()).
      // The default is only 60, so raising it here is what actually
      // removes OUR earlier self-imposed restriction; there's no way to
      // get truly unlimited pitch out of MapLibre GL JS itself.
      maxPitch: 85,
      canvasContextAttributes: { antialias: true },
      attributionControl: true,
    });
    mapRef.current = map;
    // Debug hook — harmless to keep, but safe to delete once you've
    // confirmed the fix live (window.__debugMap.loaded() should read
    // `true` once idle).
    window.__debugMap = map;

    map.on('error', (e) => {
      // eslint-disable-next-line no-console
      console.error('[MapLibre error event]', e.error || e);
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    // Task 8f FIX B: increase scroll-zoom intensity. MapLibre's default
    // wheel-zoom rate (~1/450 per wheel-delta unit) and trackpad-zoom
    // rate (~1/100) are tuned conservatively for general-purpose maps;
    // for this cinematic demo we want a single scroll notch to move the
    // camera noticeably more. Roughly doubling both rates (smaller
    // divisor = more zoom per unit of input) does that without touching
    // the zoom curve itself or the min/max zoom bounds.
    map.scrollZoom.setWheelZoomRate(1 / 220);
    map.scrollZoom.setZoomRate(1 / 60);

    // -----------------------------------------------------------------
    // Task 8e — camera drag rebind (unchanged from the previous pass):
    //   - plain LEFT-drag  -> rotate/pitch. Horizontal delta -> bearing
    //     (inverted per feedback), vertical delta -> pitch (unchanged).
    //   - RIGHT-drag       -> pan the map (drag the ground under the
    //     cursor), replacing MapLibre's default right-drag=rotate.
    //   - scroll wheel     -> zoom (now faster, see FIX B above).
    // Both default handlers this replaces (DragPanHandler for
    // left-drag, DragRotateHandler for right-drag/Ctrl+left-drag) are
    // disabled so they don't fight our custom gestures over the same
    // pointer events.
    // -----------------------------------------------------------------
    map.dragPan.disable();
    map.dragRotate.disable();
    // Prevent the browser's own right-click context menu from popping
    // up mid-drag — same fix every custom right-click-drag pan
    // implementation needs. Named (not inline) so it can be removed on
    // unmount below.
    function onContainerContextMenu(e) {
      e.preventDefault();
    }
    container.addEventListener('contextmenu', onContainerContextMenu);

    const ROTATE_DEG_PER_PX = 0.35;
    const PITCH_DEG_PER_PX = 0.28;
    let activeDragButton = null; // 0 = left (rotate), 2 = right (pan)
    let lastDragPoint = null;

    function onCustomDragPointerDown(e) {
      if (e.button !== 0 && e.button !== 2) return;
      if (e.target.closest && e.target.closest('.maplibregl-ctrl')) return;
      activeDragButton = e.button;
      lastDragPoint = { x: e.clientX, y: e.clientY };
      container.style.cursor = activeDragButton === 0 ? 'grabbing' : 'move';
    }

    function onCustomDragPointerMove(e) {
      if (activeDragButton === null || !lastDragPoint) return;
      const dx = e.clientX - lastDragPoint.x;
      const dy = e.clientY - lastDragPoint.y;
      lastDragPoint = { x: e.clientX, y: e.clientY };

      if (activeDragButton === 0) {
        // Rotate/pitch. Bearing inverted vs. the first pass (dragging
        // right rotates the view the other way); pitch direction
        // unchanged. No manual clamping here beyond what the map's own
        // maxPitch (85, set above) and minPitch (0, MapLibre's floor)
        // already enforce internally. Bearing itself has never been
        // restricted and still isn't.
        map.setBearing(map.getBearing() + dx * ROTATE_DEG_PER_PX);
        map.setPitch(map.getPitch() - dy * PITCH_DEG_PER_PX);
      } else {
        // Pan: move the camera opposite the drag so map content tracks
        // the cursor, matching the feel of MapLibre's own DragPanHandler
        // (which panBy replicates directly — this is the same primitive
        // it's built on).
        map.panBy([-dx, -dy], { animate: false });
      }
    }

    function onCustomDragPointerUp() {
      if (activeDragButton === null) return;
      activeDragButton = null;
      lastDragPoint = null;
      container.style.cursor = 'grab';
    }

    container.style.cursor = 'grab';
    container.addEventListener('pointerdown', onCustomDragPointerDown);
    window.addEventListener('pointermove', onCustomDragPointerMove);
    window.addEventListener('pointerup', onCustomDragPointerUp);
    // -----------------------------------------------------------------

    // MapLibre measures the container's pixel size synchronously inside
    // the constructor. If that measurement happens to land in the same
    // frame React committed this div to the DOM (common for a flex
    // child whose final size only exists after layout settles), the
    // canvas's internal drawing-buffer width/height can get initialized
    // to 0 — and since a ResizeObserver only fires on a *future* size
    // change, it never corrects a container that was already at its
    // final CSS size the whole time. Forcing one resize() on the next
    // frame re-measures and fixes this without waiting for anything to
    // actually change.
    requestAnimationFrame(() => {
      map.resize();
    });

    map.on('load', () => {
      map.resize();
      const labelLayerId = findLabelLayerId(map);

      // --- Task 8f FIX A: dedicated buildings source with promoteId ---
      // See the big comment block near BUILDING_PROMOTE_ID_PROPERTY
      // above for the full rationale. We clone the style's own
      // `openmaptiles` source definition (same tiles, same everything)
      // and add `promoteId` scoped to the `building` source-layer only,
      // so every other style layer (roads, water, labels, the
      // style-provided flat building fill, etc.) keeps using the
      // original `openmaptiles` source completely untouched. Only our
      // own `3d-buildings` layer below reads from this new source.
      // No `promoteId` here (see the big comment block above
      // BUILDINGS_SOURCE_ID for why it was removed) — this second
      // source now exists only so
      // 3d-buildings can be added/removed independently of the style's
      // own building layer, not for any id-remapping purpose. We still
      // clone rather than reuse `openmaptiles` directly, purely to keep
      // this layer's lifecycle isolated from the base style's.
      const styleSources = map.getStyle()?.sources || {};
      const baseBuildingsSource = styleSources.openmaptiles;
      if (baseBuildingsSource && !map.getSource(BUILDINGS_SOURCE_ID)) {
        map.addSource(BUILDINGS_SOURCE_ID, { ...baseBuildingsSource });
      } else if (!baseBuildingsSource) {
        // eslint-disable-next-line no-console
        console.warn(
          '[MapLibreView] no `openmaptiles` source found in the loaded style — '
            + 'falling back to it directly for 3d-buildings.',
        );
      }
      // Not read by any addLayer call anymore — resolveBuildingCandidates
      // queries this source directly by its constant id for raw geometry
      // (see the comment block near BUILDINGS_SOURCE_ID/
      // EXPLODED_BUILDINGS_SOURCE_ID above), and `3d-buildings` now
      // paints from EXPLODED_BUILDINGS_SOURCE_ID instead.

      // --- Building-color-bleed fix: client-held, per-polygon GeoJSON
      // source that 3d-buildings actually paints from (see the big
      // comment block near EXPLODED_BUILDINGS_SOURCE_ID above). Starts
      // empty; resolveBuildingCandidates populates it via setData() once
      // the impact point/radii are known, exactly like the impact-zone
      // circle sources below.
      if (!map.getSource(EXPLODED_BUILDINGS_SOURCE_ID)) {
        map.addSource(EXPLODED_BUILDINGS_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      // --- 1. 3D buildings from OpenFreeMap's own OSM building layer ---
      // Task 8c: landmark highlighting used to be a separate overlay
      // layer (a drawn shape sitting on top of the real building,
      // hiding its actual geometry). It's now driven by feature-state
      // directly on THIS layer instead — the 'case' below checks for a
      // 'riskLevel' feature-state key (set via setFeatureState once a
      // landmark's real building feature is found, see
      // tryResolveLandmarkFeatures) and falls through to the original
      // unchanged grayscale height interpolation for every building
      // that isn't a matched landmark. No separate 'landmarks' source/
      // layer exists anymore.

      // --- Building-coverage fix ---
      //
      // The exploded/synthetic overlay below (`3d-buildings`, reading
      // EXPLODED_BUILDINGS_SOURCE_ID) only ever contains whatever
      // resolveBuildingCandidates has explicitly processed. Painting
      // ALL building rendering from that source meant a building not
      // yet swept into the candidate list — or never swept in at all —
      // rendered as literally nothing, not even gray. That's a stronger
      // version of the "buildings disappear" bug than the idle-retry
      // issue already fixed: it doesn't matter how persistent the
      // re-resolution is, a building only ever appears strictly AFTER
      // being explicitly resolved, and any gap in that sweep (a tile
      // that loaded but hasn't been re-scanned yet, an edge case in
      // turf.flatten, etc.) is a permanently invisible building.
      //
      // Fix: a separate BASE layer, `3d-buildings-base`, paints every
      // building directly from the raw vector tile source
      // (BUILDINGS_SOURCE_ID) unconditionally — no feature-state, no
      // dependency on candidate resolution, just the same
      // grayscale-by-height fallback the overlay used to use. This
      // guarantees every real building in view always renders, exactly
      // like before the exploded-source fix existed. It also replaces
      // the old invisible `buildings-tile-loader` layer (opacity 0),
      // since this visible layer already forces BUILDINGS_SOURCE_ID's
      // tiles to be requested/kept in memory.
      //
      // `3d-buildings` (below) stays exactly as the color-bleed fix
      // built it — same exploded source, same per-polygon setFeatureState
      // targeting — but now acts purely as a risk-color OVERLAY drawn on
      // top of this base layer: fully transparent wherever no band is
      // set, and colored only where a real, spatially-correct band is.
      // The two layers never fight over which one is "the" building,
      // because the overlay is invisible except where it has something
      // to add.
      if (!map.getLayer('3d-buildings-base')) {
        map.addLayer(
          {
            id: '3d-buildings-base',
            source: BUILDINGS_SOURCE_ID,
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'render_height'], 8],
                0,
                BUILDING_DEFAULT_GRAY,
                100,
                '#8a8a94',
              ],
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.85,
            },
          },
          labelLayerId,
        );
      }

      // Tile level-of-detail tuning for BUILDINGS_SOURCE_ID, confirmed
      // against MapLibre's own setSourceTileLodParams docs:
      // maxZoomLevelsOnScreen=1 slows the zoom-level decay toward the
      // horizon (keeps building tiles detailed further out at this
      // scene's high pitch/bearing), and tileCountMaxMinRatio=128 raises
      // how many tiles are allowed to load at once at that pitch. Only
      // applied to BUILDINGS_SOURCE_ID (not EXPLODED_BUILDINGS_SOURCE_ID,
      // which is a GeoJSON source this API doesn't apply to) since it's
      // the vector source resolveBuildingCandidates actually pages tiles
      // in from. Guarded with try/catch since this API may not exist on
      // every maplibre-gl version this repo could be pinned to.
      if (typeof map.setSourceTileLodParams === 'function') {
        try {
          map.setSourceTileLodParams(1, 128, BUILDINGS_SOURCE_ID);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[MapLibreView] setSourceTileLodParams failed', err);
        }
      }

      map.addLayer(
        {
          id: '3d-buildings',
          // Building-color-bleed fix: paints from the exploded,
          // per-polygon GeoJSON source (no `source-layer` — GeoJSON
          // sources don't have one) instead of the raw vector tile
          // source, so setFeatureState always targets one spatially-local
          // polygon. See the comment block near EXPLODED_BUILDINGS_SOURCE_ID
          // above for the full rationale.
          source: EXPLODED_BUILDINGS_SOURCE_ID,
          type: 'fill-extrusion',
          minzoom: 14,
                    paint: {
            'fill-extrusion-color': [
              'match',
              ['feature-state', 'riskLevel'],
              'red',
              BUILDING_RISK_HEX.red,
              'yellow',
              BUILDING_RISK_HEX.yellow,
              'green',
              BUILDING_RISK_HEX.green,
              [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'render_height'], 8],
                0,
                BUILDING_DEFAULT_GRAY,
                100,
                '#8a8a94',
              ],
            ],
            'fill-extrusion-color-transition': { duration: TRANSITION_MS },
            'fill-extrusion-height': [
              'case',
              ['==', ['feature-state', 'riskLevel'], 'red'],
              ['max', 40, ['coalesce', ['get', 'render_height'], 8]],
              ['==', ['feature-state', 'riskLevel'], 'yellow'],
              ['max', 20, ['coalesce', ['get', 'render_height'], 8]],
              ['coalesce', ['get', 'render_height'], 8],
            ],
            'fill-extrusion-height-transition': { duration: TRANSITION_MS, delay: 0 },
            'fill-extrusion-base': ['+', ['coalesce', ['get', 'render_min_height'], 0], 0.05],
            'fill-extrusion-opacity': 0.85,
          },
        },
        labelLayerId,
      );

      // --- 2. Impact / blast-radius zones: three concentric rings ---
      // Upgraded from a single fixed-radius circle to three concentric
      // GeoJSON circles matching the new red/yellow/green building
      // bands (research §9 flags this as an open design choice between
      // "three concentric circles" vs. "stay a single outline" and
      // recommends whichever is best-supported — three separate
      // GeoJSON sources, each swapped via setData() exactly like the
      // old single circle was, is directly supported with no new API,
      // so that's what's implemented here). Green (outermost, largest
      // radius) is added FIRST so red/yellow layer on top of it,
      // matching the innermost-wins visual priority used for building
      // classification.
      ['green', 'yellow', 'red'].forEach((band) => {
        const sourceId = `impact-zone-${band}`;
        map.addSource(sourceId, {
          type: 'geojson',
          data: turf.circle([FALLBACK_CENTER.lng, FALLBACK_CENTER.lat], 0.001, { steps: 64, units: 'kilometers' }),
        });
        map.addLayer({
          id: `${sourceId}-fill`,
          source: sourceId,
          type: 'fill-extrusion',
          paint: {
            'fill-extrusion-color': RISK_HEX[band],
            'fill-extrusion-height': band === 'red' ? 18 : band === 'yellow' ? 12 : 6,
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': band === 'red' ? 0.22 : 0.14,
          },
        });
        map.addLayer({
          id: `${sourceId}-outline`,
          source: sourceId,
          type: 'line',
          paint: { 'line-color': RISK_HEX[band], 'line-width': 2, 'line-opacity': 0.6 },
        });
      });

      // --- 3. Evacuation route: static dashed line + animated point ---
      map.addSource('evac-route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
      });
      map.addLayer({
        id: 'evac-route-line',
        source: 'evac-route',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#e4e4e7',
          'line-width': 3,
          'line-dasharray': [0.2, 1.6],
          'line-opacity': 0.85,
        },
      });
      map.addSource('evac-point', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [FALLBACK_CENTER.lng, FALLBACK_CENTER.lat] } },
      });
      map.addLayer({
        id: 'evac-point-circle',
        source: 'evac-point',
        type: 'circle',
        paint: {
          'circle-radius': 7,
          'circle-color': '#5eead4',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0A0A0B',
        },
      });

      loadedRef.current = true;
      applyScenarioActivation(scenario);
      applyLandmarkRisk(scenario);
      // Task 8f FIX D: idle "surveillance drift" camera rotation has
      // been removed entirely per explicit request — the camera now
      // only moves in response to user input (drag) or a scenario
      // activation's scripted flyTo. No interval, no drift, no pause/
      // resume bookkeeping needed anymore.
    });

    // Task 8c: resolve each landmark's real 3d-buildings feature ID on
    // every 'idle' event, not just once after 'load'. 'idle' (not
    // 'load' or flyTo's 'moveend') is the right signal specifically
    // because it's the only one of the three that guarantees the
    // current viewport's tiles have actually finished rendering and are
    // queryable — 'load' can fire before that, and 'moveend' only means
    // the camera stopped, not that tiles arrived.
    //
    // Retrying on every idle (rather than a single attempt tied to one
    // moment in the flyTo choreography) is deliberate: this scene's
    // camera starts at a wide establishing view (FALLBACK_CENTER, zoom
    // 15) and then flies to whichever building the active scenario
    // flags as the primary impact site — a location that can be over a
    // kilometer from some of the 5 real landmarks (e.g. India Gate vs.
    // Rashtrapati Bhavan). No single fixed moment reliably has all 5 in
    // view. Checking on every idle means each landmark resolves
    // whenever it actually becomes visible — at the initial wide view,
    // after the flyTo, or after a later manual pan/zoom — instead of
    // depending on exactly when in the choreography we happened to
    // look. tryResolveLandmarkFeatures itself is a no-op past the point
    // where all 5 are already resolved, so this costs nothing once
    // settled.
    map.on('idle', () => {
      tryResolveLandmarkFeatures();
    });

    // Building-disappearance fix: resolveBuildingCandidates used to
    // only be re-run for a fixed 6-tick window right after activation
    // (see the old idleRetriesLeft/onIdleReresolve block, removed from
    // applyScenarioActivation below). setSourceTileLodParams only
    // controls which tiles MapLibre requests — it does nothing if
    // nothing re-scans for them once they arrive. Once those 6 ticks
    // passed, any tile that paged in later (zooming out, dropping pitch
    // below ~60 which reshapes the LOD footprint, or panning) never got
    // exploded into EXPLODED_BUILDINGS_SOURCE_ID, so buildings there
    // simply never existed in that source to begin with — not
    // "disappearing", never having appeared, which read as random
    // depending on exact camera timing during the original window.
    //
    // Fix: a single session-long 'idle' listener, registered once here
    // (not inside applyScenarioActivation, which re-runs per scenario
    // switch and would otherwise stack duplicate listeners), that
    // re-resolves against whatever the CURRENT impact point is via
    // currentImpactCenterRef — never expires, and resolveBuildingCandidates
    // is already idempotent/cheap (a single querySourceFeatures scan
    // that fully replaces buildingCandidatesRef each time), so running
    // it on every idle for the map's whole lifetime is fine.
    map.on('idle', () => {
      resolveBuildingCandidates(currentImpactCenterRef.current);
    });

    return () => {
      if (impactZoneFrameRef.current) cancelAnimationFrame(impactZoneFrameRef.current);
      if (routeFrameRef.current) cancelAnimationFrame(routeFrameRef.current);
      container.removeEventListener('pointerdown', onCustomDragPointerDown);
      window.removeEventListener('pointermove', onCustomDragPointerMove);
      window.removeEventListener('pointerup', onCustomDragPointerUp);
      container.removeEventListener('contextmenu', onContainerContextMenu);
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // Intentionally empty deps — this effect runs exactly once for
    // mount/unmount. `scenario` is read via the ref-guarded functions
    // below on every prop change instead (see the two effects further
    // down), so map init itself never needs to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------
  // Resize the map whenever its container's actual size changes (right
  // rail collapsing/expanding, browser resize, etc.) — MapLibre needs an
  // explicit resize() call, it won't pick this up on its own.
  // -------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // -------------------------------------------------------------------
  // Landmark risk colors + per-building risk zones + evac route target
  // — react to ANY change in `scenario` (timeline scrub, intervention
  // toggle, or scenario switch itself), matching MapView's own
  // "re-render on every merged state" behavior. This does NOT re-fly
  // the camera or re-resolve the building candidate set — see the
  // effect below for that, which only fires on scenario.id. Scrubbing
  // the timeline re-animates the risk zones toward whatever radii the
  // new keyframe/state specifies (growing OR shrinking, per
  // animateRiskZones' lerp-from-lastRadiiRef behavior) without
  // re-querying the building source or re-flying the camera.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!loadedRef.current) return;
    applyLandmarkRisk(scenario);
    const primary = findPrimaryImpactBuilding(scenario.baseline);
    const impactCenter = scenario.baseline?.impactPoint
      || (primary ? { lat: primary.lat, lng: primary.lng } : FALLBACK_CENTER);
    // BUGFIX: resolveActiveRadii reads redRadiusKm/yellowRadiusKm/
    // greenRadiusKm/impactPoint directly off whatever object it's
    // given. Those fields live on the MERGED keyframe state
    // (scenario.baseline, per mergeKeyframe.js's field passthrough —
    // CommandShell spreads the merged state into mapViewScenario.baseline),
    // not on the outer scenario wrapper ({id, baseline, timeline, ...}).
    // Passing `scenario` here meant hasExplicitRadii was always false,
    // so every keyframe scrub silently fell back to the same fixed
    // default radii/point instead of the keyframe's actual values —
    // this is why scrubbing to T+5/T+10/etc. visibly did nothing.
    animateRiskZones(scenario.baseline, impactCenter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  // -------------------------------------------------------------------
  // Scenario ACTIVATION — camera fly-in + building-candidate
  // resolution + impact-zone growth + one-shot evac route animation.
  // Keyed on scenario.id specifically (not the whole scenario object)
  // so scrubbing the timeline or toggling an intervention never
  // re-triggers the cinematic entrance or re-queries the building
  // source, only an actual scenario switch does. resetAllBuildingRisk
  // runs first so a building colored by the PREVIOUS scenario doesn't
  // stay stuck colored after switching (checklist item 6 — "scenario
  // resets" reset trigger).
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!loadedRef.current) return;
    resetAllBuildingRisk();
    applyScenarioActivation(scenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario.id]);

  // -------------------------------------------------------------------
  // Imperative helpers (closures over refs, called from the effects
  // above). Kept as plain functions rather than useCallback since they
  // don't need to be referentially stable for any dependency array.
  // -------------------------------------------------------------------

  /**
   * Attempts to find each not-yet-resolved landmark's real building
   * feature in the 3d-buildings layer via queryRenderedFeatures, and
   * records the match in landmarkFeatureRef. Safe to call repeatedly —
   * already-resolved landmarks are skipped, so calling this on every
   * 'idle' event (see the map.on('idle', ...) listener above) is cheap
   * once all 5 are found. A landmark whose query point never lands on a
   * building in ANY viewport the camera visits during a session (most
   * likely 'kartavya-path', a boulevard, not a building — see
   * delhiLandmarks.js) simply never resolves and never gets highlighted;
   * that's an accepted, documented limitation, not a crash.
   */
  function tryResolveLandmarkFeatures() {
    const map = mapRef.current;
    if (!map) return;
    LANDMARKS.forEach(({ id, lat, lng }) => {
      if (landmarkFeatureRef.current[id]) return; // already resolved
      const point = map.project([lng, lat]);
      const matches = map.queryRenderedFeatures(queryBoxAround(point), { layers: ['3d-buildings'] });
      if (matches.length === 0) return;
      const feature = matches[0];
      const featureTarget = { source: feature.source, sourceLayer: feature.sourceLayer, id: feature.id };
      landmarkFeatureRef.current[id] = featureTarget;
      // If a risk level was already assigned before this landmark
      // resolved (e.g. applyLandmarkRisk ran while the camera hadn't
      // reached it yet), apply it now instead of waiting for the next
      // scenario/timeline change to push it again.
      const pendingRisk = currentRiskByIdRef.current[id];
      if (pendingRisk) {
        map.setFeatureState(featureTarget, { riskLevel: pendingRisk });
      }
    });
  }

  /**
   * Pushes each landmark's current riskLevel onto its real building
   * feature via setFeatureState (Task 8c — see the 3d-buildings paint
   * expression above for how 'riskLevel' feature-state gets rendered).
   * Landmarks not yet resolved (see tryResolveLandmarkFeatures) simply
   * have their desired level cached in currentRiskByIdRef and get it
   * applied retroactively the moment they do resolve — nothing here
   * needs to wait for that to happen. No explicit removeFeatureState
   * step is needed on scenario switch: MapLibreView only ever mounts
   * for the security-attack scenario (see CommandShell's conditional
   * bridge), so switching to any other scenario unmounts this whole
   * component and tears the map down via the init effect's cleanup
   * (map.remove()) — there's no "stay mounted, reset state" case here
   * the way MapView's own scenario-switch reset (Task 4/8) has to
   * handle for its sibling scenarios.
   */
  function applyLandmarkRisk(currentScenario) {
    const map = mapRef.current;
    if (!map) return;
    const riskById = deriveLandmarkRisk(currentScenario.baseline);
    currentRiskByIdRef.current = riskById;
    LANDMARK_IDS.forEach((id) => {
      const featureTarget = landmarkFeatureRef.current[id];
      if (!featureTarget) return; // will be applied once resolved, see above
      map.setFeatureState(featureTarget, { riskLevel: riskById[id] || 'green' });
    });
  }

  function applyScenarioActivation(currentScenario) {
    const map = mapRef.current;
    if (!map) return;

    // Prefer the scenario/keyframe's own explicit impactPoint (the same
    // field resolveActiveRadii reads for the circles — see that
    // function's priority order) so the camera flies to, and building
    // candidates are measured from, the exact same point the red/
    // yellow/green zones are centered on. Only fall back to the
    // highest-severity-building heuristic when a scenario doesn't
    // define impactPoint at all (older/malformed scenario objects).
    const primary = findPrimaryImpactBuilding(currentScenario.baseline);
    const impactCenter = currentScenario.baseline?.impactPoint
      || (primary ? { lat: primary.lat, lng: primary.lng } : FALLBACK_CENTER);
    // Building-disappearance fix: keep the session-long 'idle' listener
    // (registered once in map.on('load', ...)) pointed at whichever
    // impact point is currently active, since that listener outlives
    // any single activation and closes over this ref, not a local
    // variable.
    currentImpactCenterRef.current = impactCenter;

    // Cinematic camera move into the impact zone.
    map.flyTo({
      center: [impactCenter.lng, impactCenter.lat],
      zoom: 16.5,
      pitch: 60,
      bearing: 20,
      speed: 0.8,
      curve: 1.4,
      essential: true,
    });

    // Research §1: don't start touching setFeatureState / querying
    // buildings until the buildings source has actually finished
    // loading — guards the documented "first setFeatureState call for a
    // session throws" race condition. isSourceLoaded is checked
    // immediately; if it's not ready yet, we retry on 'idle' (which
    // this component already listens to for landmark resolution) via
    // a one-shot flag rather than polling on a timer.
    // Research §1/§5: don't query the buildings source for candidates
    // until it has tiles loaded AROUND THE IMPACT POINT specifically —
    // isSourceLoaded() can be true here yet still only reflect tiles
    // near the wide establishing view (FALLBACK_CENTER), since the
    // flyTo above hasn't landed yet. querySourceFeatures is scoped to
    // whatever tiles happen to be in memory (research §5), so querying
    // immediately after flyTo starts (rather than after it settles) was
    // silently returning zero candidates near the impact point — no
    // buildings ever got colored. Waiting for 'idle' AFTER flyTo (which
    // only fires once camera movement AND tile loading for the new
    // viewport have both settled) guarantees the impact-point tiles are
    // actually resolvable. moveend fires on camera stop; idle fires
    // strictly after that once tiles are in, so idle is the correct
    // signal here, not moveend.
    const beginBuildingRiskEngine = () => {
      resolveBuildingCandidates(impactCenter);
      animateRiskZones(currentScenario.baseline, impactCenter);
    };
    if (map.isSourceLoaded(BUILDINGS_SOURCE_ID)) {
      beginBuildingRiskEngine();
    } else {
      const onIdleStart = () => {
        if (!map.isSourceLoaded(BUILDINGS_SOURCE_ID)) return;
        map.off('idle', onIdleStart);
        beginBuildingRiskEngine();
      };
      map.on('idle', onIdleStart);
    }
    // Beyond the initial isSourceLoaded check above, ongoing
    // re-resolution is handled by the session-long 'idle' listener
    // registered once in map.on('load', ...) (see the
    // building-disappearance fix comment there) — it re-runs
    // resolveBuildingCandidates against currentImpactCenterRef.current
    // for the map's whole lifetime, correctly picking up tiles that page
    // in later from zooming, panning, or pitch changes, rather than
    // only during a fixed number of ticks right after each activation.
    animateEvacRoute(currentScenario.baseline, impactCenter);
  }

  /**
   * Research §5/§9: enumerates every candidate building once (not per
   * frame) via querySourceFeatures (NOT queryRenderedFeatures — the
   * growing radius must be able to reach buildings currently outside
   * the viewport, which queryRenderedFeatures structurally cannot see).
   * Deduplicates by the promoted id (osm_id) since tile-boundary
   * splitting can return the same building's geometry more than once
   * (research §5). For each unique candidate, computes a representative
   * point via turf.pointOnFeature (research §6 — safer than
   * turf.centroid for non-convex/L-shaped real building footprints,
   * since a centroid can land outside the polygon) and precomputes its
   * distance from the impact point once, in kilometers (matching the
   * km units the scenario's radii are authored in).
   *
   * Results are cached in buildingCandidatesRef and reused for every
   * tick of the radius animation, per research §9's "do this once, not
   * every frame" guidance — only each building's band relative to the
   * CURRENT radius changes per tick, not the underlying candidate set
   * or its distances.
   */
  function resolveBuildingCandidates(impactCenter) {
    const map = mapRef.current;
    if (!map) return;

    const runQuery = () => {
      let features;
      try {
        features = map.querySourceFeatures(BUILDINGS_SOURCE_ID, { sourceLayer: 'building' });
      } catch (err) {
        // Research §1: defense-in-depth try/catch around the first
        // querySourceFeatures/setFeatureState calls for a session — a
        // source that hasn't finished loading can throw here rather
        // than returning an empty array, depending on version/timing.
        // eslint-disable-next-line no-console
        console.warn('[MapLibreView] querySourceFeatures failed (source likely still loading), will retry on idle', err);
        buildingCandidatesRef.current = [];
        return;
      }

      // Building-color-bleed fix (see BUILDING_COLOR_BLEED_ROOT_CAUSE.md
      // §5 and the comment block near EXPLODED_BUILDINGS_SOURCE_ID
      // above): a vector-tile "building" feature can legitimately be a
      // merged/multi-part relation covering more than one real-world
      // footprint. We explode every MultiPolygon into individual
      // Polygon features via turf.flatten, give each exploded polygon
      // its own synthetic sequential id, and compute distance PER
      // EXPLODED POLYGON rather than per original feature — this is now
      // spatially correct because each polygon is one real building
      // footprint (or at worst one building part), not a whole relation.
      const seenOriginalIds = new Set();
      const impactPointFeature = turf.point([impactCenter.lng, impactCenter.lat]);
      const candidates = [];
      const explodedFeatures = [];

      features.forEach((feature) => {
        // feature.id here is the vector tile's own native id (no
        // promoteId involved anymore — see the comment block near
        // BUILDINGS_SOURCE_ID above for why). It's only used here to
        // dedupe the SAME original feature seen twice across tile
        // boundaries (research §5) — it's no longer what setFeatureState
        // targets (that's now the synthetic per-polygon id below), so a
        // missing/undefined original id no longer needs to drop the
        // feature entirely, just skip the original-id dedupe check.
        const originalKey = feature.id === undefined || feature.id === null ? null : String(feature.id);
        if (originalKey !== null) {
          if (seenOriginalIds.has(originalKey)) return; // tile-boundary duplication
          seenOriginalIds.add(originalKey);
        }

        let flattened;
        try {
          // turf.flatten splits Multi* geometries into one Feature per
          // part; for an already-single Polygon it just returns that one
          // polygon unchanged, so this is safe to run unconditionally.
          flattened = turf.flatten(feature);
        } catch (err) {
          return; // malformed geometry — skip rather than crash the whole batch
        }

        flattened.features.forEach((polygon, partIndex) => {
          let representativePoint;
          try {
            // Research §6: pointOnFeature over centroid, since a
            // centroid can fall outside a concave/L-shaped footprint.
            // Now computed per exploded polygon (one real building/
            // building-part) instead of per merged relation, which is
            // the actual fix for the color-bleed bug — see §3c/§5.
            representativePoint = turf.pointOnFeature(polygon);
          } catch (err) {
            return;
          }

          // Building-recoloring-never-sticks fix: look up (or assign
          // once, then reuse forever) a STABLE id for this exact
          // building part, keyed by dedupeKey — not a fresh counter
          // value every call. This is what lets setData() preserve this
          // feature's feature-state across every subsequent rebuild.
          const dedupeKey = `${originalKey ?? 'noid'}:${partIndex}`;
          let syntheticId = buildingIdByDedupeKeyRef.current.get(dedupeKey);
          if (syntheticId === undefined) {
            syntheticId = nextSyntheticIdRef.current;
            nextSyntheticIdRef.current += 1;
            buildingIdByDedupeKeyRef.current.set(dedupeKey, syntheticId);
          }
          polygon.id = syntheticId;
          polygon.properties = { ...feature.properties };

          const distanceKm = turf.distance(impactPointFeature, representativePoint, { units: 'kilometers' });
          candidates.push({
            featureTarget: { source: EXPLODED_BUILDINGS_SOURCE_ID, id: syntheticId },
            dedupeKey,
            distanceKm,
          });
          explodedFeatures.push(polygon);
        });
      });

      const explodedSource = map.getSource(EXPLODED_BUILDINGS_SOURCE_ID);
      if (explodedSource) {
        explodedSource.setData({ type: 'FeatureCollection', features: explodedFeatures });
      }

      buildingCandidatesRef.current = candidates;
      // Building-recoloring-never-sticks fix: ids are now STABLE across
      // calls (see buildingIdByDedupeKeyRef above), so MapLibre already
      // preserves feature-state for every building that kept its id —
      // no more blanket reset needed. buildingBandByKeyRef's own
      // per-candidate diffing (band === lastBand → skip) now does
      // exactly the right thing on its own: unchanged buildings are
      // left alone (already correctly colored and already stable across
      // the setData call above), and genuinely new buildings (not yet
      // in buildingBandByKeyRef) get colored for the first time here.
      const activeRadii = currentRadiiRef.current || lastRadiiRef.current;
      if (activeRadii) applyBuildingRiskForRadii(activeRadii);
    };

    if (map.isSourceLoaded(BUILDINGS_SOURCE_ID)) {
      runQuery();
    } else {
      // Research §1: `sourcedata` isn't reliably a single-fire signal —
      // prefer polling isSourceLoaded via the map's own 'idle' event
      // (which this component already subscribes to) as the fallback
      // signal rather than trusting one sourcedata event.
      const onIdleRetry = () => {
        if (map.isSourceLoaded(BUILDINGS_SOURCE_ID)) {
          map.off('idle', onIdleRetry);
          runQuery();
        }
      };
      map.on('idle', onIdleRetry);
    }
  }

  /**
   * Drives BOTH the three concentric impact-zone circles AND the
   * per-building recoloring off a single requestAnimationFrame loop
   * keyed to elapsed wall-clock time (research §9 — "keyed to elapsed
   * time, not frame count, so behavior is consistent across displays
   * with different refresh rates").
   *
   * Radii are interpolated from the scenario's current radii (whatever
   * `resolveActiveRadii` resolves off the merged state CommandShell
   * handed this component — baseline or a timeline keyframe) starting
   * from whatever the PREVIOUS radii were, so scrubbing the timeline
   * forward/backward animates a smooth grow/shrink rather than jumping.
   * On first activation (no previous radii recorded), it eases up from
   * ~0 exactly like the old single-circle animation did.
   */
  function animateRiskZones(currentState, impactCenter) {
    const map = mapRef.current;
    const greenSource = map?.getSource('impact-zone-green');
    const yellowSource = map?.getSource('impact-zone-yellow');
    const redSource = map?.getSource('impact-zone-red');
    if (!greenSource || !yellowSource || !redSource) return;

    const target = resolveActiveRadii(currentState, impactCenter);
    // BUGFIX: lastRadiiRef was only ever WRITTEN when a grow animation
    // fully settled (t>=1, ~IMPACT_ZONE_GROW_MS later — see the `else`
    // branch of `step` below). Auto-play advances keyframes every
    // PLAY_INTERVAL_MS (1700ms in TimelineScrubber.jsx), which is
    // SHORTER than IMPACT_ZONE_GROW_MS (1800ms) — so during auto-play,
    // each new keyframe's animateRiskZones call almost always interrupts
    // the previous one before it ever wrote lastRadiiRef, meaning
    // `previous` kept falling back to the stale pre-T+0 default every
    // single step: exactly the "restarts from T+0 each keyframe" symptom.
    // Fix: track the truly-latest RENDERED radii on every tick (not just
    // on completion) in currentRadiiRef, and seed `previous` from that
    // instead of the completion-only lastRadiiRef, so an interrupted
    // animation always resumes from wherever it visually was.
    const previous = currentRadiiRef.current || { point: target.point, red: 0.001, yellow: 0.001, green: 0.001 };

    if (riskZoneFrameRef.current) cancelAnimationFrame(riskZoneFrameRef.current);

    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / IMPACT_ZONE_GROW_MS);
      // Ease-out so growth/shrink decelerates into place rather than
      // stopping/starting abruptly.
      const eased = 1 - (1 - t) ** 2;

      const lerp = (a, b) => a + (b - a) * eased;
      const currentRadii = {
        point: target.point,
        red: Math.max(0.001, lerp(previous.red, target.red)),
        yellow: Math.max(0.001, lerp(previous.yellow, target.yellow)),
        green: Math.max(0.001, lerp(previous.green, target.green)),
      };

      const circleOpts = { steps: 64, units: 'kilometers' };
      greenSource.setData(turf.circle([currentRadii.point.lng, currentRadii.point.lat], currentRadii.green, circleOpts));
      yellowSource.setData(turf.circle([currentRadii.point.lng, currentRadii.point.lat], currentRadii.yellow, circleOpts));
      redSource.setData(turf.circle([currentRadii.point.lng, currentRadii.point.lat], currentRadii.red, circleOpts));

      applyBuildingRiskForRadii(currentRadii);

      // Written every tick (not just on completion) — this is what
      // lets an interrupted animation resume smoothly instead of
      // snapping back to a stale pre-activation default. See the
      // BUGFIX comment above where `previous` is seeded from this ref.
      currentRadiiRef.current = currentRadii;

      if (t < 1) {
        riskZoneFrameRef.current = requestAnimationFrame(step);
      } else {
        riskZoneFrameRef.current = null;
        lastRadiiRef.current = target;
      }
    };
    riskZoneFrameRef.current = requestAnimationFrame(step);
  }

  /**
   * The per-tick "hot path" (research §7/§9): scans the precomputed
   * buildingCandidatesRef array (built once by resolveBuildingCandidates,
   * NOT rebuilt here) and calls setFeatureState ONLY for buildings whose
   * classified band differs from the last band applied to them. This
   * bounds the number of setFeatureState calls per frame to roughly
   * "buildings near the current radius edge" rather than "every
   * candidate building every tick" — sidestepping the research
   * artifact's flagged-unresolved question of a safe per-frame
   * setFeatureState call-count ceiling (§7/§10.3) rather than needing to
   * answer it directly.
   *
   * A building that leaves every band gets explicitly set to riskLevel
   * 'none' (not removeFeatureState) per research §2/§9 — 'none' is an
   * explicit state value the paint expression's `match` doesn't list,
   * so it falls through to the same gray fallback branch a truly
   * never-set feature would hit, keeping this to a single API call.
   */
  function applyBuildingRiskForRadii(radii) {
    const map = mapRef.current;
    if (!map) return;
    const candidates = buildingCandidatesRef.current;
    if (candidates.length === 0) return;

    candidates.forEach(({ featureTarget, dedupeKey, distanceKm }) => {
      const band = classifyBuildingRisk(distanceKm, radii);
      const lastBand = buildingBandByKeyRef.current[dedupeKey];
      if (band === lastBand) return; // research §7: skip unchanged bands

      try {
        map.setFeatureState(featureTarget, { riskLevel: band });
      } catch (err) {
        // Research §1: defense-in-depth for the documented first-call
        // race condition — known to fail once, then succeed on retry,
        // so we simply let the next tick's re-classification retry it
        // naturally rather than special-casing a retry here.
        // eslint-disable-next-line no-console
        console.warn('[MapLibreView] setFeatureState failed for a building (will retry next tick if band is still changing)', err);
        return;
      }
      buildingBandByKeyRef.current[dedupeKey] = band;
    });
  }

  /**
   * Resets every currently-tracked building back to gray ('none') and
   * clears the band-tracking cache. Called on scenario switch (a brand
   * new scenario.id means a brand new impact point / building set
   * entirely) so a building affected by the PREVIOUS scenario doesn't
   * stay stuck colored after switching — checklist item 6 ("scenario
   * resets" is one of the three explicit reset triggers alongside
   * radius-shrink, which animateRiskZones already handles via its own
   * lerp-toward-smaller-target, and "falls outside all bands on a later
   * keyframe", which applyBuildingRiskForRadii already handles via the
   * classifyBuildingRisk 'none' branch).
   */
  function resetAllBuildingRisk() {
    const map = mapRef.current;
    if (!map) return;
    buildingCandidatesRef.current.forEach(({ featureTarget, dedupeKey }) => {
      if (buildingBandByKeyRef.current[dedupeKey] === 'none' || buildingBandByKeyRef.current[dedupeKey] === undefined) return;
      try {
        map.setFeatureState(featureTarget, { riskLevel: 'none' });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[MapLibreView] setFeatureState failed while resetting a building to gray', err);
      }
    });
    buildingBandByKeyRef.current = {};
    buildingCandidatesRef.current = [];
    lastRadiiRef.current = null;
    currentRadiiRef.current = null;
    // Building-color-bleed fix: also clear the exploded per-polygon
    // source so a scenario switch doesn't leave stale polygons (and
    // their now-orphaned synthetic ids) sitting in it.
    const explodedSource = map.getSource(EXPLODED_BUILDINGS_SOURCE_ID);
    if (explodedSource) {
      explodedSource.setData({ type: 'FeatureCollection', features: [] });
    }
    // Building-recoloring-never-sticks fix: also clear the stable id
    // map so a new scenario starts with a clean id space rather than
    // carrying forward dedupeKey→id mappings from buildings that no
    // longer exist in the (now-emptied) exploded source.
    buildingIdByDedupeKeyRef.current = new Map();
  }

  function animateEvacRoute(baseline, impactCenter) {
    const map = mapRef.current;
    const lineSource = map?.getSource('evac-route');
    const pointSource = map?.getSource('evac-point');
    if (!lineSource || !pointSource) return;

    const shelter = findTargetShelter(baseline);
    if (!shelter) return;

    // Simple 3-point route: impact point -> a midpoint nudged off the
    // straight line (so it reads as "following a street", not a beeline)
    // -> the target shelter. Approximate, per the brief — not a routed
    // path, but plausible at this zoom level.
    const start = [impactCenter.lng, impactCenter.lat];
    const end = [shelter.lng, shelter.lat];
    const mid = [
      (start[0] + end[0]) / 2 + (end[1] - start[1]) * 0.15,
      (start[1] + end[1]) / 2 - (end[0] - start[0]) * 0.15,
    ];
    const route = { type: 'Feature', geometry: { type: 'LineString', coordinates: [start, mid, end] } };
    routeLineRef.current = route;
    lineSource.setData(route);

    const totalLengthKm = turf.length(route, { units: 'kilometers' });
    if (routeFrameRef.current) cancelAnimationFrame(routeFrameRef.current);

    const animStart = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - animStart) / ROUTE_ANIMATE_MS);
      // turf.along throws "coord is required" when distance lands
      // exactly on the line's total length (Turfjs/turf#1802 — known
      // upstream bug in the last-segment overshoot math). Clamp just
      // under 1 for the along() call only, so it never hits the exact
      // endpoint; the loop's own completion check (`t < 1` below) is
      // unaffected and still fires exactly on schedule. Visually
      // indistinguishable at 0.0001.
      const safeT = Math.min(t, 0.9999);
      const distanceKm = totalLengthKm * safeT;
      const point = turf.along(route, distanceKm, { units: 'kilometers' });
      pointSource.setData(point);
      if (t < 1) {
        routeFrameRef.current = requestAnimationFrame(step);
      } else {
        routeFrameRef.current = null;
      }
    };
    routeFrameRef.current = requestAnimationFrame(step);
  }

  return <div ref={containerRef} className="h-full w-full" />;
}