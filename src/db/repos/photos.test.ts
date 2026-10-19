import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../schema'
import { NotFoundError } from '../errors'
import type { Repositories } from './index'
import { MAX_ITEM_PHOTOS, type NewPhoto } from './photos'
import { T0, makeRepos, type TestSetup } from './testHelpers'

/**
 * Photos and the metadata/bytes split. The assertions here are mostly aggregates
 * over a whole store — `photoBlobs.count()`, `countLive()`, the tombstones store —
 * so a database shared between tests is useless: one test's bytes show up in the
 * next test's wasted-space figure. Each test gets its own database and drops it.
 */
let app: TestSetup
let repos: Repositories
let seq = 0

beforeEach(() => {
  app = makeRepos(`photos-${(seq += 1)}`)
  repos = app.repos
})

afterEach(async () => {
  app.close()
  await deleteDatabase(app.db.name)
})

/**
 * Fixed bytes, not real photographs. The repository never looks inside a Blob;
 * it only stores it and reports its size, so a few bytes are enough to prove
 * the metadata/bytes split stays in step.
 */
const blob = (text: string) => new Blob([text], { type: 'image/jpeg' })

const photoOf = (ownerKind: 'find' | 'item', ownerId: string, label: string): NewPhoto => ({
  ownerKind,
  ownerId,
  full: blob(`${label} full`),
  thumb: blob(`${label} thumb`),
})

describe('photos.add', () => {
  it('keeps the metadata and the bytes in separate stores', async () => {
    const find = await repos.finds.create()
    const photo = await repos.photos.add(photoOf('find', find.id, 'one'))

    expect(photo.ownerId).toBe(find.id)
    expect(photo.ownerKind).toBe('find')
    expect(photo.deletedAt).toBe(0)
    expect(photo.hasThumb).toBe(true)
    expect(photo.bytes).toBe(blob('one full').size)
    expect(photo.createdAt).toBe(T0)
    // The capture time defaults to the moment the photo was added, because a
    // photo taken at the hole and logged minutes later is still that photo.
    expect(photo.captureAt).toBe(T0)

    const row = await repos.db.photoBlobs.get(photo.id)
    expect(row?.photoId).toBe(photo.id)
    expect(row?.full.size).toBe(photo.bytes)

    const stored = await repos.db.photos.get(photo.id)
    expect(stored).toBeDefined()
    // This is the whole point of the split: reading the metadata must not drag
    // the image bytes through IndexedDB.
    expect(stored).not.toHaveProperty('full')
  })

  it('records the capture position when the photo brought one', async () => {
    const find = await repos.finds.create()
    const photo = await repos.photos.add({
      ...photoOf('find', find.id, 'geo'),
      captureAt: T0 - 60_000,
      captureLat: 39.5,
      captureLon: -98.5,
      widthPx: 1600,
      heightPx: 1200,
    })
    expect(photo.captureAt).toBe(T0 - 60_000)
    expect(photo.captureLat).toBe(39.5)
    expect(photo.captureLon).toBe(-98.5)
    expect(photo.widthPx).toBe(1600)
    expect(photo.heightPx).toBe(1200)
  })

  it('leaves a thumbnail-less photo readable rather than inventing one', async () => {
    const find = await repos.finds.create()
    const photo = await repos.photos.add({
      ownerKind: 'find',
      ownerId: find.id,
      full: blob('no thumb'),
    })
    expect(photo.hasThumb).toBe(false)
    const row = await repos.db.photoBlobs.get(photo.id)
    expect(row?.thumb).toBeNull()
  })

  it('refuses a seventh photo for one Item, because the cap is a rule and not a hint', async () => {
    const find = await repos.finds.create()
    const item = await repos.items.create(find.id)
    for (let i = 0; i < MAX_ITEM_PHOTOS; i++) {
      await repos.photos.add(photoOf('item', item.id, `p${i}`))
    }
    expect(await repos.photos.forOwner(item.id)).toHaveLength(MAX_ITEM_PHOTOS)

    await expect(repos.photos.add(photoOf('item', item.id, 'too many'))).rejects.toThrow(
      `Item ${item.id} already has ${MAX_ITEM_PHOTOS} photos`,
    )
    expect(await repos.photos.forOwner(item.id)).toHaveLength(MAX_ITEM_PHOTOS)
    // The rejected photo must not leave orphan bytes behind.
    expect(await repos.db.photoBlobs.count()).toBe(MAX_ITEM_PHOTOS)
  })

  it('does not cap the photos on a Find, only warns in the UI', async () => {
    const find = await repos.finds.create()
    for (let i = 0; i < 12; i++) await repos.photos.add(photoOf('find', find.id, `f${i}`))
    expect(await repos.photos.forOwner(find.id)).toHaveLength(12)
  })
})

describe('photos and their owner counts', () => {
  it('keeps the Item photoCount in step through add, bin, restore and purge', async () => {
    const find = await repos.finds.create()
    const item = await repos.items.create(find.id)

    const a = await repos.photos.add(photoOf('item', item.id, 'a'))
    await repos.photos.add(photoOf('item', item.id, 'b'))
    expect((await repos.items.get(item.id))?.photoCount).toBe(2)

    await repos.photos.softDelete(a.id)
    expect(await repos.photos.forOwner(item.id)).toHaveLength(1)
    expect((await repos.items.get(item.id))?.photoCount).toBe(1)

    await repos.photos.restore(a.id)
    expect((await repos.items.get(item.id))?.photoCount).toBe(2)

    await repos.photos.remove(a.id)
    expect((await repos.items.get(item.id))?.photoCount).toBe(1)
  })

  it('keeps the Find photoCount in step, which is what the warn-past-10 rule reads', async () => {
    const find = await repos.finds.create()
    const photo = await repos.photos.add(photoOf('find', find.id, 'one'))
    expect((await repos.finds.get(find.id))?.photoCount).toBe(1)

    await repos.photos.softDelete(photo.id)
    expect((await repos.finds.get(find.id))?.photoCount).toBe(0)

    await repos.photos.restore(photo.id)
    expect((await repos.finds.get(find.id))?.photoCount).toBe(1)

    await repos.photos.remove(photo.id)
    expect((await repos.finds.get(find.id))?.photoCount).toBe(0)
  })

  it('counts a Find with no photos as zero, so the detail screen shows nothing', async () => {
    const find = await repos.finds.create()
    expect(await repos.photos.forOwner(find.id)).toEqual([])
    expect((await repos.finds.get(find.id))?.photoCount).toBe(0)
  })
})

describe('photos in the Bin', () => {
  it('keeps the bytes for thirty days so the photo can come back', async () => {
    const find = await repos.finds.create()
    const photo = await repos.photos.add(photoOf('find', find.id, 'binned'))
    app.setNow(T0 + 60_000)
    await repos.photos.softDelete(photo.id)

    expect(await repos.photos.forOwner(find.id)).toEqual([])
    expect(await repos.photos.countBinned()).toBe(1)
    expect((await repos.db.photos.get(photo.id))?.deletedAt).toBe(T0 + 60_000)
    // The bytes are still there, which is why the Bin reports wasted space.
    expect(await repos.db.photoBlobs.get(photo.id)).toBeTruthy()

    await repos.photos.restore(photo.id)
    expect(await repos.photos.countBinned()).toBe(0)
    expect(await repos.photos.forOwner(find.id)).toHaveLength(1)
  })

  it('hard-deletes the metadata and the bytes together, and leaves a tombstone', async () => {
    const find = await repos.finds.create()
    const photo = await repos.photos.add(photoOf('find', find.id, 'gone'))
    await repos.photos.remove(photo.id)

    expect(await repos.db.photos.get(photo.id)).toBeUndefined()
    expect(await repos.db.photoBlobs.get(photo.id)).toBeUndefined()
    const mark = await repos.db.tombstones.get(photo.id)
    expect(mark?.store).toBe('photos')
    expect(mark?.purgedAt).toBe(T0)
  })

  it('destroys the photos of a record that is being purged, Bin included', async () => {
    const find = await repos.finds.create()
    const kept = await repos.photos.add(photoOf('find', find.id, 'kept'))
    const binned = await repos.photos.add(photoOf('find', find.id, 'binned'))
    await repos.photos.softDelete(binned.id)

    expect(await repos.photos.removeAllForOwners([find.id])).toBe(2)
    expect(await repos.db.photos.count()).toBe(0)
    expect(await repos.db.photoBlobs.count()).toBe(0)
    const marks = await repos.db.tombstones.toArray()
    expect(marks.map((t) => t.id).sort()).toEqual([binned.id, kept.id].sort())
  })
})

describe('photos the Diagnostics screen asks about', () => {
  it('counts live photos and the bytes they hold', async () => {
    const find = await repos.finds.create()
    await repos.photos.add({ ownerKind: 'find', ownerId: find.id, full: blob('1234') })
    await repos.photos.add({ ownerKind: 'find', ownerId: find.id, full: blob('56789') })
    expect(await repos.photos.countLive()).toBe(2)
    expect(await repos.photos.totalBytes()).toBe(blob('1234').size + blob('56789').size)
  })

  it('does not count binned photos as live, but does report them as wasted space', async () => {
    const find = await repos.finds.create()
    const photo = await repos.photos.add({ ownerKind: 'find', ownerId: find.id, full: blob('gone') })
    await repos.photos.softDelete(photo.id)
    expect(await repos.photos.countLive()).toBe(0)
    expect(await repos.photos.totalBytes()).toBe(0)
    expect(await repos.photos.countBinned()).toBe(1)
  })

  it('finds metadata whose bytes never arrived, the blank-thumbnail failure', async () => {
    const find = await repos.finds.create()
    const good = await repos.photos.add(photoOf('find', find.id, 'good'))
    await repos.db.photoBlobs.delete(good.id)

    const orphans = await repos.photos.orphanedMetadata()
    expect(orphans.map((p) => p.id)).toEqual([good.id])
  })

  it('rejects a photo whose owner does not exist, which is how a bad import row fails', async () => {
    await expect(repos.photos.assertOwnerExists('find', 'no-such-find')).rejects.toThrow(NotFoundError)
    const find = await repos.finds.create()
    await expect(repos.photos.assertOwnerExists('find', find.id)).resolves.toBeUndefined()
    const item = await repos.items.create(find.id)
    await expect(repos.photos.assertOwnerExists('item', item.id)).resolves.toBeUndefined()
  })
})
