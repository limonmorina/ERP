import type { OrderStatus } from '../../electron/types';

/** Status values stay English in SQLite; UI shows Albanian. */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  'Pending Delivery': 'Në pritje të dorëzimit',
  Delivered: 'E dorëzuar',
  Returned: 'E kthyer',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as OrderStatus] ?? status;
}

export const CATEGORY_LABELS: Record<string, string> = {
  'Living Room': 'Dhoma e ndenjes',
  'Bedroom Sets': 'Sete gjumi',
  Mattresses: 'Dyshekë',
  Komodë: 'Komodë',
  'Coffee Tables': 'Tavolina kafeje',
};

export function categoryLabel(name: string): string {
  return CATEGORY_LABELS[name] ?? name;
}
