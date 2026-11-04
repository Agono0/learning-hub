/**
 * ImageStore port — binary storage for occlusion-card images.
 *
 * This is a deliberate seam: today's implementation writes uuid-named files
 * under data/images (Node fs); a later stage swaps in a DB-backed store. Route
 * handlers talk ONLY to the port via {@link getImageStore} and never touch
 * node:fs themselves, so the same handlers stay runnable in a non-Node runtime
 * once the port has a worker-compatible implementation. The Node
 * implementation loads its node:/@learning-hub/db imports lazily (inside the
 * methods), so merely importing this module keeps them out of the static
 * import graph.
 *
 * Contract:
 * - `put` stores the bytes under a freshly generated uuid name and resolves to
 *   a storage id; the caller persists that id (today: the `images.filename`
 *   column) and passes it back to `get` later.
 * - `get(storageId)` resolves the bytes + content type, or null when the
 *   object or its metadata is gone. Mapping the app-level id (images table
 *   row) to a storage id stays with the caller — that is registry metadata,
 *   not byte storage.
 */

/** Bytes of a stored image plus the content type it is served with. */
export interface StoredImage {
  bytes: Uint8Array
  contentType: string
}

/** Port for image byte storage (fs-backed today, DB-backed in a later stage). */
export interface ImageStore {
  /** Store bytes under a new uuid name; resolves to the storage id to persist. */
  put(bytes: Uint8Array, ext: string): Promise<{ id: string }>
  /** Resolve a storage id (as returned by {@link ImageStore.put}) to its bytes. */
  get(id: string): Promise<StoredImage | null>
}

/** Node-fs implementation: uuid-named files under the images dir. */
class NodeFsImageStore implements ImageStore {
  async put(bytes: Uint8Array, ext: string): Promise<{ id: string }> {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const path = await import('node:path')
    const { resolveImagesDir } = await import('@learning-hub/db')
    const id = `${globalThis.crypto.randomUUID()}.${ext}`
    const dir = resolveImagesDir()
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(/*turbopackIgnore: true*/ dir, id), bytes)
    return { id }
  }

  async get(id: string): Promise<StoredImage | null> {
    const { readFile } = await import('node:fs/promises')
    const path = await import('node:path')
    const { eq } = await import('drizzle-orm')
    const { db, images, resolveImagesDir } = await import('@learning-hub/db')
    // The registry row is authoritative for the content type (row.mime).
    const [row] = await db
      .select({ mime: images.mime })
      .from(images)
      .where(eq(images.filename, id))
      .limit(1)
    if (!row) return null
    try {
      const buf = await readFile(path.join(/*turbopackIgnore: true*/ resolveImagesDir(), id))
      return { bytes: new Uint8Array(buf), contentType: row.mime }
    } catch {
      return null
    }
  }
}

let active: ImageStore | undefined

/** The store handlers consume; fs-backed until a DB-backed impl lands. */
export function getImageStore(): ImageStore {
  return (active ??= new NodeFsImageStore())
}

/** Seam for the later DB-backed stage (and test doubles): replace the store. */
export function setImageStore(store: ImageStore): void {
  active = store
}
