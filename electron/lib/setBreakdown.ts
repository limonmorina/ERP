/**
 * Furniture set breakdown helpers.
 * Set formats are hyphen-separated piece sizes, e.g. "3-3-1".
 * Matching is by piece-value multiset. Leftovers are packed back into complete sets when possible.
 */

export type PieceMap = Record<string, number>;

export function parseSetFormat(format: string): number[] {
  return format
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Invalid set format segment: "${p}" in "${format}"`);
      }
      return Math.floor(n);
    });
}

export function toPieceCounts(pieces: number[]): PieceMap {
  const map: PieceMap = {};
  for (const p of pieces) {
    const key = String(p);
    map[key] = (map[key] ?? 0) + 1;
  }
  return map;
}

export function parseLeftovers(json: string | null | undefined): PieceMap {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as PieceMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function serializeLeftovers(map: PieceMap): string {
  const cleaned: PieceMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (v > 0) cleaned[k] = v;
  }
  return Object.keys(cleaned).length ? JSON.stringify(cleaned) : '';
}

/** Human-readable leftovers: "1×3, 1×1" */
export function formatLeftoversDisplay(json: string | null | undefined): string {
  const map = parseLeftovers(json);
  const parts = Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([k, v]) => `${v}×${k}`);
  return parts.length ? parts.join(', ') : '';
}

function cloneMap(map: PieceMap): PieceMap {
  return { ...map };
}

function addMap(target: PieceMap, source: PieceMap, multiplier = 1): void {
  for (const [k, v] of Object.entries(source)) {
    target[k] = (target[k] ?? 0) + v * multiplier;
  }
}

function canFormSet(available: PieceMap, perSet: PieceMap): boolean {
  return Object.entries(perSet).every(([k, need]) => (available[k] ?? 0) >= need);
}

function subtractSet(available: PieceMap, perSet: PieceMap): void {
  for (const [k, need] of Object.entries(perSet)) {
    available[k] = (available[k] ?? 0) - need;
    if (available[k] <= 0) delete available[k];
  }
}

/** Pack leftover pieces back into complete sets whenever possible. */
export function packCompleteSets(
  stockSets: number,
  leftover: PieceMap,
  stockSetFormat: string
): { stockSets: number; leftover: PieceMap } {
  const perSet = toPieceCounts(parseSetFormat(stockSetFormat));
  const available = cloneMap(leftover);
  let sets = stockSets;
  while (canFormSet(available, perSet)) {
    subtractSet(available, perSet);
    sets += 1;
  }
  const cleaned: PieceMap = {};
  for (const [k, v] of Object.entries(available)) {
    if (v > 0) cleaned[k] = v;
  }
  return { stockSets: sets, leftover: cleaned };
}

export interface BreakdownResult {
  brokeSet: boolean;
  warning: string | null;
  setsConsumed: number;
  leftoverAfter: PieceMap;
  stockSetsAfter: number;
  feasible: boolean;
  message: string;
}

/**
 * Consume requested combination from complete sets + leftovers, then repack leftovers.
 */
export function calculateSetBreakdown(
  stockSetFormat: string,
  stockSets: number,
  leftoverJson: string,
  requestedFormat: string,
  quantity = 1
): BreakdownResult {
  const perSet = toPieceCounts(parseSetFormat(stockSetFormat));
  const needOne = toPieceCounts(parseSetFormat(requestedFormat));
  const need: PieceMap = {};
  addMap(need, needOne, quantity);

  const leftovers = parseLeftovers(leftoverJson);

  const sameShape =
    Object.keys(perSet).length === Object.keys(needOne).length &&
    Object.keys(perSet).every((k) => perSet[k] === needOne[k]);

  if (sameShape && Object.keys(leftovers).length === 0) {
    if (stockSets < quantity) {
      return {
        brokeSet: false,
        warning: 'Stok i pamjaftueshëm për kombinimin e kërkuar.',
        setsConsumed: 0,
        leftoverAfter: leftovers,
        stockSetsAfter: stockSets,
        feasible: false,
        message: `Nevojiten ${quantity} set(e) të plota, në stok ka vetëm ${stockSets}.`,
      };
    }
    return {
      brokeSet: false,
      warning: null,
      setsConsumed: quantity,
      leftoverAfter: {},
      stockSetsAfter: stockSets - quantity,
      feasible: true,
      message: `U konsumuan ${quantity} set(e) të plota. Sete të plota të mbetura: ${stockSets - quantity}.`,
    };
  }

  const available = cloneMap(leftovers);
  let setsLeft = stockSets;
  let setsConsumed = 0;
  let brokeSet = false;

  const keys = new Set([...Object.keys(need), ...Object.keys(available), ...Object.keys(perSet)]);

  for (const key of keys) {
    const required = need[key] ?? 0;
    if (required <= 0) continue;

    while ((available[key] ?? 0) < required && setsLeft > 0) {
      setsLeft -= 1;
      setsConsumed += 1;
      brokeSet = true;
      addMap(available, perSet, 1);
    }

    if ((available[key] ?? 0) < required) {
      return {
        brokeSet: true,
        warning: 'Stok i pamjaftueshëm për kombinimin e kërkuar.',
        setsConsumed,
        leftoverAfter: leftovers,
        stockSetsAfter: stockSets,
        feasible: false,
        message: `Nuk ka mjaftueshëm pjesë "${key}". Nevojiten ${required}, të disponueshme: ${available[key] ?? 0}.`,
      };
    }

    available[key] = (available[key] ?? 0) - required;
    if (available[key] <= 0) delete available[key];
  }

  // Repack any leftover pieces that form complete sets again
  const packed = packCompleteSets(setsLeft, available, stockSetFormat);

  const hasUnmatched = Object.keys(packed.leftover).length > 0;
  const warning =
    brokeSet && hasUnmatched
      ? 'Kujdes: Po thyhet seti i plotë. Mbeten pjesë të pakombinuara.'
      : brokeSet
        ? 'Kujdes: U thyen set(e) të plota për kombinimin e personalizuar.'
        : null;

  const leftoverLabel = hasUnmatched
    ? ` Mbetje pjesësh: ${formatLeftoversDisplay(serializeLeftovers(packed.leftover))}.`
    : '';

  return {
    brokeSet,
    warning,
    setsConsumed,
    leftoverAfter: packed.leftover,
    stockSetsAfter: packed.stockSets,
    feasible: true,
    message:
      (warning ?? 'Alokimi i stokut është në rregull.') +
      ` Sete të plota të mbetura: ${packed.stockSets}.${leftoverLabel}`,
  };
}

/** Put sold pieces back into inventory (used when deleting an order). */
export function restorePiecesToInventory(
  stockSetFormat: string,
  stockSets: number,
  leftoverJson: string,
  requestedFormat: string,
  quantity = 1
): { stockSetsAfter: number; leftoverAfter: PieceMap } {
  const available = cloneMap(parseLeftovers(leftoverJson));
  addMap(available, toPieceCounts(parseSetFormat(requestedFormat)), quantity);
  const packed = packCompleteSets(stockSets, available, stockSetFormat);
  return { stockSetsAfter: packed.stockSets, leftoverAfter: packed.leftover };
}

/** Inventory asset value: complete sets at cost + leftover seat-units pro-rata. */
export function inventoryLineValue(
  costPrice: number,
  stockSets: number,
  setFormat: string,
  leftoverJson: string
): number {
  const perSet = parseSetFormat(setFormat);
  const seatUnitsPerSet = perSet.reduce((a, b) => a + b, 0) || 1;
  const leftovers = parseLeftovers(leftoverJson);
  // Leftovers keys are seat sizes ("3","1"); values are counts of those pieces.
  let leftoverSeatUnits = 0;
  for (const [size, count] of Object.entries(leftovers)) {
    leftoverSeatUnits += Number(size) * count;
  }
  const leftoverValue = (costPrice / seatUnitsPerSet) * leftoverSeatUnits;
  return costPrice * stockSets + leftoverValue;
}

export const DEFAULT_TVSH_RATE = 0.18;

export function extractNetFromInclusive(inclusive: number, rate = DEFAULT_TVSH_RATE): number {
  return inclusive / (1 + rate);
}

export function extractTvshFromInclusive(inclusive: number, rate = DEFAULT_TVSH_RATE): number {
  return inclusive - extractNetFromInclusive(inclusive, rate);
}

export function calculateNetProfit(
  sellingPriceInclusive: number,
  supplierCost: number,
  transportFee: number
): number {
  return sellingPriceInclusive - supplierCost - transportFee;
}

/**
 * Fair / entitled sell price for a requested set format from the full-set catalog price.
 * Smaller set → lower entitled price (piece worth). Larger set → higher.
 * This is NOT a customer discount — discount is only sellPrice < entitledPrice.
 */
export function suggestUnitPrice(
  catalogPrice: number,
  stockSetFormat: string,
  requestedFormat: string
): {
  entitled: number;
  /** @deprecated use entitled — kept for older call sites */
  suggested: number;
  catalog: number;
  ratio: number;
  stockUnits: number;
  requestedUnits: number;
  kind: 'same' | 'smaller' | 'larger';
  note: string;
} {
  const stockUnits = parseSetFormat(stockSetFormat).reduce((a, b) => a + b, 0) || 1;
  const requestedUnits = parseSetFormat(requestedFormat).reduce((a, b) => a + b, 0) || 1;
  const ratio = requestedUnits / stockUnits;
  const entitled = Math.round(catalogPrice * ratio * 100) / 100;

  if (Math.abs(ratio - 1) < 0.001) {
    return {
      entitled: catalogPrice,
      suggested: catalogPrice,
      catalog: catalogPrice,
      ratio: 1,
      stockUnits,
      requestedUnits,
      kind: 'same',
      note: 'I njëjti set i plotë — çmimi i justë është çmimi i inventarit.',
    };
  }
  if (ratio < 1) {
    return {
      entitled,
      suggested: entitled,
      catalog: catalogPrice,
      ratio,
      stockUnits,
      requestedUnits,
      kind: 'smaller',
      note: `Kombinimi i kërkuar vlen ${requestedUnits}/${stockUnits} të setit të plotë. Çmim i justë (jo zbritje).`,
    };
  }
  return {
    entitled,
    suggested: entitled,
    catalog: catalogPrice,
    ratio,
    stockUnits,
    requestedUnits,
    kind: 'larger',
    note: `Kombinimi i kërkuar vlen ${requestedUnits}/${stockUnits} të setit të plotë. Çmim i justë më i lartë.`,
  };
}

export function customerDiscountAmount(
  entitledPrice: number,
  sellPrice: number,
  quantity = 1
): number {
  return Math.max(0, (entitledPrice - sellPrice) * quantity);
}

export const PROFESSIONAL_WARRANTY = `GARANCIONI PROFESIONAL — HSM Furniture

1. Produktet garantohet për defekte të fabrikimit dhe materialeve, sipas kushteve të mëposhtme.
2. Garancioni vlen vetëm me faturën origjinale dhe për blerësin e parë.
3. Garancioni nuk mbulon dëmtimet e qëllimshme, përdorimin e gabuar, transportin e palejuar, lagështinë, zjarrin, ose ndryshimet e bëra nga persona të paautorizuar.
4. Ngjyrat dhe materialet mund të kenë ndryshime të vogla natyrore; këto nuk konsiderohen defekt.
5. Montimi dhe mirëmbajtja duhet të bëhen sipas udhëzimeve të prodhuesit.
6. Për pretendime, klienti duhet të njoftojë HSM Furniture me shkrim brenda afatit ligjor, duke bashkangjitur faturën.
7. Nënshkrimi i klientit në këtë faturë konfirmon se ka lexuar, kuptuar dhe pranuar kushtet e garancisë dhe kushtet e përgjithshme të shitjes.`;
