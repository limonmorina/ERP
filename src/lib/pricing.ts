/**
 * Fair-price helpers for partial or oversized furniture sets.
 * Proportional "entitled" price is NOT a customer discount; discount is only
 * when the sell price is below that fair amount.
 */

/** Parse formats like "3-3-1" into piece counts. */
function parseSetFormat(format: string): number[] {
  return format
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => Math.floor(Number(p) || 0));
}

export type PriceSuggestion = {
  /** Fair / entitled price for the requested combination */
  entitled: number;
  /** Full complete-set catalog price from inventory */
  catalog: number;
  ratio: number;
  stockUnits: number;
  requestedUnits: number;
  kind: 'same' | 'smaller' | 'larger';
  note: string;
};

/**
 * Proportional worth of the requested set - NOT a discount.
 * Example: full 3-3-1 = EUR 7000 -> requested 3-1 approx EUR 7000 * (4/7).
 */
export function suggestUnitPrice(
  catalogPrice: number,
  stockSetFormat: string,
  requestedFormat: string
): PriceSuggestion {
  const stockUnits = parseSetFormat(stockSetFormat).reduce((a, b) => a + b, 0) || 1;
  const requestedUnits = parseSetFormat(requestedFormat).reduce((a, b) => a + b, 0) || 1;
  const ratio = requestedUnits / stockUnits;
  const entitled = Math.round(catalogPrice * ratio * 100) / 100;

  if (Math.abs(ratio - 1) < 0.001) {
    return {
      entitled: catalogPrice,
      catalog: catalogPrice,
      ratio: 1,
      stockUnits,
      requestedUnits,
      kind: 'same',
      note: 'I njëjti set i plotë - çmimi i justë është çmimi i inventarit.',
    };
  }
  if (ratio < 1) {
    return {
      entitled,
      catalog: catalogPrice,
      ratio,
      stockUnits,
      requestedUnits,
      kind: 'smaller',
      note: `Kombinimi ${requestedFormat} vlen më pak se seti i plotë ${stockSetFormat} (${requestedUnits}/${stockUnits} njësi). Kjo NUK është zbritje - është çmimi i justë i pjesëve.`,
    };
  }
  return {
    entitled,
    catalog: catalogPrice,
    ratio,
    stockUnits,
    requestedUnits,
    kind: 'larger',
    note: `Kombinimi ${requestedFormat} është më i madh se seti ${stockSetFormat} (${requestedUnits}/${stockUnits} njësi). Çmimi i justë është më i lartë - jo “shtesë”, por vlera e setit.`,
  };
}

/** True customer discount: only when selling below the fair/entitled price. */
export function customerDiscount(entitledPrice: number, sellPrice: number, qty = 1): number {
  return Math.max(0, (entitledPrice - sellPrice) * qty);
}

export function roundToNearestStep(value: number, step = 50): number {
  return Math.round(value / step) * step;
}

export function roundUpToStep(value: number, step = 50): number {
  return Math.ceil(value / step) * step;
}

export function roundDownToStep(value: number, step = 50): number {
  return Math.floor(value / step) * step;
}
