const navItems = ['Overview', 'Risk Graph', 'Causal Chain', 'Timeline'];

export function TopNav() {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-800/80 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-sm font-bold text-accent shadow-[0_0_20px_rgba(94,234,212,0.25)]">
          A
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.32em] text-slate-400">Aegis</p>
          <h1 className="text-lg font-semibold text-slate-50">Command Center</h1>
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-300">
        {navItems.map((item, index) => (
          <button
            key={item}
            type="button"
            className={`rounded-full border px-3 py-2 transition ${
              index === 0
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-500 hover:text-slate-100'
            }`}
          >
            {item}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-3 self-start md:self-auto">
        <div className="rounded-full border border-risks-green/40 bg-risks-green/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-risks-green">
          Stable
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-xs font-medium text-slate-200">
          AS
        </div>
      </div>
    </div>
  );
}
