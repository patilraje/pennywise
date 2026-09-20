import { useStore } from '@/store';
import { periodShortLabel } from '@/utils/periods';

export function PeriodSwitcher() {
  const periods = useStore((s) => s.periods);
  const selectedPeriodId = useStore((s) => s.selectedPeriodId);
  const setSelectedPeriodId = useStore((s) => s.setSelectedPeriodId);
  const ensurePeriodsThrough = useStore((s) => s.ensurePeriodsThrough);

  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const idx = Math.max(
    0,
    sorted.findIndex((p) => p.id === selectedPeriodId),
  );
  const current = sorted[idx];

  const goPrev = () => {
    if (idx > 0) setSelectedPeriodId(sorted[idx - 1].id);
  };

  const goNext = () => {
    if (idx < sorted.length - 1) {
      setSelectedPeriodId(sorted[idx + 1].id);
      return;
    }
    // Extend one more period
    if (current) {
      const nextStart = new Date(current.end + 'T12:00:00');
      nextStart.setDate(nextStart.getDate() + 1);
      const iso = nextStart.toISOString().slice(0, 10);
      ensurePeriodsThrough(iso);
      // after ensure, pick the period containing iso
      const state = useStore.getState();
      const p = state.periods.find((x) => iso >= x.start && iso <= x.end);
      if (p) setSelectedPeriodId(p.id);
    }
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
      <button
        type="button"
        aria-label="Previous period"
        disabled={idx <= 0}
        onClick={goPrev}
        className="rounded-lg px-2 py-1.5 text-sm font-semibold text-muted disabled:opacity-30 hover:text-ink"
      >
        ‹
      </button>
      <span className="min-w-[148px] text-center text-sm font-semibold">
        {current ? periodShortLabel(current) : '—'}
      </span>
      <button
        type="button"
        aria-label="Next period"
        onClick={goNext}
        className="rounded-lg px-2 py-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        ›
      </button>
    </div>
  );
}
