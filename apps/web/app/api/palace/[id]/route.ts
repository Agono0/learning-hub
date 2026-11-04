// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/palace/[id]/route).
export { GET, PATCH, DELETE } from '@/server/handlers/palace/[id]/route'

export const runtime = 'nodejs'
