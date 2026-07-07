import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency } from '@/lib/utils'
import { Button, Input, Select, Modal, PageSpinner } from '@/components/ui'
import { useDebounce } from '@/hooks/use-debounce'
import { Plus, Search, Edit2, Power, Wand2 } from 'lucide-react'
import type { Product, Category, PaginatedResponse } from '@/types'

const productSchema = z.object({
  name: z.string().min(1, 'Nama produk wajib diisi'),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  imageData: z.string().optional().or(z.literal('')),
  price: z.coerce.number().min(0, 'Harga tidak boleh negatif'),
  costPrice: z.coerce.number().min(0, 'Harga modal tidak boleh negatif'),
  stock: z.coerce.number().int().min(0),
  minStock: z.coerce.number().int().min(0),
  trackStock: z.boolean(),
  allowNegativeStock: z.boolean(),
})

type ProductForm = z.infer<typeof productSchema>

function prefix(value: string, fallback: string) {
  return (value || fallback)
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'X')
}

function digits(value: string, length: number) {
  const sum = Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0)
  return String(sum % 10 ** length).padStart(length, '0')
}

function randomString(length: number) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase().padEnd(length, '0')
}

function randomNumber(length: number) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('')
}

function makeProductCodes(name: string, categoryName: string) {
  const sku = `${prefix(categoryName, 'CAT')}-${prefix(name, 'PRD')}-${randomString(4)}`
  const barcode = `${digits(categoryName || 'category', 3)}${digits(name || 'product', 3)}${randomNumber(6)}`
  return { sku, barcode }
}

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  return canvas.toDataURL('image/webp', 0.72)
}

export function ProductsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [imageError, setImageError] = useState('')
  const debouncedSearch = useDebounce(search)

  const { data: products, isLoading } = useQuery({
    queryKey: queryKeys.products.list({ search: debouncedSearch, category: filterCategory }),
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterCategory) params.set('category', filterCategory)
      const qs = params.toString()
      return api.get<PaginatedResponse<Product>>(`/products${qs ? `?${qs}` : ''}`)
    },
  })

  const { data: categories } = useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => api.get<Category[]>('/categories'),
  })

  const saveMutation = useMutation({
    mutationFn: (data: ProductForm & { id?: string }) => {
      const body = {
        ...data,
        sku: data.sku || null,
        barcode: data.barcode || null,
        categoryId: data.categoryId || null,
        imageData: data.imageData || null,
      }
      return data.id
        ? api.patch(`/products/${data.id}`, body)
        : api.post('/products', body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
      closeForm()
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (product: Product) =>
      api.patch(`/products/${product.id}`, { isActive: !product.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      trackStock: true,
      allowNegativeStock: false,
      imageData: '',
      stock: 0,
      minStock: 0,
      price: 0,
      costPrice: 0,
    },
  })

  const watchedName = watch('name')
  const watchedCategoryId = watch('categoryId')
  const watchedImageData = watch('imageData')

  const generateCodes = () => {
    const categoryName = categories?.find((c) => c.id === watchedCategoryId)?.name ?? ''
    const codes = makeProductCodes(watchedName ?? '', categoryName)
    setValue('sku', codes.sku, { shouldDirty: true, shouldValidate: true })
    setValue('barcode', codes.barcode, { shouldDirty: true, shouldValidate: true })
  }

  const handleImageUpload = async (file: File | undefined) => {
    setImageError('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setImageError('File harus berupa gambar')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Ukuran gambar maksimal 5MB')
      return
    }

    try {
      const imageData = await compressImage(file)
      setValue('imageData', imageData, { shouldDirty: true, shouldValidate: true })
    } catch {
      setImageError('Gagal memproses gambar')
    }
  }

  const openCreate = () => {
    setEditing(null)
    reset({
      name: '',
      sku: '',
      barcode: '',
      categoryId: '',
      imageData: '',
      price: 0,
      costPrice: 0,
      stock: 0,
      minStock: 0,
      trackStock: true,
      allowNegativeStock: false,
    })
    setImageError('')
    setShowForm(true)
  }

  const openEdit = (product: Product) => {
    setEditing(product)
    reset({
      name: product.name,
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      categoryId: product.categoryId ?? '',
      imageData: product.imageData ?? '',
      price: product.price,
      costPrice: product.costPrice,
      stock: product.stock,
      minStock: product.minStock,
      trackStock: product.trackStock,
      allowNegativeStock: product.allowNegativeStock,
    })
    setImageError('')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
  }

  const onSubmit = (data: ProductForm) => {
    saveMutation.mutate({ ...data, id: editing?.id })
  }

  const categoryOptions = categories
    ?.filter((c) => c.isActive || c.id === editing?.categoryId)
    .map((c) => ({ value: c.id, label: c.name })) ?? []

  if (isLoading) return <PageSpinner />

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Produk</h1>
          <p className="text-sm text-slate-500">Kelola produk toko</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Tambah Produk
        </Button>
      </div>

      {toggleMutation.isError && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {toggleMutation.error instanceof Error ? toggleMutation.error.message : 'Gagal mengubah status produk'}
        </p>
      )}

      {/* Search & Filter */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama, SKU, barcode..."
            className="input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Cari nama, SKU, barcode"
          />
        </div>
        <div className="w-48">
          <Select
            options={[{ value: '', label: 'Semua Kategori' }, ...categoryOptions]}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-medium text-slate-600">Gambar</th>
              <th className="px-4 py-3 font-medium text-slate-600">Nama</th>
              <th className="px-4 py-3 font-medium text-slate-600">SKU</th>
              <th className="px-4 py-3 font-medium text-slate-600">Kategori</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Harga</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Stok</th>
              <th className="px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 font-medium text-slate-600">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {products?.data?.map((product) => (
              <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  {product.imageData ? (
                    <img src={product.imageData} alt={product.name} className="h-10 w-10 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-xs font-medium text-slate-400">
                      {product.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{product.sku || '-'}</td>
                <td className="px-4 py-3 text-slate-500">{product.categoryName || '-'}</td>
                <td className="px-4 py-3 text-right font-mono">{formatCurrency(product.price)}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {product.trackStock ? (
                    <span className={product.stock <= product.minStock ? 'text-red-600 font-medium' : ''}>
                      {product.stock}
                    </span>
                  ) : (
                    <span className="text-slate-400">∞</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      product.isActive
                        ? 'bg-green-50 text-green-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {product.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(product)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label={`Edit ${product.name}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(product)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label={`${product.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${product.name}`}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!products?.data || products.data.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                  {search ? 'Produk tidak ditemukan' : 'Belum ada produk'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editing ? 'Edit Produk' : 'Tambah Produk'}
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nama Produk" error={errors.name?.message} {...register('name')} />
            <Select
              label="Kategori"
              options={categoryOptions}
              placeholder="Pilih kategori"
              {...register('categoryId')}
            />
            <div>
              <div className="flex items-end gap-2">
                <Input label="SKU" error={errors.sku?.message} {...register('sku')} />
                <Button type="button" variant="secondary" size="sm" onClick={generateCodes}>
                  <Wand2 className="h-4 w-4" /> Buat
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-400">Format: kategori-nama-random</p>
            </div>
            <Input label="Barcode" error={errors.barcode?.message} {...register('barcode')} />
            <div>
              <label htmlFor="product-image" className="label">Gambar Produk</label>
              <div className="flex items-center gap-3">
                {watchedImageData ? (
                  <img src={watchedImageData} alt="Preview produk" className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                    Kosong
                  </div>
                )}
                <div className="flex-1">
                  <input
                    id="product-image"
                    type="file"
                    accept="image/*"
                    className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                    onChange={(e) => void handleImageUpload(e.target.files?.[0])}
                  />
                  <p className="mt-1 text-xs text-slate-400">Dikompres ke WebP max 512px sebelum dikirim ke database.</p>
                  {imageError && <p className="mt-1 text-xs text-red-600">{imageError}</p>}
                </div>
              </div>
            </div>
            <Input
              label="Harga Jual"
              type="number"
              error={errors.price?.message}
              {...register('price')}
            />
            <Input
              label="Harga Modal"
              type="number"
              error={errors.costPrice?.message}
              {...register('costPrice')}
            />
            <Input
              label="Stok"
              type="number"
              error={errors.stock?.message}
              {...register('stock')}
            />
            <Input
              label="Stok Minimum"
              type="number"
              error={errors.minStock?.message}
              {...register('minStock')}
            />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register('trackStock')} />
              Lacak stok
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register('allowNegativeStock')} />
              Izinkan stok negatif
            </label>
          </div>

          {saveMutation.isError && (
            <p className="text-sm text-red-600" role="alert">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Gagal menyimpan produk'}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeForm}>
              Batal
            </Button>
            <Button type="submit" loading={saveMutation.isPending}>
              {editing ? 'Simpan' : 'Tambah'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
