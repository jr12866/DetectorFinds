import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../schema'
import { LIVE } from '../types'
import type { TestSetup } from './testHelpers'
import { DAY, MINUTE, T0, makeRepos } from './testHelpers'

/**
 * The Bin (R-EDIT-2). What matters here is that one list covers every store the
 * user can throw away, that the 30-day clock is the same clock everywhere, and
 * that restore and purge always go through the repository that owns the cascade
 * rules — otherwise the Bin and the rest of the app disagree about what a delete
 * means.
 */
describe('bin', () => {
  let app: TestSetup

  // Almost every Bin assertion is an aggregate over all the stores, so a database
  // shared between tests is useless here: one test's binned Find shows up in the
  // next test's list. Each test gets its own database and drops it afterwards.
  let seq = 0

  beforeEach(() => {
    app = makeRepos(`bin-${(seq += 1)}`)
  })

  afterEach(async () => {
    await app.close()
    await deleteDatabase(app.db.name)
  })

  describe('the list', () => {
    it('shows a binned Find with a label a user can read', async () => {
      const { finds, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      await finds.update(find.id, { categoryId: 'coin' })
      await finds.softDelete(find.id)

      const entries = await bin.list()
      expect(entries).toHaveLength(1)
      expect(entries[0].store).toBe('finds')
      expect(entries[0].id).toBe(find.id)
      // Category and date, so a Bin full of Finds is still recognisable.
      expect(entries[0].label).toBe('coin · 2026-01-15')
      expect(entries[0].deletedAt).toBe(T0)
    })

    it('calls a binned Find with no Items a Miss', async () => {
      const { finds, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      await finds.softDelete(find.id)

      const [entry] = await bin.list()
      expect(entry.label).toBe('Miss · 2026-01-15')
    })

    it('labels an Item with its category, sub-type and note', async () => {
      const { finds, items, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      const item = await items.create(find.id, {
        categoryId: 'coin',
        subType: 'wheat penny',
        note: 'shiny',
      })
      await items.softDelete(item.id)

      const [entry] = await bin.list()
      expect(entry.label).toBe('coin · wheat penny · shiny')
    })

    it('labels the rest of the stores from what the user would recognise', async () => {
      const { sites, landowners, permissions, sessions, detectors, bin } = app.repos

      const site = await sites.create({ name: 'Hoffman farm' })
      const landowner = await landowners.create({ name: 'R. Hoffman' })
      const permission = await permissions.create({ grantedOn: '2026-01-01', siteIds: [site.id] })
      const session = await sessions.create({ date: '2026-01-15' })
      const detector = await detectors.create({ make: 'Minelab', model: 'Manticore' })
      const preset = await detectors.createPreset({
        detectorId: detector.id,
        name: 'Field',
        settingsText: 'Disc 0-12, notches iron',
      })

      await sites.softDelete(site.id)
      await landowners.softDelete(landowner.id)
      await permissions.softDelete(permission.id)
      await sessions.softDelete(session.id)
      await detectors.softDelete(detector.id)
      await detectors.deletePreset(preset.id)

      const byStore = new Map((await bin.list()).map((entry) => [entry.store, entry.label]))
      expect(byStore.get('sites')).toBe('Hoffman farm')
      expect(byStore.get('landowners')).toBe('R. Hoffman')
      expect(byStore.get('permissions')).toBe('Permission granted 2026-01-01')
      expect(byStore.get('sessions')).toBe('Session 2026-01-15')
      expect(byStore.get('detectors')).toBe('Minelab Manticore')
      expect(byStore.get('presets')).toBe('Field')
    })

    it('puts the newest deletion first', async () => {
      const { finds, bin } = app.repos
      const first = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      const second = await finds.create({ lat: 39.1, lon: -98, foundAt: T0 })

      await finds.softDelete(first.id)
      app.setNow(T0 + 5 * MINUTE)
      await finds.softDelete(second.id)

      const entries = await bin.list()
      expect(entries.map((entry) => entry.id)).toEqual([second.id, first.id])
    })

    it('counts what is in the Bin', async () => {
      const { finds, items, sites, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      const item = await items.create(find.id, { categoryId: 'coin' })
      const site = await sites.create({ name: 'Home patch' })

      expect(await bin.count()).toBe(0)

      await finds.softDelete(find.id)
      await sites.softDelete(site.id)
      // The Item went with it, and the Bin counts both, because the user can
      // bring either one back.
      expect(await bin.count()).toBe(3)
      expect(await bin.count()).toBe(await bin.list().then((rows) => rows.length))
      expect(item.id).toBeTruthy()
    })

    it('reports thirty days left for something binned right now', async () => {
      const { finds, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      await finds.softDelete(find.id)

      const [entry] = await bin.list()
      expect(bin.daysLeft(entry)).toBe(30)
    })

    it('counts down as the retention period runs out', async () => {
      const { finds, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      await finds.softDelete(find.id)

      app.setNow(T0 + 29 * DAY + 1)
      const [entry] = await bin.list()
      expect(bin.daysLeft(entry)).toBe(1)
    })
  })

  describe('restore', () => {
    it('brings a Find back through the owning repository', async () => {
      const { finds, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      await finds.softDelete(find.id)
      expect((await finds.get(find.id))?.deletedAt).toBe(T0)

      await bin.restore('finds', find.id)

      expect((await finds.get(find.id))?.deletedAt).toBe(LIVE)
      expect(await bin.list()).toEqual([])
    })

    it('brings back a cascade-deleted Item but not one the user binned by hand', async () => {
      const { finds, items, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      const carried = await items.create(find.id, { categoryId: 'coin', note: 'carried down' })
      const handPinned = await items.create(find.id, { categoryId: 'button', note: 'binned myself' })

      await finds.softDelete(find.id)
      // The user reaches into the Bin for the second Item while the Find is away.
      await items.softDelete(handPinned.id)

      const carriedEntry = (await bin.list()).find((entry) => entry.id === carried.id)
      const handEntry = (await bin.list()).find((entry) => entry.id === handPinned.id)
      expect(carriedEntry?.cascadeDeletedFrom).toBe(find.id)
      expect(handEntry?.cascadeDeletedFrom).toBe('')

      await bin.restore('finds', find.id)

      expect((await items.get(carried.id))?.deletedAt).toBe(LIVE)
      expect((await items.get(handPinned.id))?.deletedAt).toBeGreaterThan(LIVE)
    })

    it('brings a photo back and gives the Item its count back', async () => {
      const { finds, items, photos, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      const item = await items.create(find.id, { categoryId: 'coin' })
      const photo = await photos.add({
        ownerKind: 'item',
        ownerId: item.id,
        full: new Blob(['photo-bytes'], { type: 'image/jpeg' }),
      })
      expect((await items.get(item.id))?.photoCount).toBe(1)

      await photos.softDelete(photo.id)
      expect((await items.get(item.id))?.photoCount).toBe(0)
      expect(await photos.countBinned()).toBe(1)

      await bin.restore('photos', photo.id)

      expect((await items.get(item.id))?.photoCount).toBe(1)
      expect(await photos.countBinned()).toBe(0)
      expect(await app.db.photoBlobs.count()).toBe(1)
    })

    it('brings a Preset back without touching its Detector', async () => {
      const { detectors, bin } = app.repos
      const detector = await detectors.create({ make: 'Nokta', model: 'Makro' })
      const preset = await detectors.createPreset({
        detectorId: detector.id,
        name: 'Gold',
        settingsText: 'boost 2',
      })

      await detectors.deletePreset(preset.id)
      expect(await detectors.presetsFor(detector.id)).toHaveLength(0)

      await bin.restore('presets', preset.id)

      expect(await detectors.presetsFor(detector.id)).toHaveLength(1)
      expect((await detectors.get(detector.id))?.deletedAt).toBe(LIVE)
    })
  })

  describe('purge', () => {
    it('destroys one record and writes its tombstone', async () => {
      const { finds, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      await finds.softDelete(find.id)

      await bin.purge('finds', find.id)

      expect(await finds.get(find.id)).toBeUndefined()
      expect(await app.db.items.count()).toBe(0)

      const marks = await app.db.tombstones.toArray()
      expect(marks).toHaveLength(1)
      expect(marks[0]).toMatchObject({ store: 'finds', id: find.id, deletedAt: T0 })
    })

    it('destroys a photo and its bytes together', async () => {
      const { finds, photos, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      const photo = await photos.add({
        ownerKind: 'find',
        ownerId: find.id,
        full: new Blob(['bytes'], { type: 'image/jpeg' }),
      })
      await photos.softDelete(photo.id)
      expect(await app.db.photoBlobs.count()).toBe(1)

      await bin.purge('photos', photo.id)

      expect(await app.db.photos.count()).toBe(0)
      // A metadata row with no bytes, or bytes with no metadata row, is a leak.
      expect(await app.db.photoBlobs.count()).toBe(0)
      const marks = await app.db.tombstones.toArray()
      expect(marks.map((mark) => mark.store)).toEqual(['photos'])
    })

    it('destroys a Session and its Track points', async () => {
      const { sessions, bin } = app.repos
      const session = await sessions.create({ date: '2026-01-15' })
      await sessions.addTrackPoint(session.id, { lat: 39, lon: -98, at: T0 })
      await sessions.addTrackPoint(session.id, { lat: 39.001, lon: -98, at: T0 + MINUTE })
      expect(await app.db.trackPoints.count()).toBe(2)

      await sessions.softDelete(session.id)
      await bin.purge('sessions', session.id)

      expect(await app.db.sessions.count()).toBe(0)
      expect(await app.db.trackPoints.count()).toBe(0)

      const marks = await app.db.tombstones.toArray()
      expect(marks.filter((mark) => mark.store === 'sessions')).toHaveLength(1)
      expect(marks.filter((mark) => mark.store === 'trackPoints')).toHaveLength(2)
    })

    it('destroys a Detector and its Presets', async () => {
      const { detectors, bin } = app.repos
      const detector = await detectors.create({ make: 'Garrett', model: 'AT Pro' })
      await detectors.createPreset({ detectorId: detector.id, name: 'One', settingsText: 'a' })
      await detectors.createPreset({ detectorId: detector.id, name: 'Two', settingsText: 'b' })

      await detectors.softDelete(detector.id)
      await bin.purge('detectors', detector.id)

      expect(await app.db.detectors.count()).toBe(0)
      expect(await app.db.presets.count()).toBe(0)
      const stores = (await app.db.tombstones.toArray()).map((mark) => mark.store)
      expect(stores.filter((store) => store === 'detectors')).toHaveLength(1)
      expect(stores.filter((store) => store === 'presets')).toHaveLength(2)
    })

    it('leaves a record that is still inside the retention period', async () => {
      const { finds, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      await finds.softDelete(find.id)

      app.setNow(T0 + 29 * DAY)
      expect(await bin.purgeOlderThan()).toBe(0)
      expect((await finds.get(find.id))?.deletedAt).toBe(T0)
      expect(await app.db.tombstones.count()).toBe(0)
    })

    it('destroys a record once it has been in the Bin for thirty days', async () => {
      const { finds, items, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      const item = await items.create(find.id, { categoryId: 'coin' })
      await finds.softDelete(find.id)

      app.setNow(T0 + 31 * DAY)
      // Two Bin entries were cleared, even though purging the Find alone
      // would have taken the cascade-deleted Item with it.
      expect(await bin.purgeOlderThan()).toBe(2)

      expect(await finds.get(find.id)).toBeUndefined()
      expect(await items.get(item.id)).toBeUndefined()
      expect(await app.db.tombstones.count()).toBe(2)
    })

    it('empties the whole Bin and tombstones everything it removed', async () => {
      const { finds, items, sites, bin } = app.repos
      const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      await items.create(find.id, { categoryId: 'coin' })
      const other = await finds.create({ lat: 39.2, lon: -98, foundAt: T0 })
      const site = await sites.create({ name: 'Trespass patch' })

      await finds.softDelete(find.id)
      await finds.softDelete(other.id)
      await sites.softDelete(site.id)
      expect(await bin.count()).toBe(4)

      expect(await bin.empty()).toBe(4)

      expect(await bin.count()).toBe(0)
      expect(await finds.countLive()).toBe(0)
      expect(await app.db.items.count()).toBe(0)
      expect(await app.db.tombstones.count()).toBe(4)
    })

    it('leaves live records alone when the Bin is emptied', async () => {
      const { finds, bin } = app.repos
      const kept = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
      const gone = await finds.create({ lat: 39.1, lon: -98, foundAt: T0 })
      await finds.softDelete(gone.id)

      await bin.empty()

      expect((await finds.get(kept.id))?.deletedAt).toBe(LIVE)
      expect(await finds.get(gone.id)).toBeUndefined()
    })
  })

  it('holds nothing when nothing has been deleted', async () => {
    const { finds, bin } = app.repos
    await finds.create({ lat: 39, lon: -98, foundAt: T0 })

    expect(await bin.list()).toEqual([])
    expect(await bin.count()).toBe(0)
    expect(await bin.purgeOlderThan()).toBe(0)
    expect(await bin.empty()).toBe(0)
  })
})
