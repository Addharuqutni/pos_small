interface ErrorStateProps {
  message?: string
  /** Optional retry callback (e.g. query refetch) */
  onRetry?: () => void
}

/** Shared error state for failed queries — distinct from empty states. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="card p-8 text-center" role="alert">
      <p className="text-sm font-medium text-red-700">
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