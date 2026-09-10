/**
 * Inventory management page: list/search stock, create/edit/delete items,
 * and preview how selling a custom set format would break full sets into leftovers.
 *
 * Major blocks: load, create/edit form submit, set-breakdown preview, table rendering.
 */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ImagePlus, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { SetBreakdownWarning } from '../components/SetBreakdownWarning';
import { ProductThumb } from '../components/ProductThumb';
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
  leftover_pieces: '',
  cost_price: 0,
  selling_price: 0,
  notes: '',
};

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [previewItemId, setPreviewItemId] = useState<number | ''>('');
  const [previewFormat, setPreviewFormat] = useState('3-3-3-1');
  const [previewQty, setPreviewQty] = useState(1);
  const [preview, setPreview] = useState<SetBreakdownPreview | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string | undefined>(undefined);
  const [existingImagePath, setExistingImagePath] = useState<string>('');
  const [clearImage, setClearImage] = useState(false);

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  // Client-side filter across name, SKU, notes, category, and set format.
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

  // --- Load ---
  async function load() {
    if (!hasErpBridge()) {
      setError('Ura e Electron nuk është aktive - hapni me npm run electron:dev');
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

  function resetImageState() {
    setImagePreview(null);
    setImageBase64(null);
    setImageMime(undefined);
    setExistingImagePath('');
    setClearImage(false);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, category_id: categories[0]?.id || 0 });
    resetImageState();
    setShowForm(true);
    setError(null);
  }

  async function openEdit(item: InventoryItem) {
    setEditingId(item.id);
    setForm({
      sku: item.sku,
      name: item.name,
      category_id: item.category_id,
      set_format: item.set_format,
      stock_sets: item.stock_sets,
      leftover_pieces: item.leftover_pieces || '',
      cost_price: item.cost_price,
      selling_price: item.selling_price,
      notes: item.notes || '',
    });
    setImageBase64(null);
    setImageMime(undefined);
    setClearImage(false);
    setExistingImagePath(item.image_path || '');
    setImagePreview(null);
    if (item.image_path && hasErpBridge()) {
      const data = await window.erp.inventory.getImage({
        image_path: item.image_path,
        id: item.id,
      });
      setImagePreview(data);
    }
    setShowForm(true);
    setError(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm, category_id: categories[0]?.id || 0 });
    resetImageState();
  }

  async function onPickImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Zgjidhni një skedar foto (JPG, PNG, WEBP)');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Fotoja duhet të jetë nën 8MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setImagePreview(result);
      setImageBase64(result);
      setImageMime(file.type);
      setClearImage(false);
    };
    reader.readAsDataURL(file);
  }

  // --- Form submit (create or update) ---
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasErpBridge()) return;
    try {
      const leftover = form.leftover_pieces.trim();
      if (leftover) {
        JSON.parse(leftover);
      }

      const payload = {
        sku: form.sku,
        name: form.name,
        category_id: Number(form.category_id),
        set_format: form.set_format,
        stock_sets: Number(form.stock_sets),
        leftover_pieces: leftover || '',
        cost_price: Number(form.cost_price),
        selling_price: Number(form.selling_price),
        notes: form.notes,
        ...(imageBase64
          ? { image_base64: imageBase64, image_mime: imageMime }
          : {}),
        ...(editingId != null && clearImage ? { clear_image: true } : {}),
      };

      if (editingId != null) {
        await window.erp.inventory.update({ id: editingId, ...payload });
      } else {
        await window.erp.inventory.create(payload);
      }

      closeForm();
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editingId != null
            ? 'Nuk u përditësua artikulli'
            : 'Nuk u ruajt artikulli'
      );
    }
  }

  async function removeItem(item: InventoryItem) {
    if (!hasErpBridge()) return;
    const ok = window.confirm(
      `Fshi artikullin "${item.name}" nga inventari?\n\nNuk fshihet nga historiku i porosive, por nuk shfaqet më në listë.`
    );
    if (!ok) return;
    try {
      await window.erp.inventory.remove(item.id);
      if (editingId === item.id) closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nuk u fshi artikulli');
    }
  }

  // --- Set-breakdown preview (dry-run stock impact) ---
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
            Shto, ndrysho stokun / çmimet, ose fshi artikuj · mbetjet ruhen si JSON
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => load()}>
            <RefreshCw size={16} />
            Rifresko
          </button>
          <button type="button" className="btn-primary" onClick={openCreate}>
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

      {/* Create / edit form */}
      {showForm && (
        <form onSubmit={onSubmit} className="panel grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2 xl:col-span-4">
            <h3 className="text-lg font-semibold">
              {editingId != null ? 'Ndrysho artikullin' : 'Artikull i ri'}
            </h3>
          </div>
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
            <label htmlFor="set_format">Formati i setit (ose metra për kënd)</label>
            <input
              id="set_format"
              className="input font-mono"
              required
              value={form.set_format}
              onChange={(e) => setForm({ ...form, set_format: e.target.value })}
              placeholder="3-3-1 ose 3.2-3.2"
            />
            <p className="mt-1 text-[11px] text-ink-500">
              Decimale të lejuara: 3.2-3.2 = 3.2 m + 3.2 m
            </p>
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
            <label htmlFor="leftover_pieces">Mbetje (JSON, opsionale)</label>
            <input
              id="leftover_pieces"
              className="input font-mono text-xs"
              value={form.leftover_pieces}
              onChange={(e) => setForm({ ...form, leftover_pieces: e.target.value })}
              placeholder='p.sh. {"3":1,"1":2}'
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
          <div className="field md:col-span-2 xl:col-span-4">
            <label htmlFor="product-photo">Foto e produktit</label>
            <p className="mb-2 text-xs text-ink-500">
              Ndihmon kur artikujt kanë të njëjtin emër por duken ndryshe (JPG/PNG, max 8MB).
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {imagePreview && !clearImage ? (
                <img
                  src={imagePreview}
                  alt="Parapamje"
                  className="h-24 w-24 rounded-md object-cover ring-1 ring-ink-200"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-md bg-ink-100 text-ink-400">
                  <ImagePlus size={22} />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <label className="btn-secondary cursor-pointer">
                  <ImagePlus size={16} />
                  Zgjidh foto
                  <input
                    id="product-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => onPickImage(e.target.files?.[0] || null)}
                  />
                </label>
                {(imagePreview || existingImagePath) && !clearImage && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setClearImage(true);
                      setImagePreview(null);
                      setImageBase64(null);
                    }}
                  >
                    <X size={16} />
                    Hiq foton
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 md:col-span-2 xl:col-span-4">
            <button type="submit" className="btn-primary">
              {editingId != null ? 'Ruaj ndryshimet' : 'Ruaj në inventar'}
            </button>
            <button type="button" className="btn-ghost" onClick={closeForm}>
              Anulo
            </button>
          </div>
        </form>
      )}

      {/* Set-breakdown preview panel */}
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

      {/* Inventory table */}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Foto</th>
              <th>SKU</th>
              <th>Emri</th>
              <th>Kategoria</th>
              <th>Seti</th>
              <th>Sete të plota</th>
              <th>Mbetje</th>
              <th>Kostoja</th>
              <th>Lista</th>
              <th>Margjina</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-ink-500">
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
                    <td>
                      <ProductThumb
                        imagePath={item.image_path}
                        itemId={item.id}
                        alt={item.name}
                        size={44}
                      />
                    </td>
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
                      {leftovers || '-'}
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
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost !px-2 !py-1"
                          title="Ndrysho"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost !px-2 !py-1 text-accent"
                          title="Fshi"
                          onClick={() => removeItem(item)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
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
