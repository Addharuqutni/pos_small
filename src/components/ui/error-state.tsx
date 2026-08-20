interface ErrorStateProps {
  message?: string
  /** Optional retry callback (e.g. query refetch) */
  onRetry?: () => void
}

/** Shared error state for failed queries — distinct from empty states. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="card border-red-200 bg-red-50/50 p-8 text-center" role="alert">
      <p className="text-sm font-bold text-red-700">
        {message ?? 'Gagal memuat data.'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-secondary mt-4"
        >
          Coba lagi
        </button>
      )}
    </div>
  )
}
