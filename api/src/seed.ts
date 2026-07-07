import bcrypt from 'bcrypt'
import { db } from './db/client.js'
import { users, settings } from './db/schema.js'
import { eq } from 'drizzle-orm'

const SALT_ROUNDS = 10

async function seed() {
  const email = process.env.OWNER_EMAIL || 'owner@pos.local'
  const password = process.env.OWNER_PASSWORD || 'change-me'
  const name = process.env.OWNER_NAME || 'Owner'

  // Check if owner exists
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing) {
    console.log(`Owner "${email}" already exists, skipping.`)
  } else {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    await db.insert(users).values({ name, email, passwordHash, role: 'owner' })
    console.log(`Owner "${email}" created.`)
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
