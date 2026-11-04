/**
 * /api/images/[id] — serve an image file from data/images by table id.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { db, images, resolveImagesDir } from '@learning-hub/db'

export const runtime = 'nodejs'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const [row] = await db.select().from(images).where(eq(images.id, Number(id))).limit(1)
  if (!row) return new Response('not found', { status: 404 })
  try {
    const buf = await readFile(path.join(/*turbopackIgnore: true*/ resolveImagesDir(), row.filename))
    return new Response(new Uint8Array(buf), {
      headers: {
        'content-type': row.mime,
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('image file missing', { status: 404 })
  }
}
