/**
 * Top-level route map for the ERP UI.
 * All pages share AppLayout (sidebar + shell); unknown paths redirect to the dashboard.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/Layout';
import { DashboardPage } from './pages/Dashboard';
import { InventoryPage } from './pages/Inventory';
import { OrdersPage } from './pages/Orders';
import { InvoicePage } from './pages/Invoice';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="invoices/:orderId" element={<InvoicePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
