/**
 * /api/images — upload an image for occlusion cards. Bytes go to the ImageStore
 * port (src/server/storage.ts — data/images today); the returned storage id is
 * registered in the `images` table together with the validated MIME type.
 * POST multipart/form-data: { file } → { id, filename, mime }
 */
import { db, images } from '@learning-hub/db'
import { ApiError, withRoute } from '@/lib/api'
import { getImageStore } from '@/server/storage'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export const POST = withRoute(async (req: Request) => {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new ApiError(400, 'file required (multipart)')
  }
  const file = form.get('file')
  if (!(file instanceof File))
    return Response.json({ error: 'file required (multipart)' }, { status: 400 })
  if (!ALLOWED.has(file.type))
    return Response.json({ error: `unsupported type: ${file.type}` }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: 'image exceeds 8MB' }, { status: 400 })

  const ext =
    (file.name.split('.').pop() ?? 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
  const stored = await getImageStore().put(new Uint8Array(await file.arrayBuffer()), ext)

  const [row] = await db.insert(images).values({ filename: stored.id, mime: file.type }).returning()
  return Response.json(
    { ok: true, id: row!.id, filename: row!.filename, mime: row!.mime },
    { status: 201 },
  )
})
