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

export function marginInfo(selling: number, cost: number): { amount: number; percent: number } {
  const amount = (selling || 0) - (cost || 0);
  const percent = selling > 0 ? (amount / selling) * 100 : 0;
  return { amount, percent };
}

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

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('sq-XK', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function hasErpBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.erp);
}
