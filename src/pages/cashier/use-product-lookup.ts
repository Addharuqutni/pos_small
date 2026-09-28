import { useQueryClient } from '@tanstack/react-query'
import { findProducts } from '@/queries/products.ts'
import type { Product } from '@/types/index.ts'

/**
 * Single product-lookup path for the cashier screen. Both the keyboard search
 * box and the camera scanner resolve products through here, so the query key
 * (and therefore the cache entry) is shared with the product grid.
 */
export function useProductLookup() {
  const queryClient = useQueryClient()

  return {
    /** Scanned barcode/SKU: exact barcode hit wins, else the first match. */
    async findByCode(code: string) {
      const res = await findProducts(queryClient, { search: code, active: true })
      return res.data.find((product) => product.barcode === code) ?? res.data[0] ?? null
    },
    /** Products matching the search box text, for the Enter-to-add shortcut. */
    async findBySearch(term: string): Promise<Product[]> {
      const res = await findProducts(queryClient, { search: term, active: true })
      return res.data
    },
  }
}
