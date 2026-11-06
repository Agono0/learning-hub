/**
 * /api/world/market — Browse marketplace items and purchase using verified study coins.
 */
import { z } from 'zod'
import { getCoinBalance, getMarketCatalog, purchaseMarketItem } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const purchaseSchema = z.object({
  itemId: z.string().min(1),
})

export const GET = withRoute(async () => {
  const catalog = getMarketCatalog()
  const balance = getCoinBalance('default')
  return Response.json({
    ok: true,
    catalog,
    balance,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, purchaseSchema)
  const result = purchaseMarketItem(body.itemId, 'default')
  const newBalance = getCoinBalance('default')

  return Response.json({
    ok: true,
    avatar: result.avatar,
    transaction: result.transaction,
    balance: newBalance,
  })
})
