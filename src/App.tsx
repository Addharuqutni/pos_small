import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/auth-context'
import { RouteGuard } from '@/components/layout/route-guard'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CashierLayout } from '@/components/layout/cashier-layout'

// Pages
import { LoginPage } from '@/pages/auth/login-page'
import { DashboardHomePage } from '@/pages/dashboard/dashboard-home'
import { ProductsPage } from '@/pages/dashboard/products-page'
import { CategoriesPage } from '@/pages/dashboard/categories-page'
import { StockPage } from '@/pages/dashboard/stock-page'
import { SalesPage } from '@/pages/dashboard/sales-page'
import { SaleDetailDashboardPage } from '@/pages/dashboard/sale-detail-dashboard-page'
import { ReportsPage } from '@/pages/dashboard/reports-page'
import { UsersPage } from '@/pages/dashboard/users-page'
import { SettingsPage } from '@/pages/dashboard/settings-page'
import { ShiftReportPage } from '@/pages/dashboard/shift-report-page'
import { CashierPosPage } from '@/pages/cashier/cashier-pos-page'
import { ShiftOpenPage } from '@/pages/cashier/shift-open-page'
import { ShiftClosePage } from '@/pages/cashier/shift-close-page'
import { SaleDetailPage } from '@/pages/cashier/sale-detail-page'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Dashboard — owner + admin only (PRD §6.3) */}
            <Route element={<RouteGuard allowedRoles={['owner', 'admin']} />}>
              <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={<DashboardHomePage />} />
                <Route path="/dashboard/products" element={<ProductsPage />} />
                <Route path="/dashboard/categories" element={<CategoriesPage />} />
                <Route path="/dashboard/stock" element={<StockPage />} />
                <Route path="/dashboard/sales" element={<SalesPage />} />
                <Route path="/dashboard/sales/:id" element={<SaleDetailDashboardPage />} />
                <Route path="/dashboard/reports" element={<ReportsPage />} />
                <Route path="/dashboard/users" element={<UsersPage />} />
                <Route path="/dashboard/settings" element={<SettingsPage />} />
                <Route path="/dashboard/shifts" element={<ShiftReportPage />} />
              </Route>
            </Route>

            {/* Cashier — cashier only */}
            <Route element={<RouteGuard allowedRoles={['cashier']} />}>
              <Route element={<CashierLayout />}>
                <Route path="/cashier" element={<CashierPosPage />} />
                <Route path="/cashier/shift/open" element={<ShiftOpenPage />} />
                <Route path="/cashier/shift/close" element={<ShiftClosePage />} />
                <Route path="/cashier/sales/:id" element={<SaleDetailPage />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
