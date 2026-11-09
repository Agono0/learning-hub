/**
 * ImageStore port — binary storage for occlusion-card images.
 *
 * The default implementation is DB-backed: bytes are base64-encoded into the
 * `images.data` column (SQLite TEXT), so uploads work identically on Windows,
 * Android (Tauri) and browser/worker runtimes — no filesystem required. The
 * Node-fs implementation (uuid-named files under data/images) is kept as the
 * LEGACY READ fallback: rows written before the DB store existed have
 * `data = NULL` and their bytes still live on disk.
 *
 * This remains a deliberate seam: route handlers talk ONLY to the port via
 * {@link getImageStore} and never touch node:fs themselves. Both
 * implementations load their node:/@learning-hub/db imports lazily (inside the
 * methods), so merely importing this module keeps them out of the static
 * import graph — the DB store also runs on the sqlite-wasm driver, making the
 * handlers portable to a non-Node runtime.
 *
 * Contract:
 * - `put(bytes, ext, mime)` stores the bytes (DB store: base64 in
 *   `images.data`; fs store: a uuid-named file) AND registers the `images`
 *   row, resolving to `{ id, rowId }`: the storage id served later
 *   (`images.filename`) and the registry row's autoincrement id the caller
 *   returns to clients. The MIME type arrives pre-validated — the upload route
 *   owns the allow-list + size cap — and is stored verbatim; it is what `get`
 *   later serves as the content type.
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

/** Port for image byte storage (DB-backed by default, fs-backed legacy fallback). */
export interface ImageStore {
  /** Store bytes + register the images row; resolves to the storage and row ids. */
  put(bytes: Uint8Array, ext: string, mime: string): Promise<{ id: string; rowId: number }>
  /** Resolve a storage id (as returned by {@link ImageStore.put}) to its bytes. */
  get(id: string): Promise<StoredImage | null>
}

/**
 * Binary-safe base64 without Buffer (btoa/atob exist in Node >= 16 and every
 * browser/worker), chunked so String.fromCharCode stays under engine arg limits.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** DB-backed implementation: base64 bytes in the images.data column. */
export class DbImageStore implements ImageStore {
  async put(bytes: Uint8Array, ext: string, mime: string): Promise<{ id: string; rowId: number }> {
    const { createImage } = await import('@learning-hub/db')
    const cleanExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
    const id = `${globalThis.crypto.randomUUID()}.${cleanExt}`
    const row = createImage({
      filename: id,
      mime: mime || 'application/octet-stream',
      data: bytesToBase64(bytes),
    })
    return { id, rowId: row.id }
  }

  async get(id: string): Promise<StoredImage | null> {
    const { getImageByFilename } = await import('@learning-hub/db')
    const row = getImageByFilename(id)
    if (!row) return null
    if (row.data) return { bytes: base64ToBytes(row.data), contentType: row.mime }
    // Legacy row (pre-DB-storage): the bytes live on disk under the images dir.
    return new NodeFsImageStore().get(id)
  }
}

/**
 * Node-fs implementation: uuid-named files under the images dir. Legacy only —
 * kept for reading pre-DB-storage rows (data = NULL) and for test doubles.
 */
export class NodeFsImageStore implements ImageStore {
  async put(bytes: Uint8Array, ext: string, mime: string): Promise<{ id: string; rowId: number }> {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const path = await import('node:path')
    const { createImage, resolveImagesDir } = await import('@learning-hub/db')
    const id = `${globalThis.crypto.randomUUID()}.${ext}`
    const dir = resolveImagesDir()
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(/*turbopackIgnore: true*/ dir, id), bytes)
    // Register the row too (data stays NULL): get() resolves the content type
    // from row.mime, and the DB store's fallback needs the row to find the file.
    const row = createImage({
      filename: id,
      mime: mime || 'application/octet-stream',
    })
    return { id, rowId: row.id }
  }

  async get(id: string): Promise<StoredImage | null> {
    const { readFile } = await import('node:fs/promises')
    const path = await import('node:path')
    const { getImageByFilename, resolveImagesDir } = await import('@learning-hub/db')
    // The registry row is authoritative for the content type (row.mime).
    const row = getImageByFilename(id)
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

/** The store handlers consume; DB-backed by default (fs kept as legacy fallback). */
export function getImageStore(): ImageStore {
  return (active ??= new DbImageStore())
}

/** Seam for tests (and exotic runtimes): replace the active store. */
export function setImageStore(store: ImageStore): void {
  active = store
}
