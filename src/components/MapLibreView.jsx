import { useEffect, useRef } from 'react';
// maplibre-gl v6's ESM build has no default export (named exports only),
// so this uses a namespace import and refers to maplibregl.Map /
// maplibregl.NavigationControl below.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { RISK_HEX } from './MapView';
import { LANDMARK_IDS, createLandmarksGeoJSON, withRiskLevels } from '../data/delhiLandmarks';

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

const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';

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

const IMPACT_ZONE_RADIUS_KM = 0.3; // ~300m "affected area" radius
const IMPACT_ZONE_GROW_MS = 1800;
const ROUTE_ANIMATE_MS = 2200;

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

/** Finds the style's first symbol layer, so new layers can be inserted below labels. */
function findLabelLayerId(map) {
  const layers = map.getStyle()?.layers || [];
  const symbolLayer = layers.find((layer) => layer.type === 'symbol');
  return symbolLayer?.id;
}

export function MapLibreView({ scenario }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false);

  // Animation bookkeeping, kept in refs since none of it should trigger
  // React re-renders — it's imperative canvas/map state.
  const impactZoneFrameRef = useRef(null);
  const routeFrameRef = useRef(null);
  const idleRotateIntervalRef = useRef(null);
  const idleRotatePausedRef = useRef(false);
  const routeLineRef = useRef(null); // current evac route GeoJSON LineString

  // -------------------------------------------------------------------
  // Map init — runs once on mount.
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
      canvasContextAttributes: { antialias: true },
      attributionControl: true,
    });
    mapRef.current = map;
    // TEMPORARY debug hook — remove once the blank-map issue is
    // resolved. Lets us inspect live map/container/canvas state from
    // the browser console instead of guessing blind.
    window.__debugMap = map;

    // TEMPORARY diagnostic logging — MapLibre's `loaded()` is stuck
    // `false` with no visible console error, so we're logging its
    // internal lifecycle events directly to find where it's actually
    // stalling. Remove once resolved.
    map.on('error', (e) => {
      // eslint-disable-next-line no-console
      console.error('[MapLibre error event]', e.error || e);
    });
    map.on('styledata', () => console.log('[MapLibre] styledata', map.isStyleLoaded()));
    map.on('sourcedata', (e) => console.log('[MapLibre] sourcedata', e.sourceId, e.isSourceLoaded, e.dataType));
    map.on('data', (e) => console.log('[MapLibre] data', e.dataType));
    map.on('idle', () => console.log('[MapLibre] idle (loaded():', map.loaded(), ')'));

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

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

      // --- 1. 3D buildings from OpenFreeMap's own OSM building layer ---
      map.addLayer(
        {
          id: '3d-buildings',
          source: 'openmaptiles',
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'render_height'], 8],
              0,
              '#3a3a3f',
              100,
              '#5a5a60',
            ],
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              16,
              ['coalesce', ['get', 'render_height'], 8],
            ],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.85,
          },
        },
        labelLayerId,
      );

      // --- 2. Our own controlled landmark footprints, on top ---
      map.addSource('landmarks', { type: 'geojson', data: createLandmarksGeoJSON() });
      map.addLayer({
        id: 'landmarks-extrusion',
        source: 'landmarks',
        type: 'fill-extrusion',
        paint: {
          'fill-extrusion-color': [
            'match',
            ['get', 'riskLevel'],
            'green',
            RISK_HEX.green,
            'yellow',
            RISK_HEX.yellow,
            'orange',
            RISK_HEX.orange,
            'red',
            RISK_HEX.red,
            RISK_HEX.green,
          ],
          'fill-extrusion-color-transition': { duration: TRANSITION_MS },
          'fill-extrusion-height': ['get', 'baseHeight'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.95,
        },
      });

      // --- 3. Impact / blast-radius zone (grown in on activation) ---
      map.addSource('impact-zone', {
        type: 'geojson',
        data: turf.circle([FALLBACK_CENTER.lng, FALLBACK_CENTER.lat], 0.001, { steps: 64, units: 'kilometers' }),
      });
      map.addLayer({
        id: 'impact-zone-fill',
        source: 'impact-zone',
        type: 'fill-extrusion',
        paint: {
          'fill-extrusion-color': RISK_HEX.red,
          'fill-extrusion-height': 18,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.22,
        },
      });
      map.addLayer({
        id: 'impact-zone-outline',
        source: 'impact-zone',
        type: 'line',
        paint: { 'line-color': RISK_HEX.red, 'line-width': 2, 'line-opacity': 0.6 },
      });

      // --- 4. Evacuation route: static dashed line + animated point ---
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
      startIdleRotation();
    });

    // Pause the idle "surveillance drift" rotation while the user is
    // actively dragging/zooming, resume once they let go — a fixed slow
    // rotation that fights user input would feel broken, not cinematic.
    map.on('dragstart', () => {
      idleRotatePausedRef.current = true;
    });
    map.on('dragend', () => {
      idleRotatePausedRef.current = false;
    });

    return () => {
      if (impactZoneFrameRef.current) cancelAnimationFrame(impactZoneFrameRef.current);
      if (routeFrameRef.current) cancelAnimationFrame(routeFrameRef.current);
      if (idleRotateIntervalRef.current) clearInterval(idleRotateIntervalRef.current);
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
  // Landmark risk colors + evac route target — react to ANY change in
  // `scenario` (timeline scrub, intervention toggle, or scenario switch
  // itself), matching MapView's own "re-render on every merged state"
  // behavior. This does NOT re-fly the camera or regrow the impact zone
  // — see the effect below for that, which only fires on scenario.id.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!loadedRef.current) return;
    applyLandmarkRisk(scenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  // -------------------------------------------------------------------
  // Scenario ACTIVATION — camera fly-in + impact-zone growth + one-shot
  // evac route animation. Keyed on scenario.id specifically (not the
  // whole scenario object) so scrubbing the timeline or toggling an
  // intervention never re-triggers the cinematic entrance, only an
  // actual scenario switch does.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!loadedRef.current) return;
    applyScenarioActivation(scenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario.id]);

  // -------------------------------------------------------------------
  // Imperative helpers (closures over refs, called from the effects
  // above). Kept as plain functions rather than useCallback since they
  // don't need to be referentially stable for any dependency array.
  // -------------------------------------------------------------------

  function applyLandmarkRisk(currentScenario) {
    const map = mapRef.current;
    const source = map?.getSource('landmarks');
    if (!source) return;
    const riskById = deriveLandmarkRisk(currentScenario.baseline);
    source.setData(withRiskLevels(riskById));
  }

  function applyScenarioActivation(currentScenario) {
    const map = mapRef.current;
    if (!map) return;

    const primary = findPrimaryImpactBuilding(currentScenario.baseline);
    const impactCenter = primary
      ? { lat: primary.lat, lng: primary.lng }
      : FALLBACK_CENTER;

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

    growImpactZone(impactCenter);
    animateEvacRoute(currentScenario.baseline, impactCenter);
  }

  function growImpactZone(center) {
    const map = mapRef.current;
    const source = map?.getSource('impact-zone');
    if (!source) return;

    if (impactZoneFrameRef.current) cancelAnimationFrame(impactZoneFrameRef.current);

    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / IMPACT_ZONE_GROW_MS);
      // Ease-out so the growth decelerates into place rather than
      // stopping abruptly at full radius.
      const eased = 1 - (1 - t) ** 2;
      const radiusKm = Math.max(0.001, IMPACT_ZONE_RADIUS_KM * eased);
      const circle = turf.circle([center.lng, center.lat], radiusKm, { steps: 64, units: 'kilometers' });
      source.setData(circle);
      if (t < 1) {
        impactZoneFrameRef.current = requestAnimationFrame(step);
      } else {
        impactZoneFrameRef.current = null;
      }
    };
    impactZoneFrameRef.current = requestAnimationFrame(step);
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
      const distanceKm = totalLengthKm * t;
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

  /**
   * Subtle continuous bearing drift for a "live surveillance" feel when
   * nothing else is animating. Deliberately cheap: a single setInterval
   * nudging bearing by a fraction of a degree, paused during user drag
   * (see the dragstart/dragend handlers above) and left running through
   * flyTo/impact/route animations since MapLibre's own camera and paint
   * updates don't conflict with a plain setBearing call. If this turns
   * out to cost more than expected on lower-end demo hardware, the whole
   * effect is isolated to this one function and safe to delete.
   */
  function startIdleRotation() {
    const map = mapRef.current;
    if (!map) return;
    if (idleRotateIntervalRef.current) clearInterval(idleRotateIntervalRef.current);
    idleRotateIntervalRef.current = setInterval(() => {
      if (idleRotatePausedRef.current) return;
      map.setBearing(map.getBearing() + 0.03);
    }, 50);
  }

  return <div ref={containerRef} className="h-full w-full" />;
}