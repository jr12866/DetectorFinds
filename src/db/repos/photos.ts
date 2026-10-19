import type { AppDatabase } from '../schema'
import { NotFoundError } from '../errors'
import { newId } from '../ids'
import { LIVE, type Photo, type PhotoBlobRow, type PhotoOwnerKind } from '../types'
import { clockFrom, tombstone, type RepoOptions } from './common'

/** R-PHOTO-4: the hard cap on an Item. A Find's photos are uncapped. */
export const MAX_ITEM_PHOTOS = 6

/** What the caller hands over: the bytes plus whatever the decoder learned. */
export interface NewPhoto {
  ownerKind: PhotoOwnerKind
  ownerId: string
  full: Blob
  thumb?: Blob | null
  captureAt?: number
  captureLat?: number
  captureLon?: number
  widthPx?: number
  heightPx?: number
  id?: string
}

/**
 * Photos, split across two stores: `photos` for the metadata and `photoBlobs`
 * for the bytes (ADR-0003, and see the note on PhotoBlobRow in types.ts).
 *
 * The split is the whole point of this file. Listing a Find's photos must not
 * read a single JPEG byte, and R-EXPORT-2's photo-free backup must be able to
 * dump every store except one.
 */
export function createPhotosRepository(db: AppDatabase, options: RepoOptions = {}) {
  const clock = clockFrom(options)

  async function liveCountFor(ownerId: string): Promise<number> {
    return db.photos.where('ownerId').equals(ownerId).filter((photo) => photo.deletedAt === LIVE).count()
  }

  /**
   * Keeps the owner's stored photoCount in step with the metadata rows. The Item
   * count is what the 6 cap reads (R-PHOTO-6); the Find count is what the soft
   * warn-past-10 and the empty photo strip read.
   */
  async function syncOwnerCount(ownerKind: PhotoOwnerKind, ownerId: string): Promise<void> {
    const count = await liveCountFor(ownerId)
    if (ownerKind === 'item') {
      const item = await db.items.get(ownerId)
      if (!item) return
      await db.items.put({ ...item, photoCount: count, updatedAt: clock() })
      return
    }
    const find = await db.finds.get(ownerId)
    if (!find) return
    await db.finds.put({ ...find, photoCount: count, updatedAt: clock() })
  }

  return {
    /**
     * Stores one photo. Refuses a seventh photo on an Item rather than letting the
     * UI be the only thing that knows the rule (R-PHOTO-4).
     */
    async add(input: NewPhoto): Promise<Photo> {
      if (input.ownerKind === 'item') {
        const existing = await liveCountFor(input.ownerId)
        if (existing >= MAX_ITEM_PHOTOS) {
          throw new Error(`Item ${input.ownerId} already has ${MAX_ITEM_PHOTOS} photos`)
        }
      }
      const at = clock()
      const id = input.id ?? newId()
      const photo: Photo = {
        id,
        ownerKind: input.ownerKind,
        ownerId: input.ownerId,
        captureAt: input.captureAt ?? at,
        captureLat: input.captureLat ?? 0,
        captureLon: input.captureLon ?? 0,
        widthPx: input.widthPx ?? 0,
        heightPx: input.heightPx ?? 0,
        bytes: input.full.size,
        hasThumb: Boolean(input.thumb),
        createdAt: at,
        deletedAt: LIVE,
      }
      const blobRow: PhotoBlobRow = { photoId: id, full: input.full, thumb: input.thumb ?? null }
      await db.transaction('rw', db.photos, db.photoBlobs, db.finds, db.items, async () => {
        await db.photos.put(photo)
        await db.photoBlobs.put(blobRow)
        await syncOwnerCount(input.ownerKind, input.ownerId)
      })
      return photo
    },

    get(id: string): Promise<Photo | undefined> {
      return db.photos.get(id)
    },

    /** Metadata only. This is what a list or a detail screen reads. */
    forOwner(ownerId: string): Promise<Photo[]> {
      return db.photos
        .where('[ownerId+createdAt]')
        .between([ownerId, -Infinity], [ownerId, Infinity])
        .filter((photo) => photo.deletedAt === LIVE)
        .toArray()
    },

    /** The bytes for one photo, when the app actually needs to show or export it. */
    blob(id: string): Promise<PhotoBlobRow | undefined> {
      return db.photoBlobs.get(id)
    },

    /** Object URL for the thumbnail, falling back to the full image. */
    async objectUrl(id: string, prefer: 'thumb' | 'full' = 'thumb'): Promise<string | null> {
      const row = await db.photoBlobs.get(id)
      if (!row) return null
      const blob = prefer === 'thumb' ? (row.thumb ?? row.full) : row.full
      return URL.createObjectURL(blob)
    },

    /**
     * R-EDIT-2: removing one photo from a detail screen puts it in the Bin. The
     * bytes stay on the device for 30 days so the photo can come back; the owner's
     * count drops immediately, because the count is about what the user can see.
     */
    async softDelete(id: string): Promise<void> {
      await db.transaction('rw', db.photos, db.finds, db.items, async () => {
        const photo = await db.photos.get(id)
        if (!photo) return
        await db.photos.put({ ...photo, deletedAt: clock() })
        await syncOwnerCount(photo.ownerKind, photo.ownerId)
      })
    },

    async restore(id: string): Promise<void> {
      await db.transaction('rw', db.photos, db.finds, db.items, async () => {
        const photo = await db.photos.get(id)
        if (!photo) return
        await db.photos.put({ ...photo, deletedAt: LIVE })
        await syncOwnerCount(photo.ownerKind, photo.ownerId)
      })
    },

    /** Hard delete: the metadata and the bytes go together, or the split leaks. */
    async remove(id: string): Promise<void> {
      await db.transaction('rw', db.photos, db.photoBlobs, db.finds, db.items, db.tombstones, async () => {
        const photo = await db.photos.get(id)
        if (!photo) return
        await db.photoBlobs.delete(id)
        await db.photos.delete(id)
        const at = clock()
        await db.tombstones.put(tombstone('photos', id, at))
        await syncOwnerCount(photo.ownerKind, photo.ownerId)
      })
    },

    /**
     * Removes every photo belonging to a record, used by the purge paths. A photo
     * whose owner is gone has nowhere to be restored to, so it is destroyed with
     * them rather than sitting in the Bin for thirty days.
     */
    async removeAllForOwners(ownerIds: string[]): Promise<number> {
      return db.transaction('rw', db.photos, db.photoBlobs, db.items, db.tombstones, async () => {
        const ids: string[] = []
        for (const ownerId of ownerIds) ids.push(...(await db.photos.where('ownerId').equals(ownerId).primaryKeys()))
        await db.photoBlobs.bulkDelete(ids)
        await db.photos.bulkDelete(ids)
        const at = clock()
        await db.tombstones.bulkPut(ids.map((id) => tombstone('photos', id, at)))
        return ids.length
      })
    },

    /** Photos sitting in the Bin, whose bytes are still taking up room. */
    countBinned(): Promise<number> {
      return db.photos.where('deletedAt').above(LIVE).count()
    },

    countLive(): Promise<number> {
      return db.photos.where('deletedAt').equals(LIVE).count()
    },

    /** Bytes held by the photo store, for the Diagnostics screen. */
    async totalBytes(): Promise<number> {
      const rows = await db.photos.where('deletedAt').equals(LIVE).toArray()
      return rows.reduce((total, photo) => total + photo.bytes, 0)
    },

    /**
     * Owners whose photo metadata has lost its bytes. Only reachable if a write
     * half-completed, but it is the failure that would show up as a blank
     * thumbnail on a phone, so Diagnostics can be asked about it.
     */
    async orphanedMetadata(): Promise<Photo[]> {
      const rows = await db.photos.where('deletedAt').equals(LIVE).toArray()
      const missing: Photo[] = []
      for (const row of rows) {
        if (!(await db.photoBlobs.get(row.id))) missing.push(row)
      }
      return missing
    },

    /** Used by the import path in step 11 to reject a photo with no owner. */
    async assertOwnerExists(ownerKind: PhotoOwnerKind, ownerId: string): Promise<void> {
      const table = ownerKind === 'find' ? db.finds : db.items
      if (!(await table.get(ownerId))) throw new NotFoundError(ownerKind === 'find' ? 'finds' : 'items', ownerId)
    },
  }
}

export type PhotosRepository = ReturnType<typeof createPhotosRepository>
