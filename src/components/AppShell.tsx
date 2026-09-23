import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { PeriodSwitcher } from '@/components/PeriodSwitcher';

const links = [
  { to: '/', label: 'Ask PennyWise', end: true, color: 'bg-accent', soft: 'hover:bg-accent-soft' },
  { to: '/transactions', label: 'Spending', end: false, color: 'bg-coral', soft: 'hover:bg-coral-soft' },
  { to: '/budget', label: 'Budget', end: false, color: 'bg-amber', soft: 'hover:bg-amber-soft' },
  { to: '/cards', label: 'Cards', end: false, color: 'bg-navy', soft: 'hover:bg-navy-soft' },
  { to: '/savings', label: 'Savings', end: false, color: 'bg-lime', soft: 'hover:bg-lime-soft' },
  { to: '/analytics', label: 'Analytics', end: false, color: 'bg-sky', soft: 'hover:bg-sky-soft' },
];

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1.5">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              isActive
                ? `${l.color} text-white shadow-soft`
                : `text-muted ${l.soft} hover:text-ink`
            }`
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen text-ink">
      <div className="mx-auto flex min-h-screen max-w-6xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line/80 bg-surface/90 px-3 py-6 backdrop-blur md:flex lg:w-60">
          <div className="mb-6 px-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">PennyWise</p>
            <p className="mt-1 text-xs text-muted">4-week money map</p>
          </div>
          {nav}
          <div className="mt-auto px-1 pt-6">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Period</p>
            <PeriodSwitcher />
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line/80 bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">PennyWise</p>
            </div>
            <div className="flex items-center gap-2">
              <PeriodSwitcher />
              <button
                type="button"
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                onClick={() => setMobileOpen((o) => !o)}
                className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm font-semibold"
              >
                {mobileOpen ? '✕' : '☰'}
              </button>
            </div>
          </header>

          {mobileOpen ? (
            <div className="border-b border-line bg-surface px-3 py-3 md:hidden">{nav}</div>
          ) : null}

          <header className="hidden items-center justify-between gap-4 border-b border-line/60 px-6 py-4 md:flex">
            <p className="text-sm text-muted">Paste · budget · spend · save</p>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
