import bcrypt from 'bcrypt'
import { db } from './db/client.js'
import { users, settings } from './db/schema.js'
import { eq } from 'drizzle-orm'

const SALT_ROUNDS = 10

async function ensureUser(opts: {
  email: string
  password: string
  name: string
  role: 'owner' | 'admin' | 'cashier'
  label: string
}) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, opts.email)).limit(1)
  if (existing) {
    console.log(`${opts.label} "${opts.email}" already exists, skipping.`)
    return
  }
  const passwordHash = await bcrypt.hash(opts.password, SALT_ROUNDS)
  await db.insert(users).values({
    name: opts.name,
    email: opts.email,
    passwordHash,
    role: opts.role,
  })
  console.log(`${opts.label} "${opts.email}" created.`)
}

async function seed() {
  await ensureUser({
    email: process.env.OWNER_EMAIL || 'owner@pos.local',
    password: process.env.OWNER_PASSWORD || 'change-me',
    name: process.env.OWNER_NAME || 'Owner',
    role: 'owner',
    label: 'Owner',
  })

  const cashierEmail = process.env.CASHIER_EMAIL
  const cashierPassword = process.env.CASHIER_PASSWORD
  if (cashierEmail && cashierPassword) {
    await ensureUser({
      email: cashierEmail,
      password: cashierPassword,
      name: process.env.CASHIER_NAME || 'Cashier',
      role: 'cashier',
      label: 'Cashier',
    })
  } else {
    console.log('CASHIER_EMAIL/CASHIER_PASSWORD not set, skipping cashier seed.')
  }

  // Ensure settings row exists
  const [s] = await db.select({ id: settings.id }).from(settings).limit(1)
  if (!s) {
    await db.insert(settings).values({})
    console.log('Default settings created.')
  } else {
    console.log('Settings already exist, skipping.')
  }

  console.log('Seed complete.')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
