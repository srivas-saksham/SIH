import { RISK_HEX } from './MapView';
import { ESI_BANDS } from './maplibre/populationPillars';

/**
 * Small map-overlay summary for the Tehri flood population-entrapment
 * pillars (Task N+5). Pure UI chrome on top of the MapLibre canvas —
 * same absolutely-positioned, hairline/backdrop-blur treatment as
 * MapToolbar / KeyframeBlurb. Everything shown is derived by
 * CommandShell from the SAME computePillarStates() the map layers use,
 * so panel and map can't disagree. All figures are illustrative.
 *
 * @param {{totalTrapped:number, cutOffCount:number, areaCount:number,
 *   tallestTrapped:number, worst:Array}} summary  summarizeStates() output
 * @param {number[]} series   total trapped at each keyframe (sparkline)
 * @param {number} currentIndex
 * @param {string[]} labels   keyframe labels, same order as `series`
 */
export function PopulationPanel({ summary, series, currentIndex, labels }) {
  const max = Math.max(...series, 1);
  const W = 196;
  const H = 34;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * (W - 8) + 4, H - 4 - (v / max) * (H - 8)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [cx, cy] = pts[Math.max(0, Math.min(currentIndex, pts.length - 1))];
  const legend = [
    ['green', `< ${ESI_BANDS.yellow}`],
    ['yellow', `${ESI_BANDS.yellow}\u2013${ESI_BANDS.orange - 1}`],
    ['orange', `${ESI_BANDS.orange}\u2013${ESI_BANDS.red - 1}`],
    ['red', `\u2265 ${ESI_BANDS.red}`],
  ];

  return (
    <div className="pointer-events-none absolute right-12 top-3 z-30 w-[224px]">
      <div className="pointer-events-auto rounded-lg border border-hairline bg-canvas/85 px-3 py-2 backdrop-blur-sm">
        <p className="text-[10px] uppercase tracking-[0.24em] text-accent/80">
          Population trapped {labels[currentIndex] ? `\u00b7 ${labels[currentIndex]}` : ''}
        </p>
        <p className="mt-1 font-mono text-xl text-ink">{summary.totalTrapped.toLocaleString('en-US')}</p>
        <p className="text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          {summary.cutOffCount} cut-off area{summary.cutOffCount === 1 ? '' : 's'} {'\u00b7'} {summary.areaCount} affected
        </p>

        {summary.worst.length > 0 && (
          <ul className="mt-2 space-y-1">
            {summary.worst.slice(0, 3).map((s, i) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex min-w-0 items-center gap-1.5 text-slate-200">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.hex }} />
                  <span className="truncate">{i + 1}. {s.name}</span>
                </span>
                <span className="shrink-0 font-mono text-ink-dim">{s.trapped.toLocaleString('en-US')}</span>
              </li>
            ))}
          </ul>
        )}

        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mt-2" role="img" aria-label="Total trapped per keyframe">
          <polyline points={line} fill="none" stroke="#5eead4" strokeWidth="1.5" strokeLinejoin="round" opacity="0.8" />
          <circle cx={cx} cy={cy} r="3.2" fill="#5eead4" />
        </svg>

        <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
          {legend.map(([band, range]) => (
            <span key={band} className="flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-ink-dim">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RISK_HEX[band] }} />
              {range}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[9px] leading-snug text-ink-faint">
          Bar height = people trapped{summary.tallestTrapped > 0 ? `; tallest = ${summary.tallestTrapped.toLocaleString('en-US')}` : ''}. Colour = severity index (ESI). Illustrative figures.
        </p>
      </div>
    </div>
  );
}

export default PopulationPanel;