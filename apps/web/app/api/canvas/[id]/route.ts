// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/canvas/[id]/route).
export { GET, PATCH, DELETE } from '@/server/handlers/canvas/[id]/route'

export const runtime = 'nodejs'
