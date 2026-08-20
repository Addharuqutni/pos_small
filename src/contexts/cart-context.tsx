import { createContext, useContext, useCallback, useState, useMemo, useEffect, type ReactNode } from 'react'
import type { CartItem, Product } from '@/types'

interface CartContextValue {
  items: CartItem[]
  saleDiscount: number
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQty: (productId: string, qty: number) => void
  updateDiscount: (productId: string, discount: number) => void
  setSaleDiscount: (discount: number) => void
  clearCart: () => void
  subtotal: number
  discountTotal: number
  itemCount: number
}

const CartContext = createContext<CartContextValue | null>(null)

const CART_STORAGE_KEY = 'pos-cart'

interface StoredCart {
  items: CartItem[]
  saleDiscount: number
}

function loadCart(): StoredCart {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return { items: [], saleDiscount: 0 }
    const parsed = JSON.parse(raw) as StoredCart
    if (!Array.isArray(parsed.items)) return { items: [], saleDiscount: 0 }
    return { items: parsed.items, saleDiscount: typeof parsed.saleDiscount === 'number' ? parsed.saleDiscount : 0 }
  } catch {
    return { items: [], saleDiscount: 0 }
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [{ items, saleDiscount }, setState] = useState<StoredCart>(loadCart)

  // Offline persistence — cart survives reloads and network drops.
  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items, saleDiscount }))
  }, [items, saleDiscount])

  const addItem = useCallback((product: Product) => {
    setState((prev) => {
      const existing = prev.items.find((i) => i.product.id === product.id)
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i,
          ),
        }
      }
      return { ...prev, items: [...prev.items, { product, qty: 1, discount: 0 }] }
    })
  }, [])

  const removeItem = useCallback((productId: string) => {
    setState((prev) => ({ ...prev, items: prev.items.filter((i) => i.product.id !== productId) }))
  }, [])

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty < 1) return
    setState((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.product.id === productId ? { ...i, qty } : i)),
    }))
  }, [])

  const updateDiscount = useCallback((productId: string, discount: number) => {
    if (discount < 0) return
    setState((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.product.id === productId ? { ...i, discount } : i)),
    }))
  }, [])

  const setSaleDiscount = useCallback((discount: number) => {
    if (discount < 0) return
    setState((prev) => ({ ...prev, saleDiscount: discount }))
  }, [])

  const clearCart = useCallback(() => setState({ items: [], saleDiscount: 0 }), [])

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
        saleDiscount,
        addItem,
        removeItem,
        updateQty,
        updateDiscount,
        setSaleDiscount,
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
