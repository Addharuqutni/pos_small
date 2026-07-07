import { createContext, useContext, useCallback, useState, useMemo, type ReactNode } from 'react'
import type { CartItem, Product } from '@/types'

interface CartContextValue {
  items: CartItem[]
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQty: (productId: string, qty: number) => void
  updateDiscount: (productId: string, discount: number) => void
  clearCart: () => void
  subtotal: number
  discountTotal: number
  itemCount: number
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  const addItem = useCallback((product: Product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i,
        )
      }
      return [...prev, { product, qty: 1, discount: 0 }]
    })
  }, [])

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId))
  }, [])

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty < 1) return
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, qty } : i)),
    )
  }, [])

  const updateDiscount = useCallback((productId: string, discount: number) => {
    if (discount < 0) return
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, discount } : i)),
    )
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  // Memoize derived values so consumers don't recompute on every render.
  const { subtotal, discountTotal, itemCount } = useMemo(() => {
    let sub = 0
    let disc = 0
    let count = 0
    for (const i of items) {
      sub += i.product.price * i.qty
      disc += i.discount * i.qty
      count += i.qty
    }
    return { subtotal: sub, discountTotal: disc, itemCount: count }
  }, [items])

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQty,
        updateDiscount,
        clearCart,
        subtotal,
        discountTotal,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be inside CartProvider')
  return ctx
}
