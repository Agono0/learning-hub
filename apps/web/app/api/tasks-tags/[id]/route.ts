// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/tasks-tags/[id]/route).
export { PATCH, DELETE } from '@/server/handlers/tasks-tags/[id]/route'

export const runtime = 'nodejs'
