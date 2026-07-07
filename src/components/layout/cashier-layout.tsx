import { Outlet } from 'react-router-dom'
import { CartProvider } from '@/contexts/cart-context'

/**
 * Cashier layout — full-screen, no sidebar.
 * PRD §10.4 — fast keyboard use, barcode scanner as keyboard input
 */
export function CashierLayout() {
  return (
    <CartProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-slate-100">
        <Outlet />
      </div>
    </CartProvider>
  )
}
