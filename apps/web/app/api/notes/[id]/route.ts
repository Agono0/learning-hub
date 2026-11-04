// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/notes/[id]/route).
export { GET, PATCH, DELETE } from '@/server/handlers/notes/[id]/route'

export const runtime = 'nodejs'
