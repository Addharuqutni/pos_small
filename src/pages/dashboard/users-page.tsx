import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from '@/contexts/auth-context'
import { Button, Input, Select, Modal, PageSpinner } from '@/components/ui'
import { Plus, Edit2, Power, KeyRound } from 'lucide-react'
import type { User } from '@/types'

const userSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  email: z.string().email('Email tidak valid'),
  role: z.enum(['admin', 'cashier']),
  password: z.string().min(6, 'Minimal 6 karakter').optional().or(z.literal('')),
})

type UserForm = z.infer<typeof userSchema>

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)

  const { data: users, isLoading } = useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: () => api.get<User[]>('/users'),
  })

  const saveMutation = useMutation({
    mutationFn: (data: UserForm & { id?: string }) => {
      const body = { ...data }
      if (!body.password) delete (body as Record<string, unknown>).password
      return data.id ? api.patch(`/users/${data.id}`, body) : api.post('/users', body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      closeForm()
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (u: User) => api.patch(`/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
  })

  const resetPwMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/users/${id}/reset-password`, { password }),
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<UserForm>({
    resolver: zodResolver(userSchema),
  })

  const openCreate = () => {
    setEditing(null)
    reset({ name: '', email: '', role: 'cashier', password: '' })
    setShowForm(true)
  }

  const openEdit = (u: User) => {
    if (u.role === 'owner') return
    setEditing(u)
    reset({ name: u.name, email: u.email, role: u.role, password: '' })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditing(null) }

  const onSubmit = (data: UserForm) => {
    saveMutation.mutate({ ...data, id: editing?.id })
  }

  const resetPassword = (u: User) => {
    const password = window.prompt(`Password baru untuk ${u.name}`)
    if (!password) return
    resetPwMutation.mutate({ id: u.id, password })
  }

  // PRD §6.3 — only owner can manage users
  if (currentUser?.role !== 'owner') {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        Anda tidak memiliki akses ke halaman ini
      </div>
    )
  }

  if (isLoading) return <PageSpinner />

  const roleOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'cashier', label: 'Kasir' },
  ]

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pengguna</h1>
          <p className="text-sm text-slate-500">Kelola akun pengguna</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Tambah Pengguna
        </Button>
      </div>

      {(toggleMutation.isError || resetPwMutation.isError) && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {toggleMutation.error instanceof Error
            ? toggleMutation.error.message
            : resetPwMutation.error instanceof Error
              ? resetPwMutation.error.message
              : 'Gagal memproses pengguna'}
        </p>
      )}
      {resetPwMutation.isSuccess && (
        <p className="mb-4 text-sm text-green-600" role="status">
          Password berhasil direset
        </p>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-medium text-slate-600">Nama</th>
              <th className="px-4 py-3 font-medium text-slate-600">Email</th>
              <th className="px-4 py-3 font-medium text-slate-600">Role</th>
              <th className="px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 font-medium text-slate-600">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3 capitalize text-slate-600">{u.role}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {u.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(u)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={`Edit ${u.name}`}>
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => resetPassword(u)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={`Reset password ${u.name}`}>
                      <KeyRound className="h-4 w-4" />
                    </button>
                    {u.id !== currentUser?.id && (
                      <button onClick={() => toggleMutation.mutate(u)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={`${u.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${u.name}`}>
                        <Power className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={closeForm} title={editing ? 'Edit Pengguna' : 'Tambah Pengguna'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Nama" error={errors.name?.message} {...register('name')} />
          <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <Select label="Role" options={roleOptions} error={errors.role?.message} {...register('role')} />
          <Input
            label={editing ? 'Password Baru (kosongkan jika tidak ubah)' : 'Password'}
            type="password"
            error={errors.password?.message}
            {...register('password')}
          />
          {saveMutation.isError && (
            <p className="text-sm text-red-600" role="alert">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Gagal menyimpan pengguna'}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={closeForm}>Batal</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Simpan' : 'Tambah'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
