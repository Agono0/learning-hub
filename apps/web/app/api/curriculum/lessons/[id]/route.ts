// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/curriculum/lessons/[id]/route).
export { GET, POST } from '@/server/handlers/curriculum/lessons/[id]/route'

export const runtime = 'nodejs'
