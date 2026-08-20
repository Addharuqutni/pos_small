import { Outlet } from 'react-router-dom'
import { CartProvider } from '@/contexts/cart-context'
import { OfflineBanner } from '@/components/offline-banner'

/**
 * Cashier layout — full-screen, no sidebar.
 * PRD §10.4 — fast keyboard use, barcode scanner as keyboard input
 */
export function CashierLayout() {
  return (
    <CartProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-pos-bg">
        <OfflineBanner />
        <Outlet />
      </div>
    </CartProvider>
  )
}
