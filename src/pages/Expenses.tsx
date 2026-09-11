/**
 * Shop expenses page: quick Nafte (gas) entry plus free-text expenses with amounts.
 * Expenses reduce dashboard net profit for the month.
 */
import { FormEvent, useEffect, useState } from 'react';
import { Fuel, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatDate, formatEuro, hasErpBridge } from '../lib/format';
import type { Expense } from '../../electron/types';

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    category: 'Naftë',
    description: '',
    amount: 0,
  });

  async function load() {
    if (!hasErpBridge()) {
      setError('Ura e Electron nuk është aktive - hapni me npm run electron:dev');
      return;
    }
    setError(null);
    setExpenses(await window.erp.expenses.list());
  }

  useEffect(() => {
    load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : 'Dështoi ngarkimi i shpenzimeve')
    );
  }, []);

  function resetForm() {
    setEditingId(null);
    setForm({ category: 'Naftë', description: '', amount: 0 });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasErpBridge()) return;
    try {
      if (editingId != null) {
        await window.erp.expenses.update({
          id: editingId,
          category: form.category,
          description: form.description,
          amount: Number(form.amount),
        });
      } else {
        await window.erp.expenses.create({
          category: form.category,
          description: form.description,
          amount: Number(form.amount),
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nuk u ruajt shpenzimi');
    }
  }

  async function remove(id: number) {
    if (!hasErpBridge()) return;
    if (!window.confirm('Fshi këtë shpenzim?')) return;
    await window.erp.expenses.delete(id);
    if (editingId === id) resetForm();
    await load();
  }

  const monthTotal = expenses
    .filter((x) => {
      const d = new Date(x.expense_date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, x) => s + (x.amount || 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold">Shpenzimet</h2>
        <p className="mt-1 text-ink-600">
          Naftë dhe shpenzime të tjera. Zbriten nga fitimi neto në panel.
        </p>
        <p className="mt-2 text-sm font-medium text-ink-800">
          Totali i këtij muaji: {formatEuro(monthTotal)}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="panel grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2 xl:col-span-4">
          <h3 className="text-lg font-semibold">
            {editingId != null ? 'Ndrysho shpenzimin' : 'Shpenzim i ri'}
          </h3>
        </div>
        <div className="field">
          <label>Kategoria</label>
          <select
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="Naftë">Naftë</option>
            <option value="Tjetër">Tjetër</option>
          </select>
        </div>
        <div className="field md:col-span-2">
          <label>Përshkrimi</label>
          <input
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={
              form.category === 'Naftë'
                ? 'P.sh. naftë për dorëzim'
                : 'Çfarë shpenzimi është…'
            }
          />
        </div>
        <div className="field">
          <label>Shuma (€)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            required
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
          <button type="submit" className="btn-primary">
            {form.category === 'Naftë' ? <Fuel size={16} /> : <Plus size={16} />}
            {editingId != null ? 'Ruaj ndryshimet' : 'Shto shpenzimin'}
          </button>
          {editingId != null && (
            <button type="button" className="btn-ghost" onClick={resetForm}>
              Anulo
            </button>
          )}
        </div>
      </form>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Kategoria</th>
              <th>Përshkrimi</th>
              <th>Shuma</th>
              <th>Data</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-ink-500">
                  Nuk ka shpenzime ende.
                </td>
              </tr>
            ) : (
              expenses.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.category}</td>
                  <td className="text-ink-700">{row.description || '-'}</td>
                  <td className="font-semibold">{formatEuro(row.amount)}</td>
                  <td className="text-sm text-ink-600">{formatDate(row.expense_date)}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1"
                        title="Ndrysho"
                        onClick={() => {
                          setEditingId(row.id);
                          setForm({
                            category: row.category,
                            description: row.description || '',
                            amount: row.amount,
                          });
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1 text-accent"
                        title="Fshi"
                        onClick={() => remove(row.id)}
                      >
                        <Trash2 size={16} />
                      </button>
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
