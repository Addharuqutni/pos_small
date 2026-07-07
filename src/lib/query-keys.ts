/** TanStack Query key factory — prevents key collisions */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  products: {
    all: ['products'] as const,
    list: (params?: Record<string, unknown>) => ['products', 'list', params] as const,
    detail: (id: string) => ['products', id] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: () => ['categories', 'list'] as const,
  },
  sales: {
    all: ['sales'] as const,
    list: (params?: Record<string, unknown>) => ['sales', 'list', params] as const,
    detail: (id: string) => ['sales', id] as const,
  },
  shifts: {
    all: ['shifts'] as const,
    list: (params?: Record<string, unknown>) => ['shifts', 'list', params] as const,
    detail: (id: string) => ['shifts', id] as const,
    active: ['shifts', 'active'] as const,
  },
  stock: {
    movements: (params?: Record<string, unknown>) => ['stock', 'movements', params] as const,
  },
  users: {
    all: ['users'] as const,
    list: () => ['users', 'list'] as const,
  },
  reports: {
    sales: (params?: Record<string, unknown>) => ['reports', 'sales', params] as const,
    products: (params?: Record<string, unknown>) => ['reports', 'products', params] as const,
    categories: (params?: Record<string, unknown>) => ['reports', 'categories', params] as const,
    shifts: (params?: Record<string, unknown>) => ['reports', 'shifts', params] as const,
    lowStock: () => ['reports', 'low-stock'] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
} as const
