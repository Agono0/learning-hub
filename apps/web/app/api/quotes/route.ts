// Route shim — the implementation lives in the runtime-neutral handler (@/server/handlers/quotes/route).
export { GET, POST, PATCH } from '@/server/handlers/quotes/route'
export type { QuoteRow, QuoteLike } from '@/server/handlers/quotes/route'

export const runtime = 'nodejs'
