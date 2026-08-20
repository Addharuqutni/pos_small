import type { Sale, StoreSettings } from '@/types'

// ESC/POS command helpers for 58mm thermal printers.
// ponytail: supports WebUSB Epson-compatible printers (vendor 0x04b8, 0x0416, 0x0493)
// + browser print fallback. Bluetooth SPP needs a printer with a vendor app; add later.

const ESC = 0x1b
const GS = 0x1d

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function init(buf: number[]) {
  buf.push(ESC, 0x40) // initialize
}

function align(buf: number[], a: 0 | 1 | 2) {
  buf.push(ESC, 0x61, a)
}

function bold(buf: number[], on: boolean) {
  buf.push(ESC, 0x45, on ? 1 : 0)
}

function feed(buf: number[], lines: number) {
  buf.push(ESC, 0x64, lines)
}

function cut(buf: number[]) {
  buf.push(GS, 0x56, 66, 0) // partial cut
}

function line(buf: number[], text: string, width = 32) {
  buf.push(...encode(text.padEnd(width).slice(0, width)), 0x0a)
}

function divider(buf: number[], width = 32) {
  buf.push(...encode('-'.repeat(width)), 0x0a)
}

function currency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function buildReceipt(sale: Sale, settings: StoreSettings | null, width = 32): Uint8Array {
  const buf: number[] = []
  init(buf)
  align(buf, 1)
  bold(buf, true)
  line(buf, settings?.storeName ?? 'Toko', width)
  bold(buf, false)
  if (settings?.storeAddress) line(buf, settings.storeAddress, width)
  if (settings?.storePhone) line(buf, `Telp: ${settings.storePhone}`, width)
  align(buf, 0)
  divider(buf, width)
  line(buf, `No: ${sale.invoiceNo}`, width)
  line(buf, `Kasir: ${sale.cashier?.name ?? '-'}`, width)
  divider(buf, width)

  for (const item of sale.items) {
    line(buf, item.productNameSnapshot, width)
    line(buf, `  ${item.qty} x ${currency(item.price)}`, width)
    if (item.discount > 0) line(buf, `  Disk -${currency(item.discount * item.qty)}`, width)
    line(buf, `  ${currency(item.subtotal)}`, width)
  }

  divider(buf, width)
  line(buf, `Subtotal  ${currency(sale.subtotal)}`, width)
  if (sale.discountTotal > 0) line(buf, `Diskon   -${currency(sale.discountTotal)}`, width)
  if (sale.taxTotal > 0) line(buf, `Pajak     ${currency(sale.taxTotal)}`, width)
  bold(buf, true)
  line(buf, `TOTAL    ${currency(sale.grandTotal)}`, width)
  bold(buf, false)

  for (const p of sale.payments) {
    line(buf, `${p.method.toUpperCase()} ${currency(p.amount)}`, width)
  }
  if (sale.changeTotal > 0) line(buf, `Kembali  ${currency(sale.changeTotal)}`, width)

  divider(buf, width)
  align(buf, 1)
  line(buf, settings?.receiptFooter ?? 'Terima kasih', width)
  align(buf, 0)
  feed(buf, 4)
  cut(buf)
  return new Uint8Array(buf)
}

async function printViaWebUsb(data: Uint8Array): Promise<boolean> {
  // WebUSB is Chrome-only and requires an HTTPS (or localhost) context.
  const usb = (navigator as Navigator & { usb?: { requestDevice: (o: unknown) => Promise<UsbDeviceLike> } }).usb
  if (!usb) return false

  interface UsbDeviceLike {
    open: () => Promise<void>
    selectConfiguration: (n: number) => Promise<void>
    claimInterface: (n: number) => Promise<void>
    releaseInterface: (n: number) => Promise<void>
    close: () => Promise<void>
    transferOut: (endpoint: number, data: Uint8Array) => Promise<unknown>
  }

  const device = await usb.requestDevice({
    filters: [
      { vendorId: 0x04b8 }, // Epson
      { vendorId: 0x0416 }, // Winbond
      { vendorId: 0x0493 }, // Star
    ],
  })

  try {
    await device.open()
    await device.selectConfiguration(1)
    await device.claimInterface(0)
    // Chunk to 64-byte packets for endpoints that enforce a max packet size.
    for (let offset = 0; offset < data.length; offset += 64) {
      await device.transferOut(1, data.slice(offset, offset + 64))
    }
    return true
  } finally {
    try {
      await device.releaseInterface(0)
      await device.close()
    } catch {
      // Ignore cleanup errors — the transfer already happened.
    }
  }
}

/** Print a receipt to a thermal printer; returns false if it fell back to the browser dialog. */
export async function printThermal(sale: Sale, settings: StoreSettings | null): Promise<boolean> {
  const data = buildReceipt(sale, settings)
  try {
    return await printViaWebUsb(data)
  } catch {
    // User cancelled device picker, or no WebUSB — caller falls back to window.print.
    return false
  }
}
