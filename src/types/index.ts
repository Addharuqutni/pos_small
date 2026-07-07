// PRD §9.10 — Role MVP enum
export type Role = 'owner' | 'admin' | 'cashier'

// PRD §9.1 — User
export interface User {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

// PRD §9.3 — Category
export interface Category {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// PRD §9.2 — Product
export interface Product {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  categoryId: string | null
  categoryName: string | null
  imageData: string | null
  // List responses omit imageData; hasImage tells the UI whether to fetch it.
  hasImage?: boolean
  price: number // integer minor unit (rupiah)
  costPrice: number
  stock: number
  minStock: number
  trackStock: boolean
  allowNegativeStock: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// PRD §9.5 — Sale status
export type SaleStatus = 'paid' | 'void' | 'refunded' | 'partial_refunded'

// PRD §9.5 — Payment method
export type PaymentMethod = 'cash' | 'qris' | 'transfer'

// PRD §9.5 — Sale item
export interface SaleItem {
  id: string
  saleId: string
  productId: string
  productNameSnapshot: string
  qty: number
  price: number // integer minor unit
  discount: number
  subtotal: number
}

// PRD §9.5 — Payment
export interface Payment {
  id: string
  saleId: string
  method: PaymentMethod
  amount: number
  referenceNo: string | null
  createdAt: string
}

// PRD §9.5 — Sale (transaction)
export interface Sale {
  id: string
  invoiceNo: string
  cashierId: string
  cashier?: User
  shiftId: string
  items: SaleItem[]
  payments: Payment[]
  refunds?: Refund[]
  subtotal: number
  discountTotal: number
  taxTotal: number
  grandTotal: number
  paidTotal: number
  changeTotal: number
  status: SaleStatus
  createdAt: string
  updatedAt: string
}

// PRD §9.8 — Shift
export type ShiftStatus = 'open' | 'closed'

export interface Shift {
  id: string
  cashierId: string
  cashier?: User
  openedAt: string
  closedAt: string | null
  openingCash: number
  closingCash: number | null
  expectedCash: number | null
  difference: number | null
  status: ShiftStatus
}

// PRD §9.4 — Stock movement
export type StockMovementType = 'sale' | 'adjustment' | 'return' | 'restock' | 'refund'

export interface StockMovement {
  id: string
  productId: string
  productName?: string | null
  type: StockMovementType
  qtyChange: number
  stockBefore: number
  stockAfter: number
  referenceType: string | null
  referenceId: string | null
  notes: string | null
  createdBy: string
  createdAt: string
}

// PRD §9.11 — Store settings
export interface StoreSettings {
  storeName: string
  storeAddress: string
  storePhone: string
  receiptFooter: string
  taxEnabled: boolean
  taxRate: number // percentage (e.g., 11 = 11%)
  currency: string
  allowNegativeStockDefault: boolean
}

// PRD §9.7 — Refund
export interface Refund {
  id: string
  saleId: string
  items: RefundItem[]
  reason: string
  refundedBy: string
  createdAt: string
}

export interface RefundItem {
  id: string
  refundId: string
  saleItemId: string
  productId: string
  qty: number
  amount: number
}

// PRD §15 — Audit log
export interface AuditLog {
  id: string
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  beforeJson: unknown
  afterJson: unknown
  ipAddress: string
  createdAt: string
}

// Cart (frontend-only)
export interface CartItem {
  product: Product
  qty: number
  discount: number // per-item discount, integer minor unit
}

// API response wrapper
export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

// Auth
export interface LoginRequest {
  email: string
  password: string
}

export interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

// --- Shared report types (used by dashboard-home + reports-page) ---

export interface SalesReportRow {
  date: string
  totalSales: number
  totalRevenue: number
  totalDiscount: number
  totalTax: number
}

export interface SalesReportSummary {
  totalSales: number
  totalRevenue: number
  totalDiscount: number
  totalTax: number
}

export interface SalesReportResponse {
  daily: SalesReportRow[]
  summary: SalesReportSummary
}

export interface ProductReportRow {
  productId: string
  productName: string
  totalQty: number
  totalRevenue: number
}

// --- Shared UI label maps (used by multiple dashboard pages) ---

export const saleStatusLabels: Record<SaleStatus, string> = {
  paid: 'Lunas',
  void: 'Batal',
  refunded: 'Refund Penuh',
  partial_refunded: 'Refund Sebagian',
}

export const saleStatusBadgeClass: Record<SaleStatus, string> = {
  paid: 'bg-green-100 text-green-700',
  void: 'bg-slate-100 text-slate-600',
  refunded: 'bg-red-100 text-red-700',
  partial_refunded: 'bg-amber-100 text-amber-700',
}

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
}

export const roleLabels: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  cashier: 'Kasir',
}

