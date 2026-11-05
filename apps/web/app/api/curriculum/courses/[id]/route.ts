// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/curriculum/courses/[id]/route).
export { GET, DELETE } from '@/server/handlers/curriculum/courses/[id]/route'

export const runtime = 'nodejs'
