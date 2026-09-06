import { useEffect, useMemo, useRef, useState } from 'react';
import defaultScenario from '../scenarios/security-attack.json';
import { getRiskClasses } from '../utils/riskStyles';
import { computeBounds, createProjector } from '../utils/geoProjection';

// Duration for state-to-state visual transitions (building height/color,
// road status, shelter strain) as the timeline scrubber moves between
// keyframes. Matches the 300-500ms range from Task 5's spec.
const TRANSITION_MS = 400;

/**
 * Tracks the previous value of `value` and reports it as a fading
 * "ghost" for one transition cycle whenever it changes. Used for SVG
 * properties that can't be smoothly CSS-transitioned directly (e.g. a
 * discrete strokeDasharray swap on road status change) — the ghost
 * renders the OLD look on top of the new one and fades out, producing a
 * quick crossfade instead of an instant pop.
 */
function useGhostOnChange(value, duration = TRANSITION_MS) {
  const [ghost, setGhost] = useState(null);
  const [fading, setFading] = useState(false);
  const lastRef = useRef(value);

  useEffect(() => {
    if (lastRef.current === value) return undefined;

    const previous = lastRef.current;
    lastRef.current = value;
    setGhost(previous);
    setFading(false);

    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setFading(true));
    });
    const timeoutId = window.setTimeout(() => {
      setGhost(null);
      setFading(false);
    }, duration + 80);

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      window.clearTimeout(timeoutId);
    };
  }, [value, duration]);

  return { ghost, fading };
}

// Hex values mirror tailwind.config.js `risks` palette. Kept as plain hex
// here (rather than Tailwind classes) because SVG fill/stroke attributes
// need literal color values, not utility classes.
// Exported (Task 8b) so MapLibreView can reuse this exact palette for its
// landmark fill-extrusion-color match expression instead of redefining
// the same hex values a second time.
export const RISK_HEX = {
  green: '#22c55e',
  yellow: '#facc15',
  orange: '#f97316',
  red: '#ef4444',
};

// Taller extrusion = more severe risk, so the skyline visibly "spikes" in
// hit zones even at a glance.
const RISK_HEIGHT = {
  green: 10,
  yellow: 14,
  orange: 19,
  red: 25,
};

// Buildings are drawn once at this reference height (matches the tallest
// risk level, 'red') so a height change can be animated with a CSS
// `transform: scaleY()` on a wrapper group instead of recomputing SVG
// polygon points every frame — `points` isn't CSS-transitionable, but
// `transform` is.
const UNIT_HEIGHT = 25;

const ROAD_STATUS_HEX = {
  clear: '#22c55e',
  congested: '#f97316',
  blocked: '#ef4444',
};

const ROAD_STATUS_DASH = {
  clear: 'none',
  congested: '10 6',
  blocked: '4 6',
};

const VIEW_WIDTH = 900;
const VIEW_HEIGHT = 540;

/** Darkens a #rrggbb hex color by a 0-1 fraction, for fake-3D shading. */
function shade(hex, fraction) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - fraction)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - fraction)));
  const b = Math.max(0, Math.floor((num & 0xff) * (1 - fraction)));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Lightens a #rrggbb hex color toward white by a 0-1 fraction. */
function tint(hex, fraction) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.floor(((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * fraction));
  const g = Math.min(255, Math.floor(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * fraction));
  const b = Math.min(255, Math.floor((num & 0xff) + (255 - (num & 0xff)) * fraction));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Renders a single building as a small extruded "isometric-ish" block
 * (top face + two shaded side faces) instead of a flat dot, so the map
 * reads as a 3D digital twin rather than a plain 2D scatter plot.
 */
function IsoBuilding({ x, y, riskLevel, id, onHover, onLeave }) {
  const baseColor = RISK_HEX[riskLevel] || RISK_HEX.green;
  const targetHeight = RISK_HEIGHT[riskLevel] || RISK_HEIGHT.green;
  const heightRatio = targetHeight / UNIT_HEIGHT;
  const s = 9; // half-width of the block footprint

  // Shape is drawn once at the fixed UNIT_HEIGHT, in local coordinates
  // with the ground point at (0, 0) and the block extending upward
  // (negative y). The outer <g> below positions it at (x, y) and the
  // inner <g> scales it vertically to the actual risk-level height —
  // that scale is what animates on riskLevel change.
  const top = [0, -UNIT_HEIGHT - s];
  const right = [s, -UNIT_HEIGHT];
  const bottom = [0, -UNIT_HEIGHT + s];
  const left = [-s, -UNIT_HEIGHT];
  const groundLeft = [-s, 0];
  const groundRight = [s, 0];
  const groundBottom = [0, s];

  const topFace = [top, right, bottom, left].map((p) => p.join(',')).join(' ');
  const leftFace = [left, bottom, groundBottom, groundLeft].map((p) => p.join(',')).join(' ');
  const rightFace = [bottom, right, groundRight, groundBottom].map((p) => p.join(',')).join(' ');

  const faceTransition = { transition: `fill ${TRANSITION_MS}ms ease, stroke ${TRANSITION_MS}ms ease` };

  return (
    <g
      onMouseEnter={() => onHover({ type: 'building', id, riskLevel, x, y: y - targetHeight - s })}
      onMouseLeave={onLeave}
      className="cursor-pointer"
      style={{ transform: `translate(${x}px, ${y}px)`, transition: `transform ${TRANSITION_MS}ms ease` }}
    >
      <g style={{ transform: `scaleY(${heightRatio})`, transformOrigin: '0px 0px', transition: `transform ${TRANSITION_MS}ms ease` }}>
        <polygon points={leftFace} fill={shade(baseColor, 0.35)} stroke="rgba(2,6,23,0.6)" strokeWidth="0.5" style={faceTransition} />
        <polygon points={rightFace} fill={shade(baseColor, 0.15)} stroke="rgba(2,6,23,0.6)" strokeWidth="0.5" style={faceTransition} />
        <polygon points={topFace} fill={tint(baseColor, 0.15)} stroke="rgba(2,6,23,0.6)" strokeWidth="0.5" style={faceTransition} />
      </g>
    </g>
  );
}

/**
 * Renders a shelter as a distinct pin-style marker (not just a dot) so
 * it's visually unambiguous versus a building block.
 */
function ShelterMarker({ x, y, shelter, onHover, onLeave }) {
  const occupancyRatio = shelter.capacity > 0 ? shelter.occupancy / shelter.capacity : 0;
  const strain = occupancyRatio >= 0.9 ? RISK_HEX.red : occupancyRatio >= 0.7 ? RISK_HEX.orange : '#5eead4';

  return (
    <g
      onMouseEnter={() => onHover({ type: 'shelter', id: shelter.id, shelter, x, y: y - 18 })}
      onMouseLeave={onLeave}
      className="cursor-pointer"
    >
      <path
        d={`M ${x} ${y - 16} L ${x + 8} ${y - 4} L ${x + 8} ${y + 10} L ${x - 8} ${y + 10} L ${x - 8} ${y - 4} Z`}
        fill="rgba(15,23,42,0.9)"
        stroke={strain}
        strokeWidth="2"
        style={{ transition: `stroke ${TRANSITION_MS}ms ease` }}
      />
      <path
        d={`M ${x - 6} ${y - 2} L ${x} ${y - 8} L ${x + 6} ${y - 2}`}
        fill="none"
        stroke={strain}
        strokeWidth="1.5"
        style={{ transition: `stroke ${TRANSITION_MS}ms ease` }}
      />
      <rect x={x - 3} y={y + 1} width="6" height="7" fill={strain} opacity="0.85" style={{ transition: `fill ${TRANSITION_MS}ms ease` }} />
    </g>
  );
}

/**
 * Renders a road as a status-colored/dashed polyline. Road coordinates
 * never change between keyframes, only `status` — so color transitions
 * smoothly via plain CSS, but the dash pattern is a discrete swap that
 * CSS can't interpolate. A short-lived "ghost" of the previous status,
 * rendered on top and faded to opacity 0, papers over that pop with a
 * quick crossfade instead.
 */
function RoadLine({ road, points }) {
  const pointsAttr = points.map((p) => p.join(',')).join(' ');
  const { ghost, fading } = useGhostOnChange(road.status);

  return (
    <>
      <polyline
        points={pointsAttr}
        fill="none"
        stroke={ROAD_STATUS_HEX[road.status] || ROAD_STATUS_HEX.clear}
        strokeWidth="3"
        strokeDasharray={ROAD_STATUS_DASH[road.status] || 'none'}
        strokeLinecap="round"
        opacity="0.85"
        style={{ transition: `stroke ${TRANSITION_MS}ms ease` }}
      />
      {ghost && (
        <polyline
          points={pointsAttr}
          fill="none"
          stroke={ROAD_STATUS_HEX[ghost] || ROAD_STATUS_HEX.clear}
          strokeWidth="3"
          strokeDasharray={ROAD_STATUS_DASH[ghost] || 'none'}
          strokeLinecap="round"
          style={{ opacity: fading ? 0 : 0.85, transition: `opacity ${TRANSITION_MS}ms ease` }}
        />
      )}
    </>
  );
}

/**
 * Main digital-twin viewport: a stylized (non-geospatial-library) 2D map
 * with pseudo-3D buildings, status-colored roads, and shelter markers.
 * Renders whichever scenario's baseline state is passed in via the
 * `scenario` prop (see CommandShell.jsx for how the active scenario is
 * chosen — free-text input via the keyword matcher, or a preset chip).
 * Falls back to the security-attack scenario defensively if no scenario
 * prop is supplied at all.
 */
export function MapView({ scenario = defaultScenario }) {
  const [hovered, setHovered] = useState(null);
  const state = scenario.baseline;

  // Clear any hover tooltip left over from the previous scenario — its
  // referenced building/shelter id may not exist in the new one.
  useEffect(() => {
    setHovered(null);
  }, [scenario.id]);

  // Task 7 fix: the projector was previously memoized on `scenario.id`
  // alone, on the assumption that a scenario's building/road/shelter
  // *positions* never change across keyframes (Task 3/5 — only color,
  // status, and occupancy vary over the timeline, so that held). The
  // Task 7 intervention states break that assumption: several scenarios'
  // `intervention.shelters` add a genuinely new shelter at coordinates
  // outside the baseline bounding box (representing "we placed a new
  // resource"). Recomputing bounds only when the point *count* changes
  // (rather than on every render) keeps the timeline-scrub case cheap and
  // stable while still re-fitting the view when intervention introduces a
  // new marker outside the original footprint.
  const boundsSignature = `${scenario.id}:${state.buildings.length}:${state.shelters.length}:${state.roads.length}`;
  const project = useMemo(() => {
    const bounds = computeBounds(state);
    return createProjector(bounds, { width: VIEW_WIDTH, height: VIEW_HEIGHT, padding: 60 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsSignature]);

  const projectedBuildings = state.buildings.map((b) => {
    const [x, y] = project(b.lat, b.lng);
    return { ...b, x, y };
  });

  const projectedShelters = state.shelters.map((s) => {
    const [x, y] = project(s.lat, s.lng);
    return { ...s, x, y };
  });

  const projectedRoads = state.roads.map((r) => ({
    ...r,
    points: r.coords.map(([lat, lng]) => project(lat, lng)),
  }));

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:36px_36px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(94,234,212,0.08),transparent_35%)]" />

      <div className="absolute left-6 top-6 z-10 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/75 px-3 py-2 text-[10px] uppercase tracking-[0.26em] text-slate-300">
        <span className="inline-block h-2 w-2 rounded-full bg-risks-red" />
        {scenario.name}
      </div>

      <div className="absolute bottom-6 left-6 z-10 flex gap-3 rounded-2xl border border-slate-700 bg-slate-950/80 p-3 backdrop-blur-sm">
        {['green', 'yellow', 'orange', 'red'].map((level) => (
          <div key={level} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${getRiskClasses(level).dot}`} />
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{level}</span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="relative h-full w-full">
        {/* Roads, drawn first so buildings/shelters render on top */}
        {projectedRoads.map((road) => (
          <RoadLine key={road.id} road={road} points={road.points} />
        ))}

        {/* Buildings */}
        {projectedBuildings.map((b) => (
          <IsoBuilding
            key={b.id}
            x={b.x}
            y={b.y}
            id={b.id}
            riskLevel={b.riskLevel}
            onHover={setHovered}
            onLeave={() => setHovered(null)}
          />
        ))}

        {/* Shelters */}
        {projectedShelters.map((s) => (
          <ShelterMarker key={s.id} x={s.x} y={s.y} shelter={s} onHover={setHovered} onLeave={() => setHovered(null)} />
        ))}

        {/* Hover tooltip */}
        {hovered && hovered.type === 'building' && (
          <g pointerEvents="none">
            <rect
              x={hovered.x - 34}
              y={hovered.y - 30}
              width="68"
              height="22"
              rx="6"
              fill="rgba(2,6,23,0.92)"
              stroke="rgba(148,163,184,0.4)"
            />
            <text x={hovered.x} y={hovered.y - 15} textAnchor="middle" fontSize="10" fill="#e2e8f0" fontFamily="monospace">
              {hovered.id.toUpperCase()} · {hovered.riskLevel}
            </text>
          </g>
        )}

        {hovered && hovered.type === 'shelter' && (
          <g pointerEvents="none">
            <rect
              x={hovered.x - 56}
              y={hovered.y - 38}
              width="112"
              height="34"
              rx="6"
              fill="rgba(2,6,23,0.92)"
              stroke="rgba(148,163,184,0.4)"
            />
            <text x={hovered.x} y={hovered.y - 24} textAnchor="middle" fontSize="10" fill="#e2e8f0" fontFamily="monospace">
              {hovered.shelter.id.toUpperCase()}
            </text>
            <text x={hovered.x} y={hovered.y - 11} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="monospace">
              {hovered.shelter.occupancy}/{hovered.shelter.capacity} occupied
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export default MapView;