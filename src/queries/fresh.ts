/**
 * "Always fresh" query options.
 *
 * Dashboard/report views must never show stale numbers after a checkout, void
 * or refund — they opt out of the 30s global `staleTime` from App.tsx and
 * refetch on every mount and window focus.
 */
export const alwaysFresh = {
  staleTime: 0,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
} as const
