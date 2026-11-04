// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/ideas/[id]/route).
export { GET, PATCH, DELETE } from '@/server/handlers/ideas/[id]/route'

export const runtime = 'nodejs'
