/** Stable palette for charts — cycles by index or hashes by name. */
export const CHART_COLORS = [
  '#0f7a6a', // teal
  '#e85d4c', // coral
  '#e8a317', // amber
  '#2a9bb5', // sky
  '#5a9e3e', // lime
  '#d4537e', // rose
  '#2c4a6e', // navy
  '#e8916a', // peach
  '#2d9f8a', // mint
  '#c46a1b', // warning/orange
] as const;

export const CHART_SOFT = [
  '#d8efe9',
  '#fde8e4',
  '#fff3d6',
  '#d9f1f6',
  '#e4f3da',
  '#fce4ec',
  '#e4ebf3',
  '#fceee6',
  '#d9f5ef',
  '#f8e8d8',
] as const;

export function colorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export function softAt(index: number): string {
  return CHART_SOFT[index % CHART_SOFT.length];
}

export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CHART_COLORS[h % CHART_COLORS.length];
}

export function softForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CHART_SOFT[h % CHART_SOFT.length];
}
