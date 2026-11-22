// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/tasks-reminders/[id]/route).
export { PATCH, DELETE } from '@/server/handlers/tasks-reminders/[id]/route'

export const runtime = 'nodejs'
