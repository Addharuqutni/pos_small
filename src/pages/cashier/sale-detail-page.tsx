import { useParams } from 'react-router-dom'
import { useSale } from '@/queries/sales'
import { useSettings } from '@/queries/settings'
import { PageSpinner, Button } from '@/components/ui'
import { Receipt } from '@/components/receipt/receipt'
import { Printer } from 'lucide-react'

export function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: sale, isLoading } = useSale(id)

  const { data: settings } = useSettings()

  if (isLoading) return <PageSpinner />
  if (!sale) return <div className="p-6 text-center text-slate-400">Transaksi tidak ditemukan</div>

  return (
    <div className="flex h-full flex-col items-center justify-center bg-slate-50 p-6">
      <div className="card w-full max-w-md">
        <Receipt sale={sale} settings={settings ?? null} copy />
        <div className="mt-4 flex justify-center">
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Cetak Ulang
          </Button>
        </div>
      </div>
    </div>
  )
}
