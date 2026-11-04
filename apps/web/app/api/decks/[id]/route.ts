// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/decks/[id]/route).
export { PATCH, DELETE } from '@/server/handlers/decks/[id]/route'

export const runtime = 'nodejs'
