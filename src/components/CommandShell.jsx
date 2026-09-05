import { systemOverview } from '../data/systemOverview';
import { scenarioPresets } from '../scenarios/scenarioPresets';
import { getRiskClasses } from '../utils/riskStyles';
import { TopNav } from './TopNav';

function Dot({ level }) {
  const { dot } = getRiskClasses(level);
  return <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />;
}

export function CommandShell() {
  return (
    <div className="min-h-screen bg-background text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-5 lg:px-8">
        <header className="rounded-2xl border border-slate-800 bg-slate-950/70 shadow-[0_0_0_1px_rgba(15,23,42,0.8)] backdrop-blur">
          <TopNav />
        </header>

        <main className="mt-4 grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_360px]">
          <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.8)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(94,234,212,0.12),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.4),rgba(2,6,23,0.8))]" />
            <div className="relative flex h-full min-h-[540px] flex-col">
              <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Network overview</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-50">{systemOverview.incident}</h2>
                </div>
                <div className="rounded-full border border-risks-red/40 bg-risks-red/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-risks-red">
                  High risk signal
                </div>
              </div>

              <div className="relative mt-4 flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-[#08111d]">
                <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:36px_36px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(94,234,212,0.08),transparent_35%)]" />

                <div className="absolute left-7 top-10 h-20 w-20 rounded-full border border-accent/40 bg-accent/10 blur-xl" />
                <div className="absolute right-16 top-20 h-24 w-24 rounded-full border border-risks-red/30 bg-risks-red/10 blur-xl" />
                <div className="absolute bottom-14 left-1/3 h-20 w-20 rounded-full border border-risks-yellow/30 bg-risks-yellow/10 blur-xl" />

                <svg viewBox="0 0 900 540" className="relative h-full w-full">
                  <path d="M70 320 C210 250, 250 210, 340 240 S520 320, 650 270 S770 180, 830 210" fill="none" stroke="rgba(94,234,212,0.75)" strokeWidth="2.5" strokeDasharray="12 12" />
                  <path d="M120 145 C260 120, 300 160, 360 190 S500 260, 590 250 S720 120, 830 150" fill="none" stroke="rgba(248,113,113,0.65)" strokeWidth="2.5" strokeDasharray="10 10" />
                  <path d="M180 420 C270 390, 320 330, 400 350 S560 480, 660 415 S770 310, 870 330" fill="none" stroke="rgba(250,204,21,0.6)" strokeWidth="2.5" strokeDasharray="8 10" />
                  <circle cx="323" cy="238" r="12" fill="rgba(14,165,233,0.2)" stroke="rgba(94,234,212,0.9)" strokeWidth="2" />
                  <circle cx="590" cy="248" r="14" fill="rgba(239,68,68,0.2)" stroke="rgba(248,113,113,0.9)" strokeWidth="2" />
                  <circle cx="752" cy="298" r="11" fill="rgba(251,146,60,0.2)" stroke="rgba(251,146,60,0.9)" strokeWidth="2" />
                  <circle cx="835" cy="210" r="9" fill="rgba(34,197,94,0.2)" stroke="rgba(34,197,94,0.9)" strokeWidth="2" />
                </svg>

                <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/75 px-3 py-2 text-[10px] uppercase tracking-[0.26em] text-slate-300">
                  <span className="inline-block h-2 w-2 rounded-full bg-risks-red" />
                  Northern corridor
                </div>

                <div className="absolute bottom-6 left-6 rounded-2xl border border-slate-700 bg-slate-950/80 p-3 backdrop-blur-sm">
                  <p className="text-[10px] uppercase tracking-[0.26em] text-slate-400">Live status</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-3xl font-semibold text-slate-50">82</span>
                    <span className="text-sm text-slate-300">pressure index</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.8)]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Causal breakdown</p>
                <span className="text-xs text-slate-300">4 nodes</span>
              </div>

              <div className="mt-4 space-y-3">
                {systemOverview.causalBreakdown.map((item) => {
                  const { pill } = getRiskClasses(item.risk);
                  return (
                    <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                          <Dot level={item.risk} />
                          {item.title}
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${pill}`}>
                          {item.risk}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Comparison</p>
              <div className="mt-4 space-y-3">
                {systemOverview.comparison.map((item, index) => (
                  <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-risks-green' : index === 1 ? 'bg-risks-red' : 'bg-risks-yellow'}`} />
                      <span className="text-sm text-slate-300">{item.label}</span>
                    </div>
                    <span className="font-mono text-sm text-slate-50">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </main>

        <footer className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.8)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <div className="flex min-w-[200px] flex-1 flex-col gap-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-slate-400">
                <span>Timeline scrubber</span>
                <span>06:40 UTC</span>
              </div>
              <div className="relative h-3 rounded-full border border-slate-700 bg-slate-900">
                <div className="absolute inset-y-1 left-2 right-2 rounded-full bg-gradient-to-r from-accent/60 via-risks-yellow/60 to-risks-red/80" />
                <div className="absolute left-[62%] top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-slate-900 bg-accent shadow-[0_0_16px_rgba(94,234,212,0.7)]" />
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2 xl:max-w-[420px]">
              <label htmlFor="scenario" className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Scenario input
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3">
                <span className="text-accent">›</span>
                <input
                  id="scenario"
                  type="text"
                  value="Cross-border clearance delay on western dock"
                  readOnly
                  className="w-full border-0 bg-transparent font-mono text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              {scenarioPresets.map((scenario) => (
                <button
                  key={scenario.name}
                  type="button"
                  className={`rounded-full border px-3 py-2 text-[10px] uppercase tracking-[0.24em] ${getRiskClasses(scenario.severity).pill}`}
                >
                  {scenario.name}
                </button>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
