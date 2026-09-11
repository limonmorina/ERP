/**
 * Orders and sales page: multi-line create/edit with fair-price / discount logic,
 * preview set breakdowns, update delivery status, and manage profit / invoice links.
 *
 * Major blocks: load, line drafts, pricing preview, form submit, status updates, table.
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileText, MoreVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { SetBreakdownWarning } from '../components/SetBreakdownWarning';
import { ProductThumb } from '../components/ProductThumb';
import { formatDate, formatEuro, hasErpBridge } from '../lib/format';
import { STATUS_LABELS } from '../lib/labels';
import {
  customerDiscount,
  roundDownToStep,
  roundToNearestStep,
  roundUpToStep,
  suggestUnitPrice,
} from '../lib/pricing';
import type {
  Customer,
  InventoryItem,
  Order,
  OrderStatus,
  SetBreakdownPreview,
} from '../../electron/types';

type OrderTab = 'pending' | 'delivered' | 'returned';

type LineDraft = {
  key: string;
  inventory_item_id: number;
  item_name: string;
  set_format_requested: string;
  quantity: number;
  entitled_price: number;
  unit_price: number;
  unit_cost: number;
};

const TAB_META: Record<
  OrderTab,
  { label: string; status: OrderStatus; hint: string }
> = {
  pending: {
    label: 'Në pritje',
    status: 'Pending Delivery',
    hint: 'Porosi aktive - ende pa dorëzuar',
  },
  delivered: {
    label: 'Të dorëzuara',
    status: 'Delivered',
    hint: 'Porosi të përfunduara',
  },
  returned: {
    label: 'Të kthyera',
    status: 'Returned',
    hint: 'Porosi të kthyera',
  },
};

let lineKeySeq = 0;
function nextLineKey(): string {
  lineKeySeq += 1;
  return `line-${Date.now()}-${lineKeySeq}`;
}

function emptyStockLine(item?: InventoryItem): LineDraft {
  if (!item) {
    return {
      key: nextLineKey(),
      inventory_item_id: 0,
      item_name: '',
      set_format_requested: '3-3-1',
      quantity: 1,
      entitled_price: 0,
      unit_price: 0,
      unit_cost: 0,
    };
  }
  let fair = item.selling_price;
  try {
    fair = suggestUnitPrice(item.selling_price, item.set_format, item.set_format).entitled;
  } catch {
    fair = item.selling_price;
  }
  return {
    key: nextLineKey(),
    inventory_item_id: item.id,
    item_name: item.name,
    set_format_requested: item.set_format,
    quantity: 1,
    entitled_price: fair,
    unit_price: fair,
    unit_cost: 0,
  };
}

function emptyCustomLine(): LineDraft {
  return {
    key: nextLineKey(),
    inventory_item_id: 0,
    item_name: '',
    set_format_requested: '',
    quantity: 1,
    entitled_price: 0,
    unit_price: 0,
    unit_cost: 0,
  };
}

/** Left-border + background tint by delivery status for the orders table. */
function rowTone(status: OrderStatus): string {
  if (status === 'Delivered') return 'bg-emerald-50/90 border-l-4 border-l-emerald-500';
  if (status === 'Pending Delivery') return 'bg-amber-50/90 border-l-4 border-l-amber-400';
  return 'bg-white border-l-4 border-l-ink-200';
}

function lineCostForDraft(line: LineDraft, items: InventoryItem[], isCustomJob: boolean): number {
  if (isCustomJob) {
    return (Number(line.unit_cost) || 0) * line.quantity;
  }
  const inv = items.find((i) => i.id === line.inventory_item_id);
  if (!inv) return 0;
  try {
    return (
      suggestUnitPrice(inv.cost_price, inv.set_format, line.set_format_requested).entitled *
      line.quantity
    );
  } catch {
    return inv.cost_price * line.quantity;
  }
}

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<OrderTab>('pending');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [profitManual, setProfitManual] = useState(false);
  const [manualProfit, setManualProfit] = useState<number | null>(null);
  const [breakdownPreview, setBreakdownPreview] = useState<SetBreakdownPreview | null>(
    null
  );
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone1: '',
    phone2: '',
    delivery_address: '',
    city: 'Prishtinë',
    country: 'Kosovë',
  });
  const [useNewCustomer, setUseNewCustomer] = useState(true);
  const [customerId, setCustomerId] = useState<number | ''>('');

  const [isCustomJob, setIsCustomJob] = useState(false);
  const [kapare, setKapare] = useState(0);
  const [transportFee, setTransportFee] = useState(0);
  const [showTransportOnInvoice, setShowTransportOnInvoice] = useState(true);
  const [customNotes, setCustomNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyCustomLine()]);
  /** Per-line locks: fair / sell price edited by hand */
  const [fairManualKeys, setFairManualKeys] = useState<Record<string, boolean>>({});
  const [priceManualKeys, setPriceManualKeys] = useState<Record<string, boolean>>({});

  const calculatedRevenue = useMemo(
    () => lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0),
    [lines]
  );

  const calculatedCost = useMemo(
    () => lines.reduce((sum, line) => sum + lineCostForDraft(line, items, isCustomJob), 0),
    [lines, items, isCustomJob]
  );

  const trueDiscount = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum +
          customerDiscount(
            line.entitled_price || line.unit_price,
            line.unit_price,
            line.quantity
          ),
        0
      ),
    [lines]
  );

  // Transport is paid by the client; it is not a shop expense and does not reduce profit
  const calculatedProfit = calculatedRevenue - calculatedCost;
  const displayProfit = profitManual && manualProfit !== null ? manualProfit : calculatedProfit;

  useEffect(() => {
    if (!profitManual) setManualProfit(calculatedProfit);
  }, [calculatedProfit, profitManual]);

  const filteredOrders = useMemo(() => {
    const status = TAB_META[tab].status;
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (o.status !== status) return false;
      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.item_names || '').toLowerCase().includes(q) ||
        (o.custom_notes || '').toLowerCase().includes(q)
      );
    });
  }, [orders, search, tab]);

  const counts = useMemo(
    () => ({
      pending: orders.filter((o) => o.status === 'Pending Delivery').length,
      delivered: orders.filter((o) => o.status === 'Delivered').length,
      returned: orders.filter((o) => o.status === 'Returned').length,
    }),
    [orders]
  );

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function applySuggestedPrice(lineKey: string, item: InventoryItem, format: string, force = false) {
    const fairLocked = fairManualKeys[lineKey];
    const priceLocked = priceManualKeys[lineKey];
    if (fairLocked && priceLocked && !force) return;
    try {
      const s = suggestUnitPrice(item.selling_price, item.set_format, format);
      setLines((prev) =>
        prev.map((line) => {
          if (line.key !== lineKey) return line;
          return {
            ...line,
            entitled_price: fairLocked && !force ? line.entitled_price : s.entitled,
            unit_price: priceLocked && !force ? line.unit_price : s.entitled,
          };
        })
      );
    } catch {
      setLines((prev) =>
        prev.map((line) => {
          if (line.key !== lineKey) return line;
          return {
            ...line,
            entitled_price: fairLocked && !force ? line.entitled_price : item.selling_price,
            unit_price: priceLocked && !force ? line.unit_price : item.selling_price,
          };
        })
      );
    }
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      isCustomJob ? emptyCustomLine() : emptyStockLine(items[0]),
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.key !== key)));
  }

  function resetFormMeta() {
    setEditingOrderId(null);
    setKapare(0);
    setTransportFee(0);
    setShowTransportOnInvoice(true);
    setCustomNotes('');
    setUseNewCustomer(true);
    setCustomerId('');
    setCustomerForm({
      name: '',
      phone1: '',
      phone2: '',
      delivery_address: '',
      city: 'Prishtinë',
      country: 'Kosovë',
    });
    setFairManualKeys({});
    setPriceManualKeys({});
    setProfitManual(false);
    setManualProfit(null);
    setBreakdownPreview(null);
  }

  function openNewStockOrder() {
    resetFormMeta();
    setIsCustomJob(false);
    setLines([emptyStockLine(items[0])]);
    setShowForm(true);
  }

  function openNewCustomOrder() {
    resetFormMeta();
    setIsCustomJob(true);
    setLines([emptyCustomLine()]);
    setShowForm(true);
  }

  async function load() {
    if (!hasErpBridge()) {
      setError('Ura e Electron nuk është aktive - hapni me npm run electron:dev');
      return;
    }
    const [o, c, i] = await Promise.all([
      window.erp.orders.list(),
      window.erp.customers.list(),
      window.erp.inventory.list(),
    ]);
    setOrders(o);
    setCustomers(c);
    setItems(i);
  }

  useEffect(() => {
    load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : 'Dështoi ngarkimi i porosive')
    );
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  /** Dry-run stock impact for the first warehouse line (custom jobs skip stock). */
  async function previewLine() {
    if (!hasErpBridge()) return;
    if (isCustomJob) {
      setBreakdownPreview({
        brokeSet: false,
        warning: null,
        feasible: true,
        message:
          'Punë e personalizuar: stoku i seteve të plota në magazinë nuk ndryshon. Porosia porositet ndryshe.',
        setsConsumed: 0,
        stockSetsAfter: 0,
        leftoverAfter: {},
      });
      return;
    }
    const first = lines.find((l) => l.inventory_item_id);
    if (!first?.inventory_item_id) return;
    const result = await window.erp.inventory.previewBreakdown({
      inventory_item_id: first.inventory_item_id,
      set_format_requested: first.set_format_requested,
      quantity: first.quantity,
    });
    setBreakdownPreview(result);
  }

  async function startEdit(orderId: number) {
    if (!hasErpBridge()) return;
    setMenuOpenId(null);
    setError(null);
    try {
      const detail = await window.erp.orders.get(orderId);
      const order = detail.order;
      if (order.status !== 'Pending Delivery') {
        setError('Porosia mund të ndryshohet vetëm kur statusi është Në pritje');
        return;
      }
      const orderItems = detail.items;
      const custom = Boolean(order.is_custom_job);

      setEditingOrderId(order.id);
      setIsCustomJob(custom);
      setKapare(order.kapare || 0);
      setTransportFee(order.transport_fee || 0);
      setShowTransportOnInvoice(Boolean(order.show_transport_on_invoice));
      setCustomNotes(order.custom_notes || '');
      setUseNewCustomer(false);
      setCustomerId(order.customer_id);
      setProfitManual(true);
      setManualProfit(order.net_profit);
      setBreakdownPreview(null);

      const drafts: LineDraft[] =
        orderItems.length > 0
          ? orderItems.map((oi) => ({
              key: nextLineKey(),
              inventory_item_id: oi.inventory_item_id || 0,
              item_name: oi.item_name || '',
              set_format_requested: oi.set_format_requested || '',
              quantity: oi.quantity || 1,
              entitled_price: oi.list_price ?? oi.unit_price,
              unit_price: oi.unit_price,
              unit_cost: oi.unit_cost || 0,
            }))
          : [custom ? emptyCustomLine() : emptyStockLine(items[0])];

      setLines(drafts);
      const locked: Record<string, boolean> = {};
      for (const d of drafts) locked[d.key] = true;
      setFairManualKeys(locked);
      setPriceManualKeys(locked);
      setShowForm(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nuk u ngarkua porosia');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasErpBridge()) return;
    setError(null);
    try {
      let cid = customerId;
      if (useNewCustomer) {
        const created = await window.erp.customers.create(customerForm);
        cid = created.id;
      }
      if (!cid) throw new Error('Zgjidhni ose krijoni një klient');

      const payloadItems = lines.map((line) =>
        isCustomJob
          ? {
              inventory_item_id: null as number | null,
              item_name: line.item_name.trim(),
              set_format_requested:
                line.set_format_requested.trim() || 'punë e personalizuar',
              quantity: line.quantity,
              unit_price: Number(line.unit_price),
              unit_cost: Number(line.unit_cost),
              entitled_price: Number(line.entitled_price || line.unit_price),
            }
          : {
              inventory_item_id: line.inventory_item_id,
              set_format_requested: line.set_format_requested,
              quantity: line.quantity,
              entitled_price: Number(line.entitled_price),
              unit_price: Number(line.unit_price),
            }
      );

      const shared = {
        customer_id: Number(cid),
        kapare: Number(kapare),
        transport_fee: Number(transportFee),
        show_transport_on_invoice: showTransportOnInvoice,
        is_custom_job: isCustomJob,
        custom_notes: customNotes,
        net_profit: Number(displayProfit),
        items: payloadItems,
      };

      const order =
        editingOrderId != null
          ? await window.erp.orders.update({ ...shared, order_id: editingOrderId })
          : await window.erp.orders.create(shared);

      if (order.set_break_warning) {
        setBreakdownPreview({
          brokeSet: true,
          warning:
            order.set_break_message ||
            'Kujdes: Po thyhet seti i plotë. Mbeten pjesë të pakombinuara.',
          feasible: true,
          message: order.set_break_message,
          setsConsumed: 0,
          stockSetsAfter: 0,
          leftoverAfter: {},
        });
      }

      setShowForm(false);
      resetFormMeta();
      setTab('pending');
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editingOrderId
            ? 'Nuk u përditësua porosia'
            : 'Nuk u krijua porosia'
      );
    }
  }

  async function updateStatus(orderId: number, status: OrderStatus) {
    if (!hasErpBridge()) return;
    await window.erp.orders.updateStatus({ order_id: orderId, status });
    await load();
    if (status === 'Delivered') setTab('delivered');
    if (status === 'Returned') setTab('returned');
    if (status === 'Pending Delivery') setTab('pending');
  }

  async function updateProfit(orderId: number, netProfit: number) {
    if (!hasErpBridge()) return;
    try {
      await window.erp.orders.updateProfit({
        order_id: orderId,
        net_profit: netProfit,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nuk u përditësua fitimi');
    }
  }

  async function deleteOrder(orderId: number) {
    if (!hasErpBridge()) return;
    const ok = window.confirm(
      'Jeni i sigurt që doni ta fshini përgjithmonë këtë porosi? Stoku do të rikthehet.'
    );
    if (!ok) return;
    setMenuOpenId(null);
    try {
      await window.erp.orders.delete(orderId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fshirja dështoi');
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold">Porositë & shitjet</h2>
          <p className="mt-1 text-ink-600">
            Çmimi i justë sipas madhësisë së setit · Zbritja vetëm kur i bëni klientit çmim më të
            ulët se ai i justë
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={openNewStockOrder}>
            <Plus size={16} />
            Porosi nga stoku
          </button>
          <button type="button" className="btn-secondary" onClick={openNewCustomOrder}>
            <Plus size={16} />
            Punë e personalizuar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-xl">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            className="input pl-9"
            placeholder="Kërko porosi / klient / produkt…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(TAB_META) as OrderTab[]).map((key) => {
          const active = tab === key;
          const tone =
            key === 'pending'
              ? active
                ? 'bg-amber-400 text-ink-950'
                : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
              : key === 'delivered'
                ? active
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                : active
                  ? 'bg-ink-700 text-white'
                  : 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50';
          return (
            <button
              key={key}
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tone}`}
              onClick={() => setTab(key)}
            >
              {TAB_META[key].label}
              <span className="ml-2 font-mono text-xs opacity-80">{counts[key]}</span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-ink-500">{TAB_META[tab].hint}</p>

      {error && (
        <div className="rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={onSubmit} className="panel space-y-6 p-5">
          <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
            <h3 className="text-lg font-semibold text-ink-950">
              {editingOrderId
                ? isCustomJob
                  ? 'Ndrysho punën e personalizuar'
                  : 'Ndrysho porosinë nga stoku'
                : isCustomJob
                  ? 'Punë e personalizuar (custom job)'
                  : 'Porosi nga stoku i magazinës'}
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              {isCustomJob
                ? 'Çdo punë jashtë seteve standarde të magazinës: kënde me metra, masa speciale, porosi të porositura, etj. Stoku i seteve të plota nuk preket.'
                : 'Heq nga stoku i seteve të plota. Formati tipik i setit: 3-3-1. Mund të shtoni disa artikuj.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={useNewCustomer}
                onChange={() => setUseNewCustomer(true)}
                disabled={editingOrderId != null}
              />
              Klient i ri
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={!useNewCustomer}
                onChange={() => setUseNewCustomer(false)}
              />
              Klient ekzistues
            </label>
          </div>

          {useNewCustomer ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="field">
                <label>Emri</label>
                <input
                  className="input"
                  required
                  value={customerForm.name}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, name: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Telefoni 1</label>
                <input
                  className="input"
                  required
                  value={customerForm.phone1}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, phone1: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Telefoni 2</label>
                <input
                  className="input"
                  value={customerForm.phone2}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, phone2: e.target.value })
                  }
                />
              </div>
              <div className="field md:col-span-2">
                <label>Adresa e dorëzimit</label>
                <input
                  className="input"
                  value={customerForm.delivery_address}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      delivery_address: e.target.value,
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Qyteti / Shteti</label>
                <input
                  className="input"
                  value={`${customerForm.city}, ${customerForm.country}`}
                  onChange={(e) => {
                    const [city, ...rest] = e.target.value.split(',');
                    setCustomerForm({
                      ...customerForm,
                      city: city.trim(),
                      country: rest.join(',').trim() || 'Kosovë',
                    });
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="field max-w-md">
              <label>Klienti</label>
              <select
                className="input"
                required
                value={customerId}
                onChange={(e) =>
                  setCustomerId(e.target.value ? Number(e.target.value) : '')
                }
              >
                <option value="">Zgjidhni…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.phone1}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink-900">Artikujt e porosisë</h4>
              <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={addLine}>
                <Plus size={14} />
                Shto artikull
              </button>
            </div>

            {lines.map((line, index) => {
              const selectedItem = items.find((i) => i.id === line.inventory_item_id);
              const catalogPrice = selectedItem?.selling_price ?? 0;
              let priceHint: ReturnType<typeof suggestUnitPrice> | null = null;
              if (selectedItem) {
                try {
                  priceHint = suggestUnitPrice(
                    catalogPrice,
                    selectedItem.set_format,
                    line.set_format_requested
                  );
                } catch {
                  priceHint = null;
                }
              }
              const entitledFallback = priceHint?.entitled ?? catalogPrice;
              const lineDiscount = customerDiscount(
                line.entitled_price || entitledFallback,
                line.unit_price,
                line.quantity
              );
              const lineRev = line.unit_price * line.quantity;
              const lineCost = lineCostForDraft(line, items, isCustomJob);

              return (
                <div
                  key={line.key}
                  className="rounded-xl border border-ink-200 bg-white p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Rreshti {index + 1}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1 text-accent"
                        onClick={() => removeLine(line.key)}
                        title="Hiq rreshtin"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {isCustomJob ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="field md:col-span-2 xl:col-span-3">
                        <label>Emri / përshkrimi i punës</label>
                        <input
                          className="input"
                          required
                          value={line.item_name}
                          onChange={(e) => updateLine(line.key, { item_name: e.target.value })}
                          placeholder="P.sh. Kënd divani 3.2-3.2, tavolinë speciale…"
                        />
                      </div>
                      <div className="field">
                        <label>Sasia</label>
                        <input
                          type="number"
                          min={1}
                          className="input"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.key, { quantity: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="field md:col-span-2 xl:col-span-4">
                        <label>Specifikime / dimensione (opsionale)</label>
                        <input
                          className="input"
                          value={line.set_format_requested}
                          onChange={(e) =>
                            updateLine(line.key, { set_format_requested: e.target.value })
                          }
                          placeholder="Çfarëdo: 3.2-3.2 m, 200x90 cm, ngjyra…"
                        />
                      </div>
                      <div className="field">
                        <label>Kostoja juaj (€)</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="input"
                          required
                          value={line.unit_cost}
                          onChange={(e) =>
                            updateLine(line.key, { unit_cost: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Çmimi i shitjes (€)</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="input"
                          required
                          value={line.unit_price}
                          onChange={(e) =>
                            updateLine(line.key, {
                              unit_price: Number(e.target.value),
                              entitled_price: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="field md:col-span-2">
                        <label>Fitimi i rreshtit</label>
                        <p className="input flex items-center bg-ink-50 font-medium text-brand-800">
                          {formatEuro(lineRev - lineCost)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="field md:col-span-2">
                          <label>Artikulli nga inventari</label>
                          <div className="flex items-start gap-3">
                            {selectedItem && (
                              <ProductThumb
                                imagePath={selectedItem.image_path}
                                itemId={selectedItem.id}
                                alt={selectedItem.name}
                                size={56}
                                className="mt-0.5"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <select
                                className="input"
                                required
                                value={line.inventory_item_id}
                                onChange={(e) => {
                                  const id = Number(e.target.value);
                                  const item = items.find((x) => x.id === id);
                                  if (!item) return;
                                  setFairManualKeys((m) => ({ ...m, [line.key]: false }));
                                  setPriceManualKeys((m) => ({ ...m, [line.key]: false }));
                                  const format = item.set_format;
                                  let fair = item.selling_price;
                                  try {
                                    fair = suggestUnitPrice(
                                      item.selling_price,
                                      item.set_format,
                                      format
                                    ).entitled;
                                  } catch {
                                    fair = item.selling_price;
                                  }
                                  updateLine(line.key, {
                                    inventory_item_id: id,
                                    item_name: item.name,
                                    set_format_requested: format,
                                    entitled_price: fair,
                                    unit_price: fair,
                                  });
                                }}
                              >
                                <option value={0}>Zgjidhni…</option>
                                {items.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name} · {item.set_format} · {item.stock_sets} sete të
                                    plota
                                    {item.leftover_pieces ? ' + mbetje' : ''}
                                    {item.category_name ? ` · ${item.category_name}` : ''}
                                  </option>
                                ))}
                              </select>
                              {selectedItem?.notes && (
                                <p className="mt-1 text-xs text-ink-500">{selectedItem.notes}</p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="field">
                          <label>Formati i kërkuar i setit</label>
                          <input
                            className="input font-mono"
                            required
                            value={line.set_format_requested}
                            onChange={(e) => {
                              const format = e.target.value;
                              const fairLocked = fairManualKeys[line.key];
                              const priceLocked = priceManualKeys[line.key];
                              let entitled = line.entitled_price;
                              let unit = line.unit_price;
                              if (selectedItem && !(fairLocked && priceLocked)) {
                                try {
                                  const s = suggestUnitPrice(
                                    selectedItem.selling_price,
                                    selectedItem.set_format,
                                    format
                                  );
                                  if (!fairLocked) entitled = s.entitled;
                                  if (!priceLocked) unit = s.entitled;
                                } catch {
                                  if (!fairLocked) entitled = selectedItem.selling_price;
                                  if (!priceLocked) unit = selectedItem.selling_price;
                                }
                              }
                              updateLine(line.key, {
                                set_format_requested: format,
                                entitled_price: entitled,
                                unit_price: unit,
                              });
                            }}
                            onBlur={() => {
                              if (selectedItem) {
                                applySuggestedPrice(
                                  line.key,
                                  selectedItem,
                                  line.set_format_requested
                                );
                              }
                            }}
                            placeholder="3-3-1"
                          />
                        </div>
                        <div className="field">
                          <label>Sasia</label>
                          <input
                            type="number"
                            min={1}
                            className="input"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.key, { quantity: Number(e.target.value) })
                            }
                          />
                        </div>
                      </div>

                      <div className="rounded-lg border border-ink-100 bg-ink-50/80 p-3">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="field">
                            <label>Çmimi i setit të plotë</label>
                            <input
                              className="input bg-white"
                              disabled
                              value={formatEuro(catalogPrice)}
                            />
                          </div>
                          <div className="field">
                            <label>Çmimi i justë</label>
                            <div className="flex gap-2">
                              <input
                                className="input bg-white"
                                type="number"
                                min={0}
                                step="0.01"
                                value={line.entitled_price || entitledFallback}
                                onChange={(e) => {
                                  setFairManualKeys((m) => ({ ...m, [line.key]: true }));
                                  updateLine(line.key, {
                                    entitled_price: Number(e.target.value),
                                  });
                                }}
                              />
                              <button
                                type="button"
                                className="btn-secondary shrink-0 !px-3"
                                onClick={() => {
                                  const fair = entitledFallback;
                                  setFairManualKeys((m) => ({ ...m, [line.key]: false }));
                                  setPriceManualKeys((m) => ({ ...m, [line.key]: false }));
                                  updateLine(line.key, {
                                    entitled_price: fair,
                                    unit_price: fair,
                                  });
                                }}
                              >
                                Përdor
                              </button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn-ghost !px-2 !py-1 text-xs"
                                onClick={() => {
                                  setFairManualKeys((m) => ({ ...m, [line.key]: true }));
                                  updateLine(line.key, {
                                    entitled_price: roundDownToStep(
                                      line.entitled_price || entitledFallback,
                                      50
                                    ),
                                  });
                                }}
                              >
                                Rrumb. poshtë 50
                              </button>
                              <button
                                type="button"
                                className="btn-ghost !px-2 !py-1 text-xs"
                                onClick={() => {
                                  setFairManualKeys((m) => ({ ...m, [line.key]: true }));
                                  updateLine(line.key, {
                                    entitled_price: roundToNearestStep(
                                      line.entitled_price || entitledFallback,
                                      50
                                    ),
                                  });
                                }}
                              >
                                Rrumb. afër 50
                              </button>
                              <button
                                type="button"
                                className="btn-ghost !px-2 !py-1 text-xs"
                                onClick={() => {
                                  setFairManualKeys((m) => ({ ...m, [line.key]: true }));
                                  updateLine(line.key, {
                                    entitled_price: roundUpToStep(
                                      line.entitled_price || entitledFallback,
                                      50
                                    ),
                                  });
                                }}
                              >
                                Rrumb. lart 50
                              </button>
                            </div>
                          </div>
                          <div className="field">
                            <label>Çmimi final i shitjes (€)</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="input bg-white"
                              required
                              value={line.unit_price}
                              onChange={(e) => {
                                setPriceManualKeys((m) => ({ ...m, [line.key]: true }));
                                updateLine(line.key, { unit_price: Number(e.target.value) });
                              }}
                            />
                          </div>
                          <div className="field">
                            <label>Zbritja e rreshtit</label>
                            <p
                              className={`input flex items-center bg-white font-medium ${
                                lineDiscount > 0 ? 'text-accent' : 'text-ink-600'
                              }`}
                            >
                              {lineDiscount > 0
                                ? `−${formatEuro(lineDiscount)}`
                                : 'Pa zbritje'}
                            </p>
                          </div>
                        </div>
                        {priceHint && (
                          <p className="mt-2 text-xs text-ink-700">{priceHint.note}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 rounded-lg border border-brand-200 bg-brand-50/70 p-3 md:grid-cols-3">
            <div className="field">
              <label>Kostoja totale</label>
              <input className="input bg-white" disabled value={formatEuro(calculatedCost)} />
            </div>
            <div className="field">
              <label>Të ardhurat nga shitja</label>
              <input className="input bg-white" disabled value={formatEuro(calculatedRevenue)} />
            </div>
            <div className="field">
              <label>Fitimi i porosisë (€)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  className="input bg-white font-semibold text-brand-800"
                  value={displayProfit}
                  onChange={(e) => {
                    setProfitManual(true);
                    setManualProfit(Number(e.target.value));
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0 !px-3 text-xs"
                  onClick={() => {
                    setProfitManual(false);
                    setManualProfit(calculatedProfit);
                  }}
                >
                  Auto
                </button>
              </div>
              <p className="mt-1 text-[11px] text-ink-600">
                Auto: shitja - kostoja = {formatEuro(calculatedProfit)}
                {trueDiscount > 0 ? ` · zbritje ${formatEuro(trueDiscount)}` : ''}
                {profitManual ? ' · (ndryshuar me dorë)' : ''}. Transporti e paguan klienti (nuk
                ul fitimin).
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="field">
              <label>Kaparë (€)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input"
                value={kapare}
                onChange={(e) => setKapare(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Tarifa e transportit (€)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input"
                value={transportFee}
                onChange={(e) => setTransportFee(Number(e.target.value))}
              />
              <p className="mt-1 text-[11px] text-ink-500">
                E paguan klienti. Shtohet në totalin e faturës, jo në shpenzimet e dyqanit.
              </p>
            </div>
            <div className="field justify-end xl:col-span-2">
              <label className="flex items-center gap-3 pt-6 text-sm normal-case tracking-normal">
                <span
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    showTransportOnInvoice ? 'bg-brand-600' : 'bg-ink-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={showTransportOnInvoice}
                    onChange={(e) => setShowTransportOnInvoice(e.target.checked)}
                  />
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      showTransportOnInvoice ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </span>
                Shfaq transportin në faturë: {showTransportOnInvoice ? 'PO' : 'JO'}
              </label>
            </div>
            <div className="field md:col-span-2 xl:col-span-4">
              <label>Shënime shtesë</label>
              <textarea
                className="input min-h-[72px]"
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder={
                  isCustomJob
                    ? 'Detaje ekstra për punën e personalizuar…'
                    : 'Dimensionet e këndit / specifikimet…'
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!isCustomJob && (
              <button type="button" className="btn-secondary" onClick={previewLine}>
                Parashiko ndarjen e setit
              </button>
            )}
            <button type="submit" className="btn-primary">
              {editingOrderId
                ? 'Ruaj ndryshimet'
                : isCustomJob
                  ? 'Ruaj punën e personalizuar'
                  : 'Vendos porosinë'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setShowForm(false);
                resetFormMeta();
              }}
            >
              Anulo
            </button>
          </div>

          {breakdownPreview && (
            <div className="space-y-2">
              {breakdownPreview.warning ? (
                <SetBreakdownWarning
                  message={breakdownPreview.warning}
                  details={breakdownPreview.message}
                />
              ) : (
                <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
                  {breakdownPreview.message}
                </p>
              )}
              <p className="text-sm font-semibold text-ink-800">
                Sete të plota që do të mbeten:{' '}
                <span className="font-mono">{breakdownPreview.stockSetsAfter}</span>
              </p>
            </div>
          )}
        </form>
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Porosia</th>
              <th>Klienti</th>
              <th>Produktet</th>
              <th>Statusi</th>
              <th>Zbritja</th>
              <th>Kaparë</th>
              <th>Mbetja</th>
              <th>Fitimi</th>
              <th>Data</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-ink-500">
                  Nuk ka porosi në këtë kategori.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr key={order.id} className={rowTone(order.status)}>
                  <td className="font-mono text-xs">
                    {order.order_number}
                    {order.is_custom_job === 1 && (
                      <span
                        className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-800"
                        title="Punë e personalizuar - stoku nuk u prek"
                      >
                        Custom
                      </span>
                    )}
                    {order.set_break_warning === 1 && !order.is_custom_job && (
                      <span className="ml-2 text-accent" title={order.set_break_message}>
                        Kujdes: ndarje seti
                      </span>
                    )}
                  </td>
                  <td>{order.customer_name}</td>
                  <td className="max-w-[160px] truncate text-xs text-ink-700">
                    {order.item_names || '-'}
                  </td>
                  <td>
                    <select
                      className="input py-1 text-xs"
                      value={order.status}
                      onChange={(e) =>
                        updateStatus(order.id, e.target.value as OrderStatus)
                      }
                    >
                      {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((value) => (
                        <option key={value} value={value}>
                          {STATUS_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {(order.discount_total || 0) > 0 ? (
                      <span className="font-medium text-accent">
                        −{formatEuro(order.discount_total)}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{formatEuro(order.kapare)}</td>
                  <td>{formatEuro(order.remaining_balance)}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      className="input w-28 py-1 text-xs font-medium text-brand-700"
                      defaultValue={order.net_profit}
                      key={`${order.id}-${order.net_profit}`}
                      onBlur={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next) || next === order.net_profit) return;
                        updateProfit(order.id, next);
                      }}
                      title="Ndrysho fitimin dhe shtyp Enter / dil nga fusha"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </td>
                  <td>{formatDate(order.order_date)}</td>
                  <td className="text-right">
                    <div
                      className="relative inline-flex items-center gap-1"
                      ref={menuOpenId === order.id ? menuRef : undefined}
                    >
                      {order.status === 'Pending Delivery' && (
                        <button
                          type="button"
                          className="btn-secondary !px-2 !py-1 text-xs"
                          title="Ndrysho porosinë"
                          onClick={() => startEdit(order.id)}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <Link
                        to={`/invoices/${order.id}`}
                        className="btn-secondary !px-2 !py-1 text-xs"
                        title="Parashiko faturën"
                      >
                        <Eye size={14} />
                      </Link>
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1"
                        aria-label="Opsione"
                        onClick={() =>
                          setMenuOpenId((id) => (id === order.id ? null : order.id))
                        }
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpenId === order.id && (
                        <div className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-ink-200 bg-white py-1 shadow-panel">
                          {order.status === 'Pending Delivery' && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50"
                              onClick={() => startEdit(order.id)}
                            >
                              <Pencil size={14} />
                              Ndrysho
                            </button>
                          )}
                          <Link
                            to={`/invoices/${order.id}`}
                            className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50"
                            onClick={() => setMenuOpenId(null)}
                          >
                            <FileText size={14} />
                            Parashiko / Printo faturën
                          </Link>
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm text-accent hover:bg-accent-soft"
                            onClick={() => deleteOrder(order.id)}
                          >
                            Fshije porosine
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
