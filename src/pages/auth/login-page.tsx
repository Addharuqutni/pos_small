import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/contexts/auth-context'
import { Button, Input } from '@/components/ui'
import type { Role } from '@/types'

const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
})

type LoginForm = z.infer<typeof loginSchema>

function loginTarget(role: Role, from?: string) {
  if (role === 'cashier' && from?.startsWith('/cashier')) return from
  if (role !== 'cashier' && from?.startsWith('/dashboard')) return from
  return role === 'cashier' ? '/cashier' : '/dashboard'
}

export function LoginPage() {
  const { login, isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  // Already logged in — redirect
  if (isAuthenticated && user) {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname
    return <Navigate to={loginTarget(user.role, from)} replace />
  }

  const onSubmit = async (data: LoginForm) => {
    setError('')
    try {
      const loggedInUser = await login(data)
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname
      // Role-based redirect after login
      navigate(loginTarget(loggedInUser.role, from), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk')
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-pos-bg px-4 py-10">
      <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-primary-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-slate-200/70 blur-3xl" />
      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-lg font-extrabold text-white shadow-panel">
            PC
          </div>
          <p className="section-kicker mb-2">Retail operations</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950">Konsol POS</h1>
          <p className="mt-2 text-sm text-slate-500">Kelola toko dengan lebih tenang.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            placeholder="nama@toko.com"
            autoComplete="email"
            autoFocus
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label="Kata sandi"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />

          <Button type="submit" className="w-full" loading={isSubmitting}>
            Masuk
          </Button>
        </form>
      </div>
    </div>
  )
}
