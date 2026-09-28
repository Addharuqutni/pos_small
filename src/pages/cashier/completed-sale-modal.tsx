import { Modal, Button } from '@/components/ui'
import { Receipt } from '@/components/receipt/receipt'
import { printReceipt } from '@/lib/thermal-printer'
import { Printer } from 'lucide-react'
import type { Sale, StoreSettings } from '@/types'

interface CompletedSaleModalProps {
  sale: Sale | null
  settings: StoreSettings | null
  onClose: () => void
  /** Close the receipt and hand focus back to the POS search box. */
  onNewSale: () => void
}

/** Post-checkout receipt: browser print plus the thermal (WebUSB) path. */
export function CompletedSaleModal({ sale, settings, onClose, onNewSale }: CompletedSaleModalProps) {
  return (
    <Modal open={!!sale} onClose={onClose} title="Transaksi Berhasil" className="max-w-md">
      {sale && (
        <div>
          <div className="mb-4 rounded-2xl bg-green-50 p-4 text-center text-green-700">
            <p className="font-bold">Transaksi berhasil disimpan</p>
            <p className="text-sm">{sale.invoiceNo}</p>
          </div>

          <Receipt sale={sale} settings={settings} />

          <div className="mt-4 flex gap-3">
            <Button variant="secondary" className="flex-1 rounded-xl" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Cetak Struk
            </Button>
            <Button variant="secondary" className="flex-1 rounded-xl" onClick={() => void printReceipt(sale, settings)}>
              <Printer className="h-4 w-4" /> Termal
            </Button>
            <Button className="flex-1 rounded-xl" onClick={onNewSale}>
              Transaksi Baru
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
