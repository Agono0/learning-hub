// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/tasks-views/[id]/route).
export { PATCH, DELETE } from '@/server/handlers/tasks-views/[id]/route'

export const runtime = 'nodejs'
