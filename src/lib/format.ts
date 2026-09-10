/**
 * Shared display helpers for currency, dates, margins, and leftover-piece JSON.
 * Locale is sq-XK (Albanian / Kosovo) for EUR formatting.
 */

/** Format a number as EUR for Kosovo (sq-XK). */
export function formatEuro(value: number): string {
  return new Intl.NumberFormat('sq-XK', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value || 0);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Absolute and percent margin from selling price vs cost. */
export function marginInfo(selling: number, cost: number): { amount: number; percent: number } {
  const amount = (selling || 0) - (cost || 0);
  const percent = selling > 0 ? (amount / selling) * 100 : 0;
  return { amount, percent };
}

/**
 * Pretty-print leftover_pieces JSON (piece-size -> count).
 * Example: {"3":1,"1":2} -> "2x1, 1x3" (highest piece size first).
 */
export function formatLeftovers(json: string | null | undefined): string {
  if (!json) return '';
  try {
    const map = JSON.parse(json) as Record<string, number>;
    return Object.entries(map)
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([k, v]) => `${v}×${k}`)
      .join(', ');
  } catch {
    return json;
  }
}

/** Medium date + short time in sq-XK; empty ISO yields an em-dash placeholder. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('sq-XK', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** True when running inside Electron with the preload bridge available. */
export function hasErpBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.erp);
}
