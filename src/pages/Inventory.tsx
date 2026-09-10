import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { SetBreakdownWarning } from '../components/SetBreakdownWarning';
import {
  formatEuro,
  formatLeftovers,
  formatPercent,
  hasErpBridge,
  marginInfo,
} from '../lib/format';
import { categoryLabel } from '../lib/labels';
import type { Category, InventoryItem, SetBreakdownPreview } from '../../electron/types';

const emptyForm = {
  sku: '',
  name: '',
  category_id: 0,
  set_format: '3-3-1',
  stock_sets: 1,
  cost_price: 0,
  selling_price: 0,
  notes: '',
};

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [previewItemId, setPreviewItemId] = useState<number | ''>('');
  const [previewFormat, setPreviewFormat] = useState('3-3-3-1');
  const [previewQty, setPreviewQty] = useState(1);
  const [preview, setPreview] = useState<SetBreakdownPreview | null>(null);

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.notes || '').toLowerCase().includes(q) ||
        (item.category_name || '').toLowerCase().includes(q) ||
        item.set_format.includes(q)
    );
  }, [items, search]);

  async function load() {
    if (!hasErpBridge()) {
      setError('Ura e Electron nuk është aktive — hapni me npm run electron:dev');
      return;
    }
    setError(null);
    const [cats, list] = await Promise.all([
      window.erp.categories.list(),
      window.erp.inventory.list(),
    ]);
    setCategories(cats);
    setItems(list);
    setForm((f) => ({
      ...f,
      category_id: f.category_id || cats[0]?.id || 0,
    }));
  }

  useEffect(() => {
    load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : 'Dështoi ngarkimi i inventarit')
    );
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasErpBridge()) return;
    try {
      await window.erp.inventory.create({
        ...form,
        category_id: Number(form.category_id),
        stock_sets: Number(form.stock_sets),
        cost_price: Number(form.cost_price),
        selling_price: Number(form.selling_price),
      });
      setForm({ ...emptyForm, category_id: categories[0]?.id || 0 });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nuk u ruajt artikulli');
    }
  }

  async function runPreview() {
    if (!hasErpBridge() || !previewItemId) return;
    try {
      const result = await window.erp.inventory.previewBreakdown({
        inventory_item_id: Number(previewItemId),
        set_format_requested: previewFormat,
        quantity: previewQty,
      });
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parashikimi dështoi');
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold">Inventari</h2>
          <p className="mt-1 text-ink-600">
            Specifikimet shkruhen te përshkrimi · stoku tregon sete të plota + mbetje
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => load()}>
            <RefreshCw size={16} />
            Rifresko
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus size={16} />
            Shto artikull
          </button>
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
        />
        <input
          className="input pl-9"
          placeholder="Kërko sipas emrit, SKU, përshkrimit / specifikimeve…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={onSubmit} className="panel grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="field">
            <label htmlFor="sku">Kodi (SKU)</label>
            <input
              id="sku"
              className="input"
              required
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
            />
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="name">Emri</label>
            <input
              id="name"
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Set divani Milano"
            />
          </div>
          <div className="field">
            <label htmlFor="category">Kategoria</label>
            <select
              id="category"
              className="input"
              required
              value={form.category_id}
              onChange={(e) =>
                setForm({ ...form, category_id: Number(e.target.value) })
              }
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c.name)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="set_format">Formati i setit</label>
            <input
              id="set_format"
              className="input font-mono"
              required
              value={form.set_format}
              onChange={(e) => setForm({ ...form, set_format: e.target.value })}
              placeholder="3-3-1"
            />
          </div>
          <div className="field">
            <label htmlFor="stock_sets">Stoku (sete të plota)</label>
            <input
              id="stock_sets"
              type="number"
              min={0}
              className="input"
              required
              value={form.stock_sets}
              onChange={(e) =>
                setForm({ ...form, stock_sets: Number(e.target.value) })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="cost_price">Kostoja e furnitorit (€)</label>
            <input
              id="cost_price"
              type="number"
              min={0}
              step="0.01"
              className="input"
              required
              value={form.cost_price}
              onChange={(e) =>
                setForm({ ...form, cost_price: Number(e.target.value) })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="selling_price">Çmimi i listës (€ me TVSH)</label>
            <input
              id="selling_price"
              type="number"
              min={0}
              step="0.01"
              className="input"
              required
              value={form.selling_price}
              onChange={(e) =>
                setForm({ ...form, selling_price: Number(e.target.value) })
              }
            />
          </div>
          <div className="field md:col-span-2 xl:col-span-4">
            <label htmlFor="notes">Përshkrimi / Specifikimet</label>
            <textarea
              id="notes"
              className="input min-h-[72px]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Materiali, ngjyra, dimensionet, specifikimet…"
            />
          </div>
          <div className="flex gap-2 md:col-span-2 xl:col-span-4">
            <button type="submit" className="btn-primary">
              Ruaj në inventar
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowForm(false)}
            >
              Anulo
            </button>
          </div>
        </form>
      )}

      <section className="panel p-5">
        <h3 className="text-lg font-semibold">Parashikimi i ndarjes së setit</h3>
        <p className="mt-1 text-sm text-ink-600">
          Simuloni shitjen e një kombinimi të personalizuar. Pas porosise, stoku i seteve të
          plota përditësohet automatikisht.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="field md:col-span-2">
            <label htmlFor="preview-item">Artikulli</label>
            <select
              id="preview-item"
              className="input"
              value={previewItemId}
              onChange={(e) =>
                setPreviewItemId(e.target.value ? Number(e.target.value) : '')
              }
            >
              <option value="">Zgjidhni artikullin…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.set_format}) · {item.stock_sets} sete të plota
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="preview-format">Formati i kërkuar</label>
            <input
              id="preview-format"
              className="input font-mono"
              value={previewFormat}
              onChange={(e) => setPreviewFormat(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="preview-qty">Sasia</label>
            <input
              id="preview-qty"
              type="number"
              min={1}
              className="input"
              value={previewQty}
              onChange={(e) => setPreviewQty(Number(e.target.value))}
            />
          </div>
        </div>
        <button type="button" className="btn-secondary mt-3" onClick={runPreview}>
          Llogarit ndarjen
        </button>
        {preview && (
          <div className="mt-4 space-y-2">
            {preview.warning ? (
              <SetBreakdownWarning
                message={preview.warning}
                details={preview.message}
              />
            ) : (
              <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
                {preview.message}
              </p>
            )}
            <p className="text-sm font-medium text-ink-800">
              Pas shitjes: <span className="font-mono">{preview.stockSetsAfter}</span> sete të
              plota
              {Object.keys(preview.leftoverAfter || {}).length > 0 && (
                <>
                  {' '}
                  · mbetje:{' '}
                  <span className="font-mono">
                    {formatLeftovers(JSON.stringify(preview.leftoverAfter))}
                  </span>
                </>
              )}
            </p>
          </div>
        )}
      </section>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Emri</th>
              <th>Kategoria</th>
              <th>Seti</th>
              <th>Sete të plota</th>
              <th>Mbetje</th>
              <th>Kostoja</th>
              <th>Lista</th>
              <th>Margjina</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-ink-500">
                  {items.length === 0
                    ? 'Nuk ka artikuj ende.'
                    : 'Asnjë rezultat për kërkimin.'}
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const { amount, percent } = marginInfo(
                  item.selling_price,
                  item.cost_price
                );
                const catName = item.category_name || categoryMap[item.category_id] || '';
                const leftovers = formatLeftovers(item.leftover_pieces);
                return (
                  <tr key={item.id}>
                    <td className="font-mono text-xs">{item.sku}</td>
                    <td>
                      <div className="font-medium">{item.name}</div>
                      {item.notes && (
                        <div className="mt-0.5 max-w-xs truncate text-xs text-ink-500">
                          {item.notes}
                        </div>
                      )}
                    </td>
                    <td>{categoryLabel(catName)}</td>
                    <td className="font-mono">{item.set_format}</td>
                    <td className="font-mono font-semibold">{item.stock_sets}</td>
                    <td className="font-mono text-xs text-ink-600">
                      {leftovers || '—'}
                    </td>
                    <td>{formatEuro(item.cost_price)}</td>
                    <td>{formatEuro(item.selling_price)}</td>
                    <td
                      className={
                        amount >= 0 ? 'text-brand-700 font-medium' : 'text-accent font-medium'
                      }
                    >
                      {formatEuro(amount)}
                      <span className="ml-1 text-xs text-ink-500">
                        ({formatPercent(percent)})
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
