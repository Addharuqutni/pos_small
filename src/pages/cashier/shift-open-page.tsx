import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenShift } from '@/queries/shifts'
import { Button, Input } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'

export function ShiftOpenPage() {
  const navigate = useNavigate()
  const [openingCash, setOpeningCash] = useState('')

  const mutation = useOpenShift()

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const amount = Math.max(0, parseInt(openingCash) || 0)
    mutation.mutate({ openingCash: amount }, { onSuccess: () => navigate('/cashier') })
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">Buka Shift</h1>
          <p className="text-sm text-slate-500">Masukkan modal awal kas</p>
        </div>

        <Input
          name="opening-cash"
          label="Modal Awal"
          type="number"
          min={0}
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          placeholder="0"
          autoFocus
        />

        {openingCash && (
          <p className="text-center text-lg font-semibold text-primary-600">
            {formatCurrency(parseInt(openingCash) || 0)}
          </p>
        )}

        {mutation.isError && (
          <p className="text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : 'Gagal membuka shift'}
          </p>
        )}

        <Button type="submit" className="w-full" loading={mutation.isPending}>
          Buka Shift
        </Button>
      </form>
    </div>
  )
}
