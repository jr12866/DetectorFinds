import type { AppDatabase } from '../schema'
import { newId } from '../ids'
import { betweenClosed } from '../ranges'
import { LIVE, UNASSIGNED, type Find, type Item, type LatLngBounds, type PositionSource } from '../types'
import { clockFrom, computeNeedsDetail, deriveFromItems, tombstone, type NewFind, type RepoOptions } from './common'

/**
 * Finds (GLOSSARY: Find) — one hole, one recovery event, zero or more Items.
 *
 * Three derived fields are maintained here and nowhere else: `itemCount`,
 * `categoryId` and `needsDetail`. They are stored rather than computed on read
 * because every one of them is an index the app queries — the Needs Detail queue
 * and the coloured pins both have to be an index scan, not a join across 12,000
 * Items.
 */
export function createFindsRepository(db: AppDatabase, options: RepoOptions = {}) {
  const clock = clockFrom(options)

  function blank(id: string, at: number): Find {
    return {
      id,
      foundAt: at,
      siteId: UNASSIGNED,
      sessionId: UNASSIGNED,
      categoryId: UNASSIGNED,
      lat: 0,
      lon: 0,
      altitudeM: 0,
      accuracyM: 0,
      positionSource: 'hand',
      itemCount: 0,
      photoCount: 0,
      note: '',
      needsDetail: 1,
      createdAt: at,
      updatedAt: at,
      deletedAt: LIVE,
      cascadeDeletedFrom: '',
    }
  }

  /** Every Item under a Find, binned or not: `deriveFromItems` decides which still count. */
  async function itemsOf(findId: string): Promise<Item[]> {
    return db.items.where('findId').equals(findId).toArray()
  }

  /** Re-derives the stored counts for one Find after its Items changed. */
  async function refresh(findId: string): Promise<Find | undefined> {
    const find = await db.finds.get(findId)
    if (!find) return undefined
    const merged = deriveFromItems(find, await itemsOf(findId))
    merged.updatedAt = clock()
    await db.finds.put(merged)
    return merged
  }

  /** Applies a patch and re-derives `needsDetail` from the result. */
  async function update(id: string, patch: Partial<Omit<Find, 'id' | 'createdAt'>>): Promise<Find | undefined> {
    const existing = await db.finds.get(id)
    if (!existing) return undefined
    const merged: Find = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: clock() }
    merged.needsDetail = computeNeedsDetail({ note: merged.note, itemCount: merged.itemCount })
    await db.finds.put(merged)
    return merged
  }

  return {
    refresh,

    async create(input: NewFind = {}): Promise<Find> {
      const at = clock()
      const id = input.id ?? newId()
      const find: Find = { ...blank(id, at), ...input, id, createdAt: at, updatedAt: at, deletedAt: LIVE }
      find.needsDetail = computeNeedsDetail({ note: find.note, itemCount: find.itemCount })
      await db.finds.put(find)
      return find
    },

    get(id: string): Promise<Find | undefined> {
      return db.finds.get(id)
    },

    /** Applies a patch and re-derives `needsDetail` from the result. */
    update,

    /** R-EDIT-1: a Find can be moved between Site and Session. */
    reassign(id: string, refs: { siteId?: string; sessionId?: string }): Promise<Find | undefined> {
      return update(id, refs)
    },

    /** R-EDIT-1: moving a pin records how the new position was chosen. */
    setPosition(
      id: string,
      position: { lat: number; lon: number; accuracyM?: number; altitudeM?: number; source: PositionSource },
    ): Promise<Find | undefined> {
      return update(id, {
        lat: position.lat,
        lon: position.lon,
        accuracyM: position.accuracyM ?? 0,
        altitudeM: position.altitudeM ?? 0,
        positionSource: position.source,
      })
    },

    /**
     * R-EDIT-2: the Bin. The Find goes, and so do its Items — but each Item
     * records which Find dragged it down, so restoring the Find does not bring
     * back an Item the user had already binned on its own.
     */
    async softDelete(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.finds, db.items, async () => {
        const find = await db.finds.get(id)
        if (!find) return
        await db.finds.put({ ...find, deletedAt: at, updatedAt: at })
        await db.items
          .where('findId')
          .equals(id)
          .filter((item) => item.deletedAt === LIVE)
          .modify({ deletedAt: at, cascadeDeletedFrom: id, updatedAt: at })
      })
    },

    /** Brings the Find back, plus only the Items the Bin took down with it. */
    async restore(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.finds, db.items, async () => {
        const find = await db.finds.get(id)
        if (!find) return
        await db.finds.put({ ...find, deletedAt: LIVE, cascadeDeletedFrom: '', updatedAt: at })
        await db.items
          .where('findId')
          .equals(id)
          .filter((item) => item.deletedAt !== LIVE && item.cascadeDeletedFrom === id)
          .modify({ deletedAt: LIVE, cascadeDeletedFrom: '', updatedAt: at })
      })
    },

    /**
     * Removes the Find for good: its Items, their photos and the bytes under
     * them. A tombstone is written here rather than at soft-delete time, because
     * a tombstone means "this id is gone from the database", which is only true
     * once the Bin has been emptied.
     */
    async purge(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.finds, db.items, db.photos, db.photoBlobs, db.tombstones, async () => {
        const itemIds = await db.items.where('findId').equals(id).primaryKeys()
        const photoIds = await db.photos.where('ownerId').equals(id).primaryKeys()
        for (const itemId of itemIds) photoIds.push(...(await db.photos.where('ownerId').equals(itemId).primaryKeys()))
        await db.photoBlobs.bulkDelete(photoIds)
        await db.photos.bulkDelete(photoIds)
        await db.items.bulkDelete(itemIds)
        await db.finds.delete(id)
        await db.tombstones.bulkPut([
          tombstone('finds', id, at),
          ...itemIds.map((itemId) => tombstone('items', itemId, at)),
          ...photoIds.map((photoId) => tombstone('photos', photoId, at)),
        ])
      })
    },

    /** Everything not in the Bin, newest first. The Finds list and the map. */
    list(limit = 0): Promise<Find[]> {
      const query = db.finds.where('[deletedAt+foundAt]').between([LIVE, -Infinity], [LIVE, Infinity])
      return limit > 0 ? query.reverse().limit(limit).toArray() : query.reverse().toArray()
    },

    bySite(siteId: string): Promise<Find[]> {
      return db.finds
        .where('[siteId+foundAt]')
        .between([siteId, -Infinity], [siteId, Infinity])
        .filter((find) => find.deletedAt === LIVE)
        .reverse()
        .toArray()
    },

    bySession(sessionId: string): Promise<Find[]> {
      return db.finds
        .where('[sessionId+foundAt]')
        .between([sessionId, -Infinity], [sessionId, Infinity])
        .filter((find) => find.deletedAt === LIVE)
        .reverse()
        .toArray()
    },

    byCategory(categoryId: string): Promise<Find[]> {
      return db.finds
        .where('[categoryId+foundAt]')
        .between([categoryId, -Infinity], [categoryId, Infinity])
        .filter((find) => find.deletedAt === LIVE)
        .reverse()
        .toArray()
    },

    /** Finds between two times, both ends included, newest first. Used by the date-range filter. */
    between(fromMs: number, toMs: number): Promise<Find[]> {
      return betweenClosed(db.finds.where('foundAt'), fromMs, toMs)
        .filter((find) => find.deletedAt === LIVE)
        .reverse()
        .toArray()
    },

    /** The Needs Detail queue, oldest first: the oldest unfinished log is the one to fix. */
    needsDetail(): Promise<Find[]> {
      return db.finds
        .where('[needsDetail+foundAt]')
        .between([1, -Infinity], [1, Infinity])
        .filter((find) => find.deletedAt === LIVE)
        .toArray()
    },

    countLive(): Promise<number> {
      return db.finds.where('deletedAt').equals(LIVE).count()
    },

    /** The badge on the Needs Detail queue. Same rule, same index. */
    countNeedsDetail(): Promise<number> {
      return db.finds
        .where('[needsDetail+foundAt]')
        .between([1, -Infinity], [1, Infinity])
        .filter((find) => find.deletedAt === LIVE)
        .count()
    },

    /** R-STATS-1 starting point: how many live Finds each Site holds. */
    async countBySite(): Promise<Record<string, number>> {
      const out: Record<string, number> = {}
      out[UNASSIGNED] = await db.finds.where('[deletedAt+siteId]').equals([LIVE, UNASSIGNED]).count()
      const siteIds = await db.sites.where('deletedAt').equals(LIVE).primaryKeys()
      for (const siteId of siteIds) {
        if (siteId === UNASSIGNED) continue
        out[siteId] = await db.finds.where('[deletedAt+siteId]').equals([LIVE, siteId]).count()
      }
      return out
    },

    /**
     * Live Finds inside a rectangle. There is no spatial index: lat/lon are not
     * keys, because a bounding box needs two ranges at once and IndexedDB cannot
     * do that with a compound key. A scan over the live Finds is the honest
     * answer at 5,000 rows, and PRD §11 is what makes it safe to say so.
     */
    inBounds(bounds: LatLngBounds): Promise<Find[]> {
      const { sw, ne } = bounds
      return db.finds
        .where('deletedAt')
        .equals(LIVE)
        .filter(
          (find) =>
            find.lat >= sw[0] && find.lat <= ne[0] && find.lon >= sw[1] && find.lon <= ne[1],
        )
        .toArray()
    },
  }
}

export type FindsRepository = ReturnType<typeof createFindsRepository>
