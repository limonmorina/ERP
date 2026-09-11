/**
 * Financial overview dashboard.
 * Loads analytics via Electron IPC and renders KPI cards plus discount,
 * top-sellers, returns, and delivery-status tables.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Wallet,
  PackageCheck,
  RotateCcw,
  Percent,
  Boxes,
  Fuel,
} from 'lucide-react';
import { formatDate, formatEuro, hasErpBridge } from '../lib/format';
import { statusLabel } from '../lib/labels';
import type { DashboardMetrics } from '../../electron/types';

/** Placeholder until the first successful analytics.dashboard() call. */
const emptyMetrics: DashboardMetrics = {
  monthlyRevenue: 0,
  netProfit: 0,
  orderProfit: 0,
  monthlyExpenses: 0,
  monthlyDiscount: 0,
  inventoryWorth: 0,
  topSellingSets: [],
  deliveries: [],
  returnedItems: [],
  discountLog: [],
  recentExpenses: [],
};

export function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [error, setError] = useState<string | null>(null);

  // Load dashboard metrics once on mount (requires Electron preload bridge).
  useEffect(() => {
    if (!hasErpBridge()) {
      setError('Ura e Electron nuk është aktive - hapni me npm run electron:dev.');
      return;
    }
    window.erp.analytics
      .dashboard()
      .then(setMetrics)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Dështoi ngarkimi i panelit')
      );
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold text-ink-950">Pasqyra financiare</h2>
        <p className="mt-1 text-ink-600">
          Stoku hiqet kur hapet porosia (Në pritje). Të ardhurat, fitimi dhe zbritjet
          numërohen vetëm kur statusi është <strong>E dorëzuar</strong>. Nëse e ktheni në
          pritje, nuk shfaqen më në panel. Kthimi rikthen stokun dhe e heq nga paneli.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700">
          {error}
        </div>
      )}

      {/* KPI summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={<Wallet size={18} />}
          label="Të ardhurat mujore"
          value={formatEuro(metrics.monthlyRevenue)}
        />
        <MetricCard
          icon={<TrendingUp size={18} />}
          label="Fitimi neto"
          value={formatEuro(metrics.netProfit)}
          accent
        />
        <MetricCard
          icon={<Fuel size={18} />}
          label="Shpenzimet mujore"
          value={formatEuro(metrics.monthlyExpenses)}
        />
        <MetricCard
          icon={<Percent size={18} />}
          label="Zbritja (mujore)"
          value={formatEuro(metrics.monthlyDiscount)}
        />
        <MetricCard
          icon={<Boxes size={18} />}
          label="Vlera e inventarit"
          value={formatEuro(metrics.inventoryWorth)}
        />
        <MetricCard
          icon={<PackageCheck size={18} />}
          label="Dorëzime aktive"
          value={String(
            metrics.deliveries.filter((d) => d.status === 'Pending Delivery').length
          )}
        />
        <MetricCard
          icon={<RotateCcw size={18} />}
          label="Artikuj të kthyer"
          value={String(metrics.returnedItems.length)}
        />
      </div>

      {metrics.recentExpenses.length > 0 && (
        <section className="panel p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Shpenzimet e muajit</h3>
              <p className="mt-1 text-sm text-ink-600">
                Fitimi i porosive {formatEuro(metrics.orderProfit)} - shpenzimet{' '}
                {formatEuro(metrics.monthlyExpenses)} = neto {formatEuro(metrics.netProfit)}
              </p>
            </div>
            <Link to="/expenses" className="btn-secondary text-sm">
              Menaxho shpenzimet
            </Link>
          </div>
          <div className="mt-4 table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Kategoria</th>
                  <th>Përshkrimi</th>
                  <th>Shuma</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recentExpenses.map((row) => (
                  <tr key={row.id}>
                    <td>{row.category}</td>
                    <td className="text-ink-600">{row.description || '-'}</td>
                    <td className="font-medium">{formatEuro(row.amount)}</td>
                    <td className="text-sm text-ink-500">{formatDate(row.expense_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* True customer discounts only (below fair price), not partial-set pricing */}
      <section className="panel p-5">
        <h3 className="text-lg font-semibold">Zbritja</h3>
        <p className="mt-1 text-sm text-ink-600">
          Vetëm zbritje të vërteta për klientin (shitje nën çmimin e justë). Çmimi më i ulët
          për set të pjesshëm nuk numërohet si zbritje.
        </p>
        <div className="mt-4 table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Porosia</th>
                <th>Klienti</th>
                <th>Artikulli</th>
                <th>Çmimi i justë</th>
                <th>Shitja</th>
                <th>Zbritja</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {metrics.discountLog.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-ink-500">
                    Nuk ka zbritje të vërteta të regjistruara.
                  </td>
                </tr>
              ) : (
                metrics.discountLog.map((row, i) => (
                  <tr key={`${row.order_number}-${i}`}>
                    <td className="font-mono text-xs">{row.order_number}</td>
                    <td>{row.customer_name}</td>
                    <td>{row.item_name}</td>
                    <td>{formatEuro(row.list_price)}</td>
                    <td>{formatEuro(row.unit_price)}</td>
                    <td className="font-medium text-accent">
                      −{formatEuro(row.discount_amount)}
                    </td>
                    <td>{formatDate(row.order_date)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top sellers and returns */}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-5">
          <h3 className="text-lg font-semibold">Setet më të shitura</h3>
          <div className="mt-4 table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Artikulli</th>
                  <th>Sasia</th>
                  <th>Të ardhurat</th>
                </tr>
              </thead>
              <tbody>
                {metrics.topSellingSets.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-ink-500">
                      Nuk ka shitje ende
                    </td>
                  </tr>
                ) : (
                  metrics.topSellingSets.map((row) => (
                    <tr key={row.name}>
                      <td className="font-medium">{row.name}</td>
                      <td className="font-mono">{row.qty}</td>
                      <td>{formatEuro(row.revenue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel p-5">
          <h3 className="text-lg font-semibold">Regjistri i kthimeve</h3>
          <div className="mt-4 table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Porosia</th>
                  <th>Artikulli</th>
                  <th>Kthyer më</th>
                </tr>
              </thead>
              <tbody>
                {metrics.returnedItems.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-ink-500">
                      Nuk ka kthime të regjistruara
                    </td>
                  </tr>
                ) : (
                  metrics.returnedItems.map((row, i) => (
                    <tr key={`${row.order_number}-${i}`}>
                      <td className="font-mono text-xs">{row.order_number}</td>
                      <td>{row.item_name}</td>
                      <td>{formatDate(row.returned_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Delivery status roll-up with link into Orders */}
      <section className="panel p-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold">Statusi i dorëzimeve</h3>
          <Link to="/orders" className="btn-secondary text-xs">
            Hap porositë
          </Link>
        </div>
        <div className="mt-4 table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Porosia</th>
                <th>Klienti</th>
                <th>Statusi</th>
                <th>Data</th>
                <th>Totali</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {metrics.deliveries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-ink-500">
                    Nuk ka porosi ende - shtoni stok dhe krijoni një porosi për të filluar.
                  </td>
                </tr>
              ) : (
                metrics.deliveries.map((row) => (
                  <tr key={row.order_number}>
                    <td className="font-mono text-xs">{row.order_number}</td>
                    <td>{row.customer_name}</td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                    <td>{formatDate(row.order_date)}</td>
                    <td>{formatEuro(row.total)}</td>
                    <td className="text-right">
                      <Link
                        to="/orders"
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        Menaxho
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Compact KPI tile used in the top metrics grid. */
function MetricCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="panel flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
          {label}
        </span>
        <span
          className={
            accent
              ? 'rounded-md bg-accent-soft p-2 text-accent'
              : 'rounded-md bg-brand-50 p-2 text-brand-700'
          }
        >
          {icon}
        </span>
      </div>
      <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Color-coded Albanian status label for delivery rows. */
function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'Delivered'
      ? 'bg-brand-100 text-brand-800'
      : status === 'Returned'
        ? 'bg-accent-soft text-accent'
        : 'bg-ink-100 text-ink-800';
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}
