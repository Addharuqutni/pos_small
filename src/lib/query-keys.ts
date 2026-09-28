/** TanStack Query key factory — prevents key collisions */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  products: {
    all: ['products'] as const,
    list: (params?: Record<string, unknown>) => ['products', 'list', params] as const,
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
    list: (params?: Record<string, unknown>) => ['shifts', 'list', params] as const,
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
    /** Prefix for every report query — report rows can embed date/filter params. */
    all: ['reports'] as const,
    sales: (params?: Record<string, unknown>) => ['reports', 'sales', params] as const,
    products: (params?: Record<string, unknown>) => ['reports', 'products', params] as const,
    categories: (params?: Record<string, unknown>) => ['reports', 'categories', params] as const,
    cashiers: (params?: Record<string, unknown>) => ['reports', 'cashiers', params] as const,
    profit: (params?: Record<string, unknown>, groupBy?: string) =>
      ['reports', 'profit', params, groupBy] as const,
    shifts: (params?: Record<string, unknown>) => ['reports', 'shifts', params] as const,
    lowStock: () => ['reports', 'low-stock'] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
  promos: {
    all: ['promos'] as const,
    list: () => ['promos', 'list'] as const,
  },
  suppliers: {
    all: ['suppliers'] as const,
    list: () => ['suppliers', 'list'] as const,
  },
  purchases: {
    list: () => ['purchases', 'list'] as const,
    detail: (id: string) => ['purchases', id] as const,
  },
} as const
