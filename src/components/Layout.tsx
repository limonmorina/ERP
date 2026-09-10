/**
 * Application shell: brand sidebar, navigation, DB backup control, and page outlet.
 * Sidebar/header use `no-print` so they hide when printing A4 invoices.
 */
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  DatabaseBackup,
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import logo from '../assets/logo.png';

const nav = [
  { to: '/', label: 'Paneli', icon: LayoutDashboard, end: true },
  { to: '/inventory', label: 'Inventari', icon: Package },
  { to: '/orders', label: 'Porositë', icon: ShoppingCart },
];

export function AppLayout() {
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  /** Trigger Electron IPC backup of the SQLite database file. */
  async function runBackup() {
    if (!window.erp) return;
    setBackingUp(true);
    setBackupMsg(null);
    try {
      const result = await window.erp.backup.run();
      setBackupMsg(
        result.success
          ? `Backup u ruajt: ${result.path}`
          : `Backup dështoi: ${result.error}`
      );
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Backup dështoi');
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <div className="flex h-full min-h-screen">
      <aside className="no-print flex w-60 shrink-0 flex-col border-r border-brand-900/20 bg-brand-950 text-brand-50">
        <div className="border-b border-white/10 px-5 py-5">
          <img
            src={logo}
            alt="HSM Furniture"
            className="h-14 w-14 rounded-md object-cover shadow-sm ring-1 ring-white/10"
          />
          <p className="mt-3 font-display text-xl font-semibold leading-tight text-white">
            HSM Furniture
          </p>
          <p className="mt-1 text-xs text-brand-300">ERP Desktop · TVSH 18%</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-brand-200 hover:bg-white/5 hover:text-white'
                )
              }
            >
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-white/10 p-4">
          <button
            type="button"
            className="btn w-full border border-white/15 bg-white/5 text-brand-50 hover:bg-white/10"
            onClick={runBackup}
            disabled={backingUp}
          >
            <DatabaseBackup size={16} />
            {backingUp ? 'Duke bërë backup…' : 'Backup i DB'}
          </button>
          {backupMsg && (
            <p className="break-all text-[10px] leading-snug text-brand-300">{backupMsg}</p>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between border-b border-ink-200/80 bg-white/70 px-8 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt=""
              className="hidden h-10 w-10 rounded object-cover shadow-sm sm:block"
            />
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">
                HSM Furniture · Kosovë
              </p>
              <h1 className="font-display text-2xl font-semibold text-ink-950">
                Konsola e operimeve
              </h1>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
