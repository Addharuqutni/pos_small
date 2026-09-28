import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format integer minor unit (rupiah) to display string */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format a percentage value (e.g. profit margin) with one decimal.
 * A missing margin renders as an em dash instead of a fake 0%.
 */
export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—'
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
  return `${formatted}%`
}

/** Format date to locale string */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

/** Format date only */
export function formatDateOnly(date: string | Date): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-').map(Number)
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
      new Date(year!, month! - 1, day!),
    )
  }
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
  }).format(new Date(date))
}

/** Format date to yyyy-mm-dd for native date inputs using local timezone */
export function localDateInputValue(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Convert yyyy-mm-dd from native date input to ISO timestamp using local day bounds */
export function localDayIso(date: string, endOfDay = false): string {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(
    year!,
    month! - 1,
    day!,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  )
  return value.toISOString()
}
