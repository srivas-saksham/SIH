const navItems = ['Overview', 'Risk Graph', 'Causal Chain', 'Timeline'];

export function TopNav() {
  return (
    <div className="flex h-14 flex-wrap items-center justify-between gap-4 px-5 md:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-sm font-bold text-accent">
          A
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.32em] text-ink-dim">Aegis</p>
          <h1 className="text-base font-semibold leading-tight text-ink">Command Center</h1>
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-1 text-xs uppercase tracking-[0.22em] text-ink-dim">
        {navItems.map((item, index) => (
          <button
            key={item}
            type="button"
            className={`rounded-md px-3 py-1.5 transition ${
              index === 0
                ? 'text-accent'
                : 'text-ink-dim hover:bg-surface hover:text-ink'
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
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-surface text-xs font-medium text-ink">
          AS
        </div>
      </div>
    </div>
  );
}