import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { PageSpinner } from '@/components/ui'
import type { Role } from '@/types'

interface RouteGuardProps {
  allowedRoles?: Role[]
}

/** PRD §6.3 — Role-based route protection. Backend still enforces on every endpoint. */
export function RouteGuard({ allowedRoles }: RouteGuardProps) {
  const { user, isLoading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (isLoading) return <PageSpinner />

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Cashier → /cashier, admin/owner → /dashboard
    const fallback = user.role === 'cashier' ? '/cashier' : '/dashboard'
    return <Navigate to={fallback} replace />
  }

  return <Outlet />
}
