// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/reading/[id]/route).
export { GET, PATCH, DELETE } from '@/server/handlers/reading/[id]/route'

export const runtime = 'nodejs'
