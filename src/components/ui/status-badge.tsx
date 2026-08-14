import type { ReactNode } from 'react'

type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'slate'

interface StatusBadgeProps {
  tone?: BadgeTone
  children: ReactNode
}

const tones: Record<BadgeTone, string> = {
  green: 'bg-green-50 text-green-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
  slate: 'bg-slate-100 text-slate-600',
}

/** Shared status pill used across tables and detail views. */
export function StatusBadge({ tone = 'slate', children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}
