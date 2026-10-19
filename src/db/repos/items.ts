import type { AppDatabase } from '../schema'
import { NotFoundError } from '../errors'
import { newId } from '../ids'
import { betweenClosed } from '../ranges'
import { LIVE, type Item, type Photo } from '../types'
import { clockFrom, deriveFromItems, findCategoryId, itemsBelongingTo, tombstone, type NewItem, type RepoOptions } from './common'

/**
 * Items (GLOSSARY: Item) — what came out of a hole.
 *
 * The rules this file owns, all of them from PRD §10:
 * - deleting an Item never deletes its Find, not even when it was the last one.
 *   The Find becomes a Miss, which is a complete record (R-EDIT-4).
 * - every Item change re-derives the Find's `itemCount`, `categoryId` and
 *   `needsDetail`, so those three stored fields can never drift.
 * - an Item can be re-filed to a different Find (R-EDIT-1), which re-derives both
 *   Finds.
 */
export function createItemsRepository(db: AppDatabase, options: RepoOptions = {}) {
  const clock = clockFrom(options)

  function blank(id: string, findId: string, at: number): Item {
    return {
      id,
      findId,
      categoryId: '',
      subType: '',
      tags: [],
      isSilver: 'unknown',
      isGold: 'unknown',
      dateOnYear: 0,
      dateOnText: '',
      country: '',
      ruler: '',
      mintMark: '',
      denomination: '',
      composition: '',
      material: '',
      weightG: 0,
      lengthMm: 0,
      widthMm: 0,
      thicknessMm: 0,
      depthM: 0,
      condition: '',
      cleaningNotes: '',
      isIdentified: false,
      identificationNotes: '',
      note: '',
      photoCount: 0,
      createdAt: at,
      updatedAt: at,
      deletedAt: LIVE,
      cascadeDeletedFrom: '',
    }
  }

  /** Re-derives one Find from the Items that now belong to it. */
  async function refreshFind(findId: string): Promise<void> {
    const find = await db.finds.get(findId)
    if (!find) return
    const items = await itemsOf(findId)
    await db.finds.put({ ...deriveFromItems(find, items), updatedAt: clock() })
  }

  /** Every Item under a Find, binned or not: `itemsBelongingTo` decides which still count. */
  async function itemsOf(findId: string): Promise<Item[]> {
    return db.items.where('findId').equals(findId).toArray()
  }

  return {
    refreshFind,

    /**
     * R-ITEM-1: an Item always belongs to a Find. A Find that does not exist is a
     * caller bug, and failing loudly is better than storing an orphan.
     */
    async create(findId: string, input: NewItem = {}): Promise<Item> {
      const find = await db.finds.get(findId)
      if (!find) throw new NotFoundError('finds', findId)
      const at = clock()
      const id = input.id ?? newId()
      const item: Item = {
        ...blank(id, findId, at),
        ...input,
        id,
        findId,
        createdAt: at,
        updatedAt: at,
        deletedAt: LIVE,
      }
      await db.transaction('rw', db.finds, db.items, async () => {
        await db.items.put(item)
        await refreshFind(findId)
      })
      return item
    },

    get(id: string): Promise<Item | undefined> {
      return db.items.get(id)
    },

    /** Live Items for a Find, oldest first — the order the detail screen shows them. */
    forFind(findId: string): Promise<Item[]> {
      return db.items
        .where('findId')
        .equals(findId)
        .filter((item) => item.deletedAt === LIVE)
        .sortBy('createdAt')
    },

    allLive(): Promise<Item[]> {
      return db.items.where('deletedAt').equals(LIVE).toArray()
    },

    async update(id: string, patch: Partial<Omit<Item, 'id' | 'createdAt' | 'findId'>>): Promise<Item | undefined> {
      const existing = await db.items.get(id)
      if (!existing) return undefined
      // `findId` is re-forced as well as `id`: re-filing an Item between Finds has
      // to go through moveToFind, which re-derives both Finds. A patch that quietly
      // changed it would leave the old Find claiming an Item it no longer has.
      const merged: Item = {
        ...existing,
        ...patch,
        id,
        findId: existing.findId,
        createdAt: existing.createdAt,
        updatedAt: clock(),
      }
      await db.transaction('rw', db.finds, db.items, async () => {
        await db.items.put(merged)
        await refreshFind(merged.findId)
      })
      return merged
    },

    /**
     * R-EDIT-2: the Item goes to the Bin on its own, and `cascadeDeletedFrom`
     * stays empty so that binning and later restoring its Find does not quietly
     * undo a decision the user made about this one Item.
     */
    async softDelete(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.finds, db.items, async () => {
        const item = await db.items.get(id)
        if (!item) return
        await db.items.put({ ...item, deletedAt: at, cascadeDeletedFrom: '', updatedAt: at })
        await refreshFind(item.findId)
      })
    },

    async restore(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.finds, db.items, async () => {
        const item = await db.items.get(id)
        if (!item) return
        await db.items.put({ ...item, deletedAt: LIVE, cascadeDeletedFrom: '', updatedAt: at })
        await refreshFind(item.findId)
      })
    },

    /** Removes the Item and the photos hanging off it for good. */
    async purge(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.finds, db.items, db.photos, db.photoBlobs, db.tombstones, async () => {
        const item = await db.items.get(id)
        if (!item) return
        const photoIds = await db.photos.where('ownerId').equals(id).primaryKeys()
        await db.photoBlobs.bulkDelete(photoIds)
        await db.photos.bulkDelete(photoIds)
        await db.items.delete(id)
        await db.tombstones.bulkPut([
          tombstone('items', id, at),
          ...photoIds.map((photoId) => tombstone('photos', photoId, at)),
        ])
        await refreshFind(item.findId)
      })
    },

    /**
     * R-EDIT-1: re-filing. Both Finds are re-derived, because the one losing the
     * Item may become a Miss and the one gaining it may stop needing detail.
     */
    async moveToFind(id: string, toFindId: string): Promise<Item | undefined> {
      const target = await db.finds.get(toFindId)
      if (!target) throw new NotFoundError('finds', toFindId)
      return db.transaction('rw', db.finds, db.items, async () => {
        const item = await db.items.get(id)
        if (!item) return undefined
        const fromFindId = item.findId
        const moved: Item = { ...item, findId: toFindId, updatedAt: clock() }
        await db.items.put(moved)
        await refreshFind(toFindId)
        if (fromFindId !== toFindId) await refreshFind(fromFindId)
        return moved
      })
    },

    /**
     * The Item that gives a Find its pin colour, or '' for a Miss. Reads through
     * the same rule the derived field is written with, so the popup card can never
     * disagree with the colour already on the map.
     */
    async categoryOf(findId: string): Promise<string> {
      return findCategoryId(itemsBelongingTo({ id: findId }, await itemsOf(findId)))
    },

    /** R-ITEM-3: silver and gold are separate questions, both tri-state. */
    byMetal(flag: 'isSilver' | 'isGold', value: 'yes' | 'no' | 'unknown' = 'yes'): Promise<Item[]> {
      return db.items.where(flag).equals(value).filter((item) => item.deletedAt === LIVE).toArray()
    },

    byCategory(categoryId: string): Promise<Item[]> {
      return db.items
        .where('categoryId')
        .equals(categoryId)
        .filter((item) => item.deletedAt === LIVE)
        .toArray()
    },

    bySubType(subType: string): Promise<Item[]> {
      return db.items.where('subType').equals(subType).filter((item) => item.deletedAt === LIVE).toArray()
    },

    byMaterial(material: string): Promise<Item[]> {
      return db.items.where('material').equals(material).filter((item) => item.deletedAt === LIVE).toArray()
    },

    /** R-ITEM-6: Date On year range, both years included, 0 (unknown) never matches a range. */
    dateOnBetween(fromYear: number, toYear: number): Promise<Item[]> {
      return betweenClosed(db.items.where('dateOnYear'), fromYear, toYear)
        .filter((item) => item.deletedAt === LIVE)
        .toArray()
    },

    taggedWith(tag: string): Promise<Item[]> {
      return db.items.where('tags').equals(tag).filter((item) => item.deletedAt === LIVE).toArray()
    },

    countLive(): Promise<number> {
      return db.items.where('deletedAt').equals(LIVE).count()
    },

    /** Distinct values for the filter sheet's pickers. */
    async distinct(field: 'categoryId' | 'subType' | 'material'): Promise<string[]> {
      const items = await db.items.where('deletedAt').equals(LIVE).toArray()
      const values = new Set<string>()
      for (const item of items) {
        const value = item[field]
        if (typeof value === 'string' && value !== '') values.add(value)
      }
      return [...values].sort()
    },

    /** Photo counts are kept on the Item so the 6-photo cap is a lookup (R-PHOTO-4). */
    async setPhotoCount(itemId: string, count: number): Promise<void> {
      const item = await db.items.get(itemId)
      if (!item) return
      await db.items.put({ ...item, photoCount: count, updatedAt: clock() })
    },

    photosOf(itemId: string): Promise<Photo[]> {
      return db.photos
        .where('ownerId')
        .equals(itemId)
        .filter((photo) => photo.deletedAt === LIVE)
        .toArray()
    },
  }
}

export type ItemsRepository = ReturnType<typeof createItemsRepository>
