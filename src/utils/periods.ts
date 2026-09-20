import type { PayPeriod } from '../types';

export const DEFAULT_ANCHOR = '2026-08-24';
export const PERIOD_DAYS = 28;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function periodIdFor(start: string, end: string): string {
  return `pp-${start}_${end}`;
}

export function makePeriod(start: string): PayPeriod {
  const end = addDaysIso(start, PERIOD_DAYS - 1);
  return { id: periodIdFor(start, end), start, end };
}

/** Build consecutive 4-week periods from anchor through `throughDate`, plus `extra` periods after. */
export function buildPeriodsFromAnchor(
  anchor = DEFAULT_ANCHOR,
  throughDate = '2026-09-19',
  extra = 3,
): PayPeriod[] {
  const out: PayPeriod[] = [];
  let start = anchor;
  let covered = false;
  for (let i = 0; i < 100; i++) {
    const p = makePeriod(start);
    out.push(p);
    if (p.end >= throughDate) covered = true;
    if (covered) {
      for (let a = 0; a < extra; a++) {
        start = addDaysIso(out[out.length - 1].end, 1);
        out.push(makePeriod(start));
      }
      break;
    }
    start = addDaysIso(p.end, 1);
  }
  return out;
}

export function ensurePeriodForDate(
  periods: PayPeriod[],
  date: string,
  anchor = DEFAULT_ANCHOR,
): { periods: PayPeriod[]; period: PayPeriod } {
  const found = periods.find((p) => date >= p.start && date <= p.end);
  if (found) return { periods, period: found };

  const lastEnd = periods[periods.length - 1]?.end ?? anchor;
  const through = date > lastEnd ? date : lastEnd;
  const built = buildPeriodsFromAnchor(anchor, through, 2);
  const map = new Map([...periods, ...built].map((p) => [p.id, p]));
  const list = [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
  let period = list.find((p) => date >= p.start && date <= p.end);
  if (!period) {
    period = makePeriod(date);
    list.push(period);
    list.sort((a, b) => a.start.localeCompare(b.start));
  }
  return { periods: list, period };
}

export function findPeriodByStart(periods: PayPeriod[], start: string): PayPeriod | undefined {
  return periods.find((p) => p.start === start);
}

export function periodLabel(period: PayPeriod): string {
  const fmt = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  return `${fmt(period.start)} – ${fmt(period.end)}`;
}

export function periodShortLabel(period: PayPeriod): string {
  const fmt = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return `${fmt(period.start)}–${fmt(period.end)}`;
}

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Parse "August 24 - September 20" → ISO dates (default year 2026). */
export function parseDateRangeHeader(line: string, defaultYear = 2026): { start: string; end: string } | null {
  const m = line
    .replace(/[–—]/g, '-')
    .match(/^([A-Za-z]+)\s+(\d{1,2})\s*-\s*([A-Za-z]+)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/);
  if (!m) return null;
  const y = m[5] ? Number(m[5]) : defaultYear;
  const m1 = MONTHS[m[1].toLowerCase()];
  const m2 = MONTHS[m[3].toLowerCase()];
  if (m1 == null || m2 == null) return null;
  let y2 = y;
  if (m2 < m1) y2 = y + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${y}-${pad(m1 + 1)}-${pad(Number(m[2]))}`;
  const end = `${y2}-${pad(m2 + 1)}-${pad(Number(m[4]))}`;
  return { start, end };
}
