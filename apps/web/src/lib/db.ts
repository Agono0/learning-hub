/**
 * Server-only DB accessor for the Next.js app.
 * DO NOT import from client components — better-sqlite3 is a native module.
 */
import { db } from '@learning-hub/db'

export { db }
