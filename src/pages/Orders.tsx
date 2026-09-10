import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileText, MoreVertical, Plus, Search } from 'lucide-react';
import { SetBreakdownWarning } from '../components/SetBreakdownWarning';
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

const TAB_META: Record<
  OrderTab,
  { label: string; status: OrderStatus; hint: string }
> = {
  pending: {
    label: 'Në pritje',
    status: 'Pending Delivery',
    hint: 'Porosi aktive — ende pa dorëzuar',
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

function rowTone(status: OrderStatus): string {
  if (status === 'Delivered') return 'bg-emerald-50/90 border-l-4 border-l-emerald-500';
  if (status === 'Pending Delivery') return 'bg-amber-50/90 border-l-4 border-l-amber-400';
  return 'bg-white border-l-4 border-l-ink-200';
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
  const [priceManual, setPriceManual] = useState(false);
  const [fairManual, setFairManual] = useState(false);
  const [profitManual, setProfitManual] = useState(false);
  const [manualProfit, setManualProfit] = useState<number | null>(null);
  const [breakdownPreview, setBreakdownPreview] = useState<SetBreakdownPreview | null>(
    null
  );
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

  const [orderForm, setOrderForm] = useState({
    inventory_item_id: 0,
    set_format_requested: '3-3-1',
    quantity: 1,
    entitled_price: 0,
    unit_price: 0,
    kapare: 0,
    transport_fee: 0,
    show_transport_on_invoice: true,
    custom_notes: '',
  });

  const selectedItem = items.find((i) => i.id === orderForm.inventory_item_id);
  const catalogPrice = selectedItem?.selling_price ?? 0;

  const priceHint = useMemo(() => {
    if (!selectedItem) return null;
    try {
      return suggestUnitPrice(
        catalogPrice,
        selectedItem.set_format,
        orderForm.set_format_requested
      );
    } catch {
      return null;
    }
  }, [selectedItem, catalogPrice, orderForm.set_format_requested]);

  const entitledPrice = priceHint?.entitled ?? catalogPrice;
  const trueDiscount = customerDiscount(
    orderForm.entitled_price || entitledPrice,
    orderForm.unit_price,
    orderForm.quantity
  );

  const calculatedCost = useMemo(() => {
    if (!selectedItem) return 0;
    try {
      return (
        suggestUnitPrice(
          selectedItem.cost_price,
          selectedItem.set_format,
          orderForm.set_format_requested
        ).entitled * orderForm.quantity
      );
    } catch {
      return selectedItem.cost_price * orderForm.quantity;
    }
  }, [selectedItem, orderForm.set_format_requested, orderForm.quantity]);

  const calculatedRevenue = orderForm.unit_price * orderForm.quantity;
  const calculatedProfit =
    calculatedRevenue - calculatedCost - (orderForm.transport_fee || 0);
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

  function applySuggestedPrice(
    item: InventoryItem,
    format: string,
    force = false
  ) {
    if (priceManual && fairManual && !force) return;
    try {
      const s = suggestUnitPrice(item.selling_price, item.set_format, format);
      setOrderForm((f) => ({
        ...f,
        entitled_price: fairManual ? f.entitled_price : s.entitled,
        unit_price: priceManual ? f.unit_price : s.entitled,
      }));
    } catch {
      setOrderForm((f) => ({
        ...f,
        entitled_price: fairManual ? f.entitled_price : item.selling_price,
        unit_price: priceManual ? f.unit_price : item.selling_price,
      }));
    }
  }

  async function load() {
    if (!hasErpBridge()) {
      setError('Ura e Electron nuk është aktive — hapni me npm run electron:dev');
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
    if (i[0]) {
      setOrderForm((f) => {
        const id = f.inventory_item_id || i[0].id;
        const item = i.find((x) => x.id === id) || i[0];
        const format = f.set_format_requested || item.set_format;
        let unit = f.unit_price;
        let fair = f.entitled_price;
        let suggested = item.selling_price;
        try {
          suggested = suggestUnitPrice(item.selling_price, item.set_format, format).entitled;
        } catch {
          suggested = item.selling_price;
        }
        if (!f.inventory_item_id || !f.unit_price) {
          unit = suggested;
        }
        if (!f.inventory_item_id || !f.entitled_price) {
          fair = suggested;
        }
        return {
          ...f,
          inventory_item_id: id,
          set_format_requested: format,
          entitled_price: fair,
          unit_price: unit,
        };
      });
    }
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

  async function previewLine() {
    if (!hasErpBridge() || !orderForm.inventory_item_id) return;
    const result = await window.erp.inventory.previewBreakdown({
      inventory_item_id: orderForm.inventory_item_id,
      set_format_requested: orderForm.set_format_requested,
      quantity: orderForm.quantity,
    });
    setBreakdownPreview(result);
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

      const order = await window.erp.orders.create({
        customer_id: Number(cid),
        kapare: Number(orderForm.kapare),
        transport_fee: Number(orderForm.transport_fee),
        show_transport_on_invoice: orderForm.show_transport_on_invoice,
        custom_notes: orderForm.custom_notes,
        net_profit: Number(displayProfit),
        items: [
          {
            inventory_item_id: orderForm.inventory_item_id,
            set_format_requested: orderForm.set_format_requested,
            quantity: orderForm.quantity,
            entitled_price: Number(orderForm.entitled_price || entitledPrice),
            unit_price: Number(orderForm.unit_price),
          },
        ],
      });

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
      setPriceManual(false);
      setFairManual(false);
      setProfitManual(false);
      setManualProfit(null);
      setTab('pending');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nuk u krijua porosia');
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
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setShowForm((v) => !v);
            setPriceManual(false);
            setFairManual(false);
            setProfitManual(false);
            setManualProfit(null);
          }}
        >
          <Plus size={16} />
          Porosi e re
        </button>
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
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={useNewCustomer}
                onChange={() => setUseNewCustomer(true)}
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

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="field md:col-span-2">
              <label>Artikulli nga inventari</label>
              <select
                className="input"
                required
                value={orderForm.inventory_item_id}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const item = items.find((x) => x.id === id);
                  if (!item) return;
                  setPriceManual(false);
                  setFairManual(false);
                  const format = item.set_format;
                  const fair = suggestUnitPrice(
                    item.selling_price,
                    item.set_format,
                    format
                  ).entitled;
                  setOrderForm({
                    ...orderForm,
                    inventory_item_id: id,
                    set_format_requested: format,
                    entitled_price: fair,
                    unit_price: fair,
                  });
                }}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.set_format} · {item.stock_sets} sete të plota
                    {item.leftover_pieces ? ' + mbetje' : ''}
                  </option>
                ))}
              </select>
              {selectedItem?.notes && (
                <p className="mt-1 text-xs text-ink-500">{selectedItem.notes}</p>
              )}
            </div>
            <div className="field">
              <label>Formati i kërkuar i setit</label>
              <input
                className="input font-mono"
                required
                value={orderForm.set_format_requested}
                onChange={(e) => {
                  const format = e.target.value;
                  setOrderForm((f) => ({ ...f, set_format_requested: format }));
                  if (selectedItem) applySuggestedPrice(selectedItem, format);
                }}
                onBlur={() => {
                  if (selectedItem) {
                    applySuggestedPrice(selectedItem, orderForm.set_format_requested);
                    previewLine().catch(() => undefined);
                  }
                }}
              />
            </div>
            <div className="field">
              <label>Sasia</label>
              <input
                type="number"
                min={1}
                className="input"
                value={orderForm.quantity}
                onChange={(e) =>
                  setOrderForm({ ...orderForm, quantity: Number(e.target.value) })
                }
              />
            </div>
          </div>

          {/* Pricing panel */}
          <div className="rounded-xl border border-ink-200 bg-ink-50/80 p-4">
            <h3 className="text-sm font-semibold text-ink-900">
              Çmimi i justë vs zbritja e klientit
            </h3>
            <p className="mt-1 text-xs text-ink-600">
              Nëse klienti merr set më të vogël (p.sh. 3-1 nga 3-3-1), çmimi ulet sepse ashtu
              vlen ai kombinim — kjo nuk është zbritje. Zbritja është vetëm kur e shitni më lirë
              se çmimi i justë (favor për klientin).
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="field">
                <label>Çmimi i setit të plotë (inventar)</label>
                <input
                  className="input bg-white"
                  disabled
                  value={formatEuro(catalogPrice)}
                />
              </div>
              <div className="field">
                <label>Çmimi i justë për këtë format</label>
                <div className="flex gap-2">
                  <input
                    className="input bg-white"
                    type="number"
                    min={0}
                    step="0.01"
                    value={orderForm.entitled_price || entitledPrice}
                    onChange={(e) => {
                      setFairManual(true);
                      setOrderForm((f) => ({
                        ...f,
                        entitled_price: Number(e.target.value),
                      }));
                    }}
                  />
                  <button
                    type="button"
                    className="btn-secondary shrink-0 !px-3"
                    onClick={() => {
                      const fair = entitledPrice;
                      setFairManual(false);
                      setPriceManual(false);
                      setOrderForm((f) => ({
                        ...f,
                        entitled_price: fair,
                        unit_price: fair,
                      }));
                    }}
                  >
                    Përdor
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 text-xs"
                    onClick={() =>
                      setOrderForm((f) => ({
                        ...f,
                        entitled_price: roundDownToStep(f.entitled_price || entitledPrice, 50),
                      }))
                    }
                  >
                    Rrumb. poshtë 50
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 text-xs"
                    onClick={() =>
                      setOrderForm((f) => ({
                        ...f,
                        entitled_price: roundToNearestStep(
                          f.entitled_price || entitledPrice,
                          50
                        ),
                      }))
                    }
                  >
                    Rrumb. afër 50
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 text-xs"
                    onClick={() =>
                      setOrderForm((f) => ({
                        ...f,
                        entitled_price: roundUpToStep(f.entitled_price || entitledPrice, 50),
                      }))
                    }
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
                  value={orderForm.unit_price}
                  onChange={(e) => {
                    setPriceManual(true);
                    setOrderForm({
                      ...orderForm,
                      unit_price: Number(e.target.value),
                    });
                  }}
                />
              </div>
              <div className="field">
                <label>Zbritja e klientit</label>
                <p
                  className={`input flex items-center bg-white font-medium ${
                    trueDiscount > 0 ? 'text-accent' : 'text-ink-600'
                  }`}
                >
                  {trueDiscount > 0
                    ? `−${formatEuro(trueDiscount)}`
                    : 'Pa zbritje (çmim i justë ose më lart)'}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-lg border border-brand-200 bg-brand-50/70 p-3 md:grid-cols-3">
              <div className="field">
                <label>Kostoja e justë (për këtë format)</label>
                <input className="input bg-white" disabled value={formatEuro(calculatedCost)} />
              </div>
              <div className="field">
                <label>Të ardhurat nga shitja</label>
                <input
                  className="input bg-white"
                  disabled
                  value={formatEuro(calculatedRevenue)}
                />
              </div>
              <div className="field">
                <label>Fitimi i kësaj porosie (€)</label>
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
                  Auto: shitja − kostoja e justë − transporti = {formatEuro(calculatedProfit)}
                  {profitManual ? ' · (ndryshuar me dorë)' : ''}
                </p>
              </div>
            </div>

            {priceHint && (
              <p className="mt-3 text-xs text-ink-700">{priceHint.note}</p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="field">
              <label>Kaparë (€)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input"
                value={orderForm.kapare}
                onChange={(e) =>
                  setOrderForm({ ...orderForm, kapare: Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label>Tarifa e transportit (€)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input"
                value={orderForm.transport_fee}
                onChange={(e) =>
                  setOrderForm({
                    ...orderForm,
                    transport_fee: Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="field justify-end xl:col-span-2">
              <label className="flex items-center gap-3 pt-6 text-sm normal-case tracking-normal">
                <span
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    orderForm.show_transport_on_invoice ? 'bg-brand-600' : 'bg-ink-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={orderForm.show_transport_on_invoice}
                    onChange={(e) =>
                      setOrderForm({
                        ...orderForm,
                        show_transport_on_invoice: e.target.checked,
                      })
                    }
                  />
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      orderForm.show_transport_on_invoice
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </span>
                Shfaq transportin në faturë:{' '}
                {orderForm.show_transport_on_invoice ? 'PO' : 'JO'}
              </label>
            </div>
            <div className="field md:col-span-2 xl:col-span-4">
              <label>Shënime — Këndë me dimensione</label>
              <textarea
                className="input min-h-[72px]"
                value={orderForm.custom_notes}
                onChange={(e) =>
                  setOrderForm({ ...orderForm, custom_notes: e.target.value })
                }
                placeholder="Dimensionet e këndit / specifikimet…"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={previewLine}>
              Parashiko ndarjen e setit
            </button>
            <button type="submit" className="btn-primary">
              Vendos porosinë
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowForm(false)}
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
                    {order.set_break_warning === 1 && (
                      <span className="ml-2 text-accent" title={order.set_break_message}>
                        ⚠ ndarje seti
                      </span>
                    )}
                  </td>
                  <td>{order.customer_name}</td>
                  <td className="max-w-[160px] truncate text-xs text-ink-700">
                    {order.item_names || '—'}
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
                      '—'
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
