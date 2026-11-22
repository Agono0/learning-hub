// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/tasks/[id]/route).
export { GET, PATCH, DELETE } from '@/server/handlers/tasks/[id]/route'

export const runtime = 'nodejs'
