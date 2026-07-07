import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Package,
  Tags,
  BarChart3,
  Users,
  Settings,
  ShoppingCart,
  Warehouse,
  LogOut,
  Menu,
  X,
  Clock,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/dashboard/products', icon: Package, label: 'Produk' },
  { to: '/dashboard/categories', icon: Tags, label: 'Kategori' },
  { to: '/dashboard/stock', icon: Warehouse, label: 'Stok' },
  { to: '/dashboard/sales', icon: ShoppingCart, label: 'Transaksi' },
  { to: '/dashboard/reports', icon: BarChart3, label: 'Laporan' },
  { to: '/dashboard/shifts', icon: Clock, label: 'Shift' },
  { to: '/dashboard/users', icon: Users, label: 'Pengguna' },
  { to: '/dashboard/settings', icon: Settings, label: 'Pengaturan' },
]

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // Filter nav by role — PRD §6.3
  const filteredNav = navItems.filter((item) => {
    if (user?.role === 'admin') {
      // Admin: no users, no settings
      return item.to !== '/dashboard/users' && item.to !== '/dashboard/settings'
    }
    return true // owner sees all
  })

  return (
    <div className="flex h-screen overflow-hidden bg-pos-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-pos-sidebar transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
            P
          </div>
          <span className="text-lg font-semibold text-white">POS App</span>
          <button
            className="ml-auto text-slate-400 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {filteredNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-600/20 text-primary-400'
                    : 'text-slate-400 hover:bg-slate-700 hover:text-white',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-slate-700 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600 text-sm font-medium text-white">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.name}</p>
              <p className="text-xs capitalize text-slate-400">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-6">
          <button
            className="text-slate-600 hover:text-slate-900 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1" />
          <span className="text-sm text-slate-500">
            {user?.name} · <span className="capitalize">{user?.role}</span>
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
