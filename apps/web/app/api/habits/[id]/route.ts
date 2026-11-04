// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/habits/[id]/route).
export { PATCH, DELETE } from '@/server/handlers/habits/[id]/route'

export const runtime = 'nodejs'
