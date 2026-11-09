/**
 * /api/images/[id] — serve an image by table id. The registry row maps the id
 * to the storage id; the bytes come from the ImageStore port
 * (src/server/storage.ts — images.data base64, with a legacy data/images
 * fallback for rows stored on disk before the DB store existed).
 */
import { getImage } from '@learning-hub/db'
import { getImageStore } from '@/server/storage'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const row = getImage(Number(id))
  if (!row) return new Response('not found', { status: 404 })
  const stored = await getImageStore().get(row.filename)
  if (!stored) return new Response('image file missing', { status: 404 })
  return new Response(new Uint8Array(stored.bytes), {
    headers: {
      'content-type': stored.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
