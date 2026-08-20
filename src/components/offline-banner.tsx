import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 ring-1 ring-inset ring-amber-200" role="status">
      <WifiOff className="h-4 w-4" />
      Anda sedang offline — keranjang tetap tersimpan, tapi simpan transaksi butuh koneksi.
    </div>
  )
}
