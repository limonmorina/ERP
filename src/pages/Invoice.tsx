/**
 * A4 invoice preview and print flow for a single order.
 * Loads invoice payload via IPC; native print goes through Electron's print dialog.
 * InvoiceDocument is the printable sheet (also used in the on-screen print preview modal).
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Printer, X } from 'lucide-react';
import { formatDate, formatEuro, hasErpBridge } from '../lib/format';
import type { InvoicePayload } from '../../electron/types';
import logo from '../assets/logo.png';

export function InvoicePage() {
  const { orderId } = useParams();
  const [payload, setPayload] = useState<InvoicePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Fetch invoice data whenever the route orderId changes.
  useEffect(() => {
    if (!hasErpBridge()) {
      setError('Ura e Electron nuk është aktive - hapni me npm run electron:dev');
      return;
    }
    const id = Number(orderId);
    if (!id) {
      setError('ID e porosise është e pavlefshme');
      return;
    }
    window.erp.invoices
      .getForOrder(id)
      .then(setPayload)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Dështoi ngarkimi i faturës')
      );
  }, [orderId]);

  /** Open the OS print dialog through Electron (includes system print preview). */
  async function handlePrint() {
    if (!payload || !hasErpBridge()) return;
    setPrinting(true);
    try {
      // Native Electron print dialog includes OS print preview
      await window.erp.invoices.print(payload.order.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Printimi dështoi');
    } finally {
      setPrinting(false);
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/orders" className="btn-ghost inline-flex">
          <ArrowLeft size={16} /> Kthehu te porositë
        </Link>
        <div className="rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!payload) {
    return <p className="text-ink-600">Duke ngarkuar faturën…</p>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar (hidden when printing) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/orders" className="btn-ghost inline-flex">
            <ArrowLeft size={16} /> Kthehu te porositë
          </Link>
          <p className="mt-2 text-sm text-ink-600">
            Kjo është <strong>pamja paraprake</strong> e faturës A4. Kontrolloni, pastaj
            hapni parapamjen e printimit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowPrintPreview(true)}
          >
            <Eye size={16} />
            Parashiko printimin
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePrint}
            disabled={printing}
          >
            <Printer size={16} />
            {printing ? 'Duke printuar…' : 'Printo A4'}
          </button>
        </div>
      </div>

      <div className="no-print rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-900">
        Pamje paraprake e faturës - ashtu si do të dalë në letër A4
      </div>

      <InvoiceDocument payload={payload} printId />

      {/* Full-screen on-page preview before invoking the OS printer */}
      {showPrintPreview && (
        <div className="no-print fixed inset-0 z-50 flex flex-col bg-ink-950/70 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-ink-950 px-4 py-3 text-white">
            <div>
              <p className="font-medium">Parapamja e printimit · A4</p>
              <p className="text-xs text-white/60">
                Kontrolloni faturën, pastaj shtypni Printo për dialogun e printerit
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={handlePrint}
                disabled={printing}
              >
                <Printer size={16} />
                {printing ? 'Duke printuar…' : 'Printo'}
              </button>
              <button
                type="button"
                className="btn border border-white/20 bg-white/10 text-white hover:bg-white/20"
                onClick={() => setShowPrintPreview(false)}
              >
                <X size={16} />
                Mbyll
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <div className="mx-auto origin-top scale-[0.92] md:scale-100">
              <InvoiceDocument payload={payload} printId={false} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Printable A4 invoice layout: business header, customer, line items, totals, warranty.
 * When printId is true, the root gets #invoice-print-root for CSS @media print targeting.
 */
function InvoiceDocument({
  payload,
  printId = false,
}: {
  payload: InvoicePayload;
  printId?: boolean;
}) {
  const { settings, customer, order, items, invoice_number, issued_at } = payload;
  const tvshRatePct = Math.round((settings.tvsh_rate || 0.18) * 100);
  const showTransport = Boolean(order.show_transport_on_invoice);
  const discountTotal = order.discount_total || 0;
  const hasDiscount = discountTotal > 0;

  return (
    <div
      id={printId ? 'invoice-print-root' : undefined}
      className="invoice-print-sheet mx-auto w-full max-w-[210mm] bg-white p-8 text-ink-950 shadow-panel print:shadow-none"
    >
      {/* Business + invoice meta */}
      <header className="flex items-start justify-between gap-6 border-b border-ink-200 pb-6">
        <div className="flex gap-4">
          <img
            src={logo}
            alt="HSM Furniture"
            className="h-16 w-16 rounded-md object-cover ring-1 ring-ink-200"
          />
          <div>
            <h1 className="font-display text-2xl font-bold text-brand-900">
              {settings.business_name}
            </h1>
            <p className="mt-1 text-sm text-ink-700">{settings.address}</p>
            {settings.phone && (
              <p className="text-sm text-ink-600">Tel: {settings.phone}</p>
            )}
            {settings.email && (
              <p className="text-sm text-ink-600">{settings.email}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-500">
            Faturë
          </p>
          <p className="mt-1 font-mono text-lg font-semibold">{invoice_number}</p>
          <p className="text-sm text-ink-600">{formatDate(issued_at)}</p>
          <p className="mt-2 text-xs text-ink-500">Porosia {order.order_number}</p>
        </div>
      </header>

      <div className="mt-6 grid gap-6 border-b border-ink-100 pb-6 md:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Të dhënat bankare
          </h2>
          <p className="mt-2 text-sm font-medium">{settings.bank_name}</p>
          <p className="font-mono text-sm">{settings.iban}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Klienti
          </h2>
          <p className="mt-2 text-sm font-semibold">{customer.name}</p>
          <p className="text-sm text-ink-700">
            {customer.phone1}
            {customer.phone2 ? ` · ${customer.phone2}` : ''}
          </p>
          <p className="text-sm text-ink-700">{customer.delivery_address}</p>
          <p className="text-sm text-ink-700">
            {customer.city}, {customer.country}
          </p>
        </div>
      </div>

      {order.custom_notes && (
        <div className="mt-4 rounded-md bg-ink-50 px-3 py-2 text-sm">
          <span className="font-medium">Këndë me dimensione: </span>
          {order.custom_notes}
        </div>
      )}

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink-900 text-left text-xs uppercase tracking-wide">
            <th className="py-2 pr-2">Artikulli</th>
            <th className="py-2 pr-2">Seti</th>
            <th className="py-2 pr-2 text-right">Sasia</th>
            <th className="py-2 pr-2 text-right">Çmimi</th>
            <th className="py-2 text-right">Totali</th>
          </tr>
        </thead>
        <tbody>
          {/* Client-facing lines: only sell price (no fair/entitled price column) */}
          {items.map((line) => {
            const adj = line.discount_amount || 0;
            return (
              <tr key={line.id} className="border-b border-ink-100">
                <td className="py-3 pr-2 font-medium">
                  {line.item_name}
                  {line.broke_set === 1 && (
                    <span className="ml-2 text-[10px] font-normal text-accent">
                      (set i thyer)
                    </span>
                  )}
                  {adj > 0 && (
                    <span className="ml-2 text-[10px] font-normal text-accent">
                      zbritje klienti -{formatEuro(adj)}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-2 font-mono text-xs">
                  {line.set_format_requested}
                </td>
                <td className="py-3 pr-2 text-right font-mono">{line.quantity}</td>
                <td className="py-3 pr-2 text-right">{formatEuro(line.unit_price)}</td>
                <td className="py-3 text-right font-medium">
                  {formatEuro(line.line_total)}
                </td>
              </tr>
            );
          })}
          {showTransport && order.transport_fee > 0 && (
            <tr className="border-b border-ink-100">
              <td className="py-3 pr-2" colSpan={4}>
                Transport / Dorëzim
              </td>
              <td className="py-3 text-right font-medium">
                {formatEuro(order.transport_fee)}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Totals: subtotal (with TVSH), discount, transport, kapare, remaining */}
      <div className="mt-6 flex justify-end">
        <dl className="w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between gap-8">
            <dt className="text-ink-600">Nëntotali (me TVSH)</dt>
            <dd className="font-medium">{formatEuro(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-8">
            <dt className="text-ink-600">nga e cila TVSH ({tvshRatePct}%)</dt>
            <dd className="text-ink-500">{formatEuro(order.tvsh_amount)}</dd>
          </div>
          {hasDiscount && (
            <div className="flex justify-between gap-8">
              <dt className="text-ink-600">Zbritja e klientit</dt>
              <dd className="text-accent">−{formatEuro(discountTotal)}</dd>
            </div>
          )}
          {showTransport && order.transport_fee > 0 && (
            <div className="flex justify-between gap-8">
              <dt className="text-ink-600">Transporti</dt>
              <dd>{formatEuro(order.transport_fee)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-8 border-t border-ink-200 pt-2 text-base">
            <dt className="font-semibold">Totali për pagesë</dt>
            <dd className="font-semibold">{formatEuro(order.total)}</dd>
          </div>
          <div className="flex justify-between gap-8">
            <dt className="text-ink-600">Kaparë e paguar</dt>
            <dd>{formatEuro(order.kapare)}</dd>
          </div>
          <div className="flex justify-between gap-8 rounded-md bg-brand-50 px-3 py-2">
            <dt className="font-semibold text-brand-900">Mbetja për pagesë</dt>
            <dd className="font-semibold text-brand-900">
              {formatEuro(order.remaining_balance)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Warranty, terms, and signature lines */}
      <footer className="mt-8 border-t border-ink-200 pt-4 text-xs leading-relaxed text-ink-700">
        <p className="font-semibold text-ink-900">Garancioni profesional</p>
        <div className="mt-2 whitespace-pre-line text-[11px] leading-snug text-ink-600">
          {settings.warranty_text}
        </div>

        <p className="mt-4 font-semibold text-ink-900">Kushtet e përgjithshme</p>
        <p className="mt-1 text-[11px] text-ink-600">{settings.terms_text}</p>

        <p className="mt-4 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[11px] font-medium text-ink-800">
          Me nënshkrimin e kësaj fature, klienti deklaron se ka lexuar, kuptuar dhe pranuar
          të gjitha kushtet e garancisë dhe kushtet e përgjithshme të shitjes.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-10">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
              Nënshkrimi i shitësit (HSM Furniture)
            </p>
            <div className="mt-10 border-b border-ink-400" />
            <p className="mt-2 text-[10px] text-ink-500">Emri / data</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
              Nënshkrimi i klientit
            </p>
            <div className="mt-10 border-b border-ink-400" />
            <p className="mt-2 text-[10px] text-ink-500">
              {customer.name} · data · pranim i kushteve
            </p>
          </div>
        </div>

        <p className="mt-6 text-[10px] text-ink-400">
          Gjeneruar nga HSM Furniture ERP · A4 · Çmimet me TVSH të Kosovës
        </p>
      </footer>
    </div>
  );
}
