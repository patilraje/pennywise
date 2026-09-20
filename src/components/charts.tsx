import { formatMoney } from '@/store';
import { colorAt, softAt } from '@/utils/chartColors';

export type Slice = { label: string; value: number; color?: string };

function money(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Donut / pie ring with center label */
export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  size = 180,
}: {
  slices: Slice[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = size / 2;
  const stroke = size * 0.14;
  const radius = r - stroke / 2 - 2;
  const circ = 2 * Math.PI * radius;

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <div
          className="rounded-full border-[12px] border-line"
          style={{ width: size * 0.7, height: size * 0.7 }}
        />
        <p className="mt-2 text-xs text-muted">No data</p>
      </div>
    );
  }

  let offset = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const len = (s.value / total) * circ;
      const dash = `${len} ${circ - len}`;
      const el = (
        <circle
          key={s.label + i}
          cx={r}
          cy={r}
          r={radius}
          fill="none"
          stroke={s.color ?? colorAt(i)}
          strokeWidth={stroke}
          strokeDasharray={dash}
          strokeDashoffset={-offset}
          strokeLinecap="butt"
          className="transition-all duration-500"
        />
      );
      offset += len;
      return el;
    });

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={r}
          cy={r}
          r={radius}
          fill="none"
          stroke="#e8ece9"
          strokeWidth={stroke}
        />
        {arcs}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        {centerValue ? (
          <p className="text-lg font-bold tabular leading-tight">{centerValue}</p>
        ) : null}
        {centerLabel ? <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{centerLabel}</p> : null}
      </div>
    </div>
  );
}

/** Vertical column bars */
export function ColumnChart({
  bars,
  height = 160,
}: {
  bars: { label: string; value: number; color?: string; soft?: string; sub?: string }[];
  height?: number;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="flex items-end gap-2 sm:gap-3" style={{ height }}>
      {bars.map((b, i) => {
        const h = Math.max(4, (b.value / max) * (height - 36));
        const color = b.color ?? colorAt(i);
        return (
          <div key={b.label + i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-semibold tabular text-ink">{formatMoney(b.value)}</span>
            <div
              className="w-full max-w-[48px] rounded-t-lg transition-all duration-500"
              style={{
                height: h,
                background: `linear-gradient(180deg, ${color} 0%, ${b.soft ?? softAt(i)} 140%)`,
                boxShadow: `0 4px 12px -4px ${color}66`,
              }}
              title={b.sub ?? b.label}
            />
            <span className="w-full truncate text-center text-[10px] font-medium text-muted">
              {b.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal bars with labels */
export function HBarChart({
  bars,
}: {
  bars: { label: string; value: number; max?: number; color?: string; right?: string }[];
}) {
  const max = Math.max(...bars.map((b) => b.max ?? b.value), 1);
  return (
    <ul className="space-y-3">
      {bars.map((b, i) => {
        const color = b.color ?? colorAt(i);
        const pct = Math.min(100, (b.value / max) * 100);
        return (
          <li key={b.label + i} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="mb-1 flex justify-between gap-2 text-sm">
              <span className="font-medium">{b.label}</span>
              <span className="tabular font-semibold" style={{ color }}>
                {b.right ?? formatMoney(b.value)}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-line/80">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Two-tone comparison (e.g. income vs spend) */
export function CompareBars({
  left,
  right,
}: {
  left: { label: string; value: number; color: string };
  right: { label: string; value: number; color: string };
}) {
  const max = Math.max(left.value, right.value, 1);
  return (
    <div className="space-y-4">
      {[left, right].map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-semibold" style={{ color: row.color }}>
              {row.label}
            </span>
            <span className="tabular font-bold">{formatMoney(row.value)}</span>
          </div>
          <div className="h-4 overflow-hidden rounded-full bg-line/70">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(row.value / max) * 100}%`,
                background: row.color,
              }}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-muted">
        Difference{' '}
        <span className="font-semibold tabular text-ink">
          {formatMoney(money(left.value - right.value))}
        </span>
      </p>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'teal',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'teal' | 'coral' | 'amber' | 'sky' | 'lime' | 'rose' | 'navy';
}) {
  const tones: Record<string, string> = {
    teal: 'border-accent/25 bg-accent-soft/60 text-accent',
    coral: 'border-coral/25 bg-coral-soft text-coral',
    amber: 'border-amber/30 bg-amber-soft text-amber',
    sky: 'border-sky/25 bg-sky-soft text-sky',
    lime: 'border-lime/25 bg-lime-soft text-lime',
    rose: 'border-rose/25 bg-rose-soft text-rose',
    navy: 'border-navy/20 bg-navy-soft text-navy',
  };
  return (
    <div className={`rounded-xl border p-4 shadow-soft ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs opacity-70">{hint}</p> : null}
    </div>
  );
}
