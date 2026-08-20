# POS-Web

## Deskripsi

POS-Web adalah aplikasi Point-of-Sale (kasir) berbasis web untuk mengelola penjualan toko ritel. Aplikasi menyediakan dua area utama: **kasir** untuk transaksi penjualan harian dan **dasbor** untuk pengelolaan produk, stok, laporan, pengguna, dan pengaturan toko.

Antarmuka berbahasa Indonesia, sedangkan kode, nama file, dan route API menggunakan bahasa Inggris.

### Peran pengguna

| Peran | Akses |
|-------|-------|
| `cashier` | Layar POS, buka/tutup shift, detail transaksi sendiri |
| `admin` | Dasbor: produk, kategori, stok, pembelian, supplier, promo, transaksi, laporan |
| `owner` | Semua akses admin + pengguna, pengaturan, laporan shift, audit, backup |

## Screenshot

<!-- Tambahkan tangkapan layar di sini, contoh:
![Dasbor POS](docs/screenshot.png)
-->

## Fitur

### Kasir

- Pencarian produk berdasarkan nama, SKU, atau barcode
- Pemindai barcode kamera
- Keranjang belanja dengan penyesuaian jumlah dan diskon per item
- Diskon transaksi manual dan kode promo
- Metode pembayaran: Tunai, QRIS, Transfer
- Buka/tutup shift dengan rekonsiliasi kas
- Struk termal dan cetak ulang
- Keranjang tersimpan di `localStorage` (banner offline saat kehilangan koneksi)

### Dasbor

- Manajemen produk, kategori, supplier, dan pembelian (stok masuk)
- Manajemen promo (persen/nominal, periode, batas pemakaian)
- Riwayat transaksi dengan pencarian, detail, pembatalan (void), dan pengembalian (refund)
- Laporan: penjualan, produk, kategori, dan stok rendah — ekspor CSV dan PDF
- Laporan shift dan audit
- Manajemen pengguna dan pengaturan toko
- Cadangan data (backup) JSON penuh

### Teknis

- Autentikasi berbasis sesi (cookie) dengan role-based access control
- Offline banner + persistensi keranjang
- PWA (manifest + icon)

## Bagaimana cara instalasi

### Prasyarat

- Node 20+ dan npm
- PostgreSQL (lokal atau Supabase)

### Backend (`api/`)

```bash
cd api
npm install
cp .env.example .env      # isi DATABASE_URL, SESSION_SECRET, APP_URL, kredensial owner
npm run db:generate       # generate migrasi
npm run db:migrate        # terapkan migrasi
npm run db:seed           # seed owner + cashier (dataset demo butuh SEED_DEMO=true)
npm run dev               # http://localhost:4000
```

### Frontend (root)

```bash
npm install
npm run dev               # http://localhost:3000 (Vite)
```

### Variabel environment (`api/.env`)

Lihat [`api/.env.example`](api/.env.example).

| Variabel | Wajib | Deskripsi | Contoh |
|----------|-------|-----------|--------|
| `DATABASE_URL` | Ya | String koneksi PostgreSQL | `postgresql://postgres:password@localhost:54322/postgres` |
| `SESSION_SECRET` | Ya (prod) | Secret penandatangan cookie `sid`; minimal 32 karakter di produksi | string acak 32+ karakter |
| `APP_URL` | Ya (prod) | Origin CORS yang diizinkan (URL frontend) | `http://localhost:3000` |
| `NODE_ENV` | Tidak | `development` atau `production` | `development` |
| `OWNER_EMAIL` | Seed | Email akun owner awal | `owner@pos.local` |
| `OWNER_PASSWORD` | Seed | Kata sandi owner awal | `change-me` |
| `OWNER_NAME` | Seed | Nama tampilan owner awal | `Owner` |
| `CASHIER_EMAIL` | Tidak | Email kasir untuk QA POS | `cashier@pos.local` |
| `CASHIER_PASSWORD` | Tidak | Kata sandi kasir | `change-me` |
| `CASHIER_NAME` | Tidak | Nama tampilan kasir | `Cashier` |
| `SEED_DEMO` | Tidak | `true` untuk seed dataset demo + akun demo. Nonaktifkan di produksi | `false` |
| `PORT` | Tidak | Port backend (default `4000`) | `4000` |

### Perintah (script)

**Root (frontend)**

| Perintah | Deskripsi |
|----------|-----------|
| `npm run dev` | Jalankan Vite dev server |
| `npm run build` | TypeScript check lalu build produksi Vite |
| `npm run preview` | Pratinjau build produksi |
| `npm run check` | TypeScript check frontend (`tsc -b`) |
| `npm test` | Jalankan unit test frontend dan backend (`node:test`) |

**`api/` (backend)**

| Perintah | Deskripsi |
|----------|-----------|
| `npm run dev` | Jalankan Fastify dengan `tsx` watch mode dan `.env` |
| `npm run build` | Kompilasi backend ke `dist/` |
| `npm run start` | Jalankan `dist/server.js` (`.env` opsional, env dari platform) |
| `npm run db:generate` | Generate migrasi Drizzle |
| `npm run db:migrate` | Terapkan migrasi |
| `npm run db:seed` | Seed owner (+ kasir opsional) dan pengaturan default |
| `npm run check` | TypeScript check backend (`tsc --noEmit`) |
| `npm test` | Unit test backend (`tsx --test src/**/*.test.ts`) |

## Tech Stack

| Lapisan | Teknologi |
|---------|-----------|
| Frontend | React 19, Vite 6, React Router 7, TanStack Query 5, TailwindCSS 3, react-hook-form, zod, lucide-react |
| Backend | Fastify 5, Drizzle ORM, PostgreSQL (postgres.js), bcrypt, zod, @fastify/cookie, @fastify/cors, @fastify/rate-limit |
| Tooling | TypeScript 5, drizzle-kit, tsx, node:test |
