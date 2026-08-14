interface TableSkeletonProps {
  /** Number of placeholder rows */
  rows?: number
  /** Placeholder column widths (% of container) */
  cols?: number[]
}

/** Loading placeholder matching the standard `card overflow-x-auto p-0` table layout. */
export function TableSkeleton({ rows = 6, cols = [22, 16, 12, 10, 14] }: TableSkeletonProps) {
  return (
    <div role="status">
      <span className="sr-only">Memuat data...</span>
      <div className="card overflow-hidden p-0" aria-hidden="true">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-6 border-b border-slate-100 px-4 py-4 last:border-0">
            {cols.map((width, col) => (
              <div
                key={col}
                className="h-3.5 animate-pulse rounded bg-slate-100 motion-reduce:animate-none"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
