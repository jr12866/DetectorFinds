import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase, readSchemaVersion } from './schema'
import { makeRepos, T0, type TestSetup } from './repos/testHelpers'
import { findCategoryId, needsDetailFor } from './repos/common'
import {
  FULL_SEED,
  clearAllData,
  countRows,
  fullSeedAtPhotoBytes,
  seedDatabase,
  smallSeed,
  type SeedPlan,
  type SeedReport,
} from './seed'
import { JPEG_HEIGHT_PX, JPEG_MIN_BYTES, JPEG_WIDTH_PX } from './jpegFixture'
import { LIVE, type Find, type Item, type Photo, type Session, type TrackPoint } from './types'

/**
 * The seeder is what every number in step 01 is measured against, so a wrong
 * seeder makes every number a lie. These tests check the two things a benchmark
 * depends on: that the row counts land exactly on the plan, and that the
 * derived fields the seeder computes for itself (it does not write through the
 * repositories) match what the repositories would have computed.
 */

let seq = 0
let app: TestSetup | null = null

beforeEach(() => {
  seq += 1
  app = makeRepos(`seed-${seq}`)
})

afterEach(async () => {
  app?.close()
  await deleteDatabase(`seed-${seq}`)
})

function db() {
  if (!app) throw new Error('no database open')
  return app.db
}

/** Pinned "now", so a seed run is reproducible and the Bin clock is knowable. */
async function seed(plan: SeedPlan = smallSeed()): Promise<SeedReport> {
  return seedDatabase(db(), plan, { now: T0 })
}

async function allFinds(): Promise<Find[]> {
  return db().finds.toArray()
}

async function allItems(): Promise<Item[]> {
  return db().items.toArray()
}

async function allPhotos(): Promise<Photo[]> {
  return db().photos.toArray()
}

async function allSessions(): Promise<Session[]> {
  return db().sessions.toArray()
}

async function allPoints(): Promise<TrackPoint[]> {
  return db().trackPoints.toArray()
}

describe('seed: row counts', () => {
  it('writes exactly the rows the plan asks for', async () => {
    const plan = smallSeed({ finds: 25, items: 60, photos: 30, sessions: 5, sites: 4, trackPoints: 200 })
    const report = await seed(plan)

    expect(await countRows(db())).toEqual({
      sites: 4,
      landowners: plan.landowners,
      permissions: plan.permissions,
      detectors: plan.detectors,
      presets: plan.presets,
      sessions: 5,
      finds: 25,
      items: 60,
      photos: 30,
      photoBlobs: plan.photoBlobCount,
      trackPoints: 200,
    })
    // The report is what Diagnostics shows, so it has to agree with the database.
    expect(report.counts.finds).toBe(25)
    expect(report.counts.trackPoints).toBe(200)
    expect(report.stages.map((stage) => stage.rows).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(200 + 25 + 60 + 30)
  })

  it('is deterministic: the same plan and seed produce the same rows', async () => {
    const plan = smallSeed({ finds: 12, items: 30, sessions: 3, trackPoints: 60 })
    const first = await seed(plan)
    const findsA = (await allFinds()).map((row) => JSON.stringify(row))
    const itemsA = (await allItems()).map((row) => JSON.stringify(row))
    await clearAllData(db())
    const second = await seed(plan)
    const findsB = (await allFinds()).map((row) => JSON.stringify(row))
    const itemsB = (await allItems()).map((row) => JSON.stringify(row))

    expect(findsB).toEqual(findsA)
    expect(itemsB).toEqual(itemsA)
    expect(second.counts).toEqual(first.counts)
  })

  it('keeps every generated position in metres and every time inside its Session', async () => {
    await seed()
    const [finds, sessions, points] = await Promise.all([allFinds(), allSessions(), allPoints()])
    const bySession = new Map(sessions.map((session) => [session.id, session]))

    for (const find of finds) {
      expect(find.lat).toBeGreaterThanOrEqual(-90)
      expect(find.lat).toBeLessThanOrEqual(90)
      expect(find.lon).toBeGreaterThanOrEqual(-180)
      expect(find.lon).toBeLessThanOrEqual(180)
      // Metres, R-UNIT-2: a phone's GPS accuracy is single-digit metres, never 30 km.
      expect(find.accuracyM).toBeGreaterThanOrEqual(0)
      expect(find.accuracyM).toBeLessThan(100)

      const session = bySession.get(find.sessionId)
      expect(session).toBeDefined()
      expect(find.foundAt).toBeGreaterThanOrEqual(session!.startedAt)
      expect(find.foundAt).toBeLessThanOrEqual(session!.endedAt)
      // A Find inherits its Site from the Session it was logged on.
      expect(find.siteId).toBe(session!.siteId)
    }

    for (const point of points) {
      const session = bySession.get(point.sessionId)
      expect(session).toBeDefined()
      expect(point.at).toBeGreaterThanOrEqual(session!.startedAt)
      expect(point.at).toBeLessThanOrEqual(session!.endedAt)
      expect(point.accuracyM).toBeLessThan(100)
    }
  })
})

describe('seed: derived fields', () => {
  it('computes itemCount, categoryId and needsDetail the way the repositories would', async () => {
    await seed()
    const [finds, items] = await Promise.all([allFinds(), allItems()])
    const byFind = new Map<string, Item[]>()
    for (const item of items) {
      const list = byFind.get(item.findId) ?? []
      list.push(item)
      byFind.set(item.findId, list)
    }

    let checked = 0
    for (const find of finds) {
      // Which Items still describe their Find: the live ones plus the ones the Bin
      // took down because their Find went with it. A Find binned together with its
      // Items is not a Miss, so the Bin does not label it as one (R-EDIT-2).
      const mine = (byFind.get(find.id) ?? []).filter(
        (item) => item.deletedAt === LIVE || item.cascadeDeletedFrom === find.id,
      )
      expect(find.itemCount).toBe(mine.length)
      expect(find.categoryId).toBe(findCategoryId(mine))
      expect(find.needsDetail).toBe(needsDetailFor(find.note, mine.length))
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)

    // The case the rule exists for, so a seeder that quietly stopped cascading
    // would fail here rather than leaving the rule untested.
    const binnedWithItems = finds.filter((find) => find.deletedAt !== LIVE && find.itemCount > 0)
    expect(binnedWithItems.length).toBeGreaterThan(0)
    for (const find of binnedWithItems) {
      expect(find.categoryId).not.toBe('')
      expect(find.needsDetail).toBe(0)
    }
  })

  it('counts only live photos in photoCount, which is what the warn-past-10 rule reads', async () => {
    await seed(smallSeed({ binnedFindRatio: 0.4 }))
    const [finds, photos] = await Promise.all([allFinds(), allPhotos()])
    const mine = (ownerId: string) => photos.filter((photo) => photo.ownerId === ownerId)

    let binnedPhotos = 0
    for (const find of finds) {
      binnedPhotos += mine(find.id).filter((photo) => photo.deletedAt !== LIVE).length
      expect(find.photoCount).toBe(mine(find.id).filter((photo) => photo.deletedAt === LIVE).length)
    }
    for (const item of await allItems()) {
      expect(item.photoCount).toBe(mine(item.id).filter((photo) => photo.deletedAt === LIVE).length)
    }
    // Without this the assertion above would pass on a seed that never bins anything.
    expect(binnedPhotos).toBeGreaterThan(0)
  })

  it('keeps each Session total equal to the points that actually exist', async () => {
    await seed()
    const [sessions, points] = await Promise.all([allSessions(), allPoints()])
    const perSession = new Map<string, TrackPoint[]>()
    for (const point of points) {
      const list = perSession.get(point.sessionId) ?? []
      list.push(point)
      perSession.set(point.sessionId, list)
    }

    for (const session of sessions) {
      const mine = perSession.get(session.id) ?? []
      expect(session.trackPointCount).toBe(mine.length)
      // The stored distance is the sum of the per-step distances, to rounding.
      const walked = mine.reduce((total, point) => total + point.distanceM, 0)
      expect(Math.abs(session.trackDistanceM - walked)).toBeLessThan(1)
      // Points are numbered from 0, and the numbering runs forwards in time.
      const ordered = mine
        .map((point) => ({ seq: Number(point.id.split('-').pop()), at: point.at }))
        .sort((a, b) => a.seq - b.seq)
      expect(ordered.map((point) => point.seq)).toEqual(mine.map((_, index) => index))
      const times = ordered.map((point) => point.at)
      expect([...times].sort((a, b) => a - b)).toEqual(times)
    }
  })
})

describe('seed: the Bin and its cascade', () => {
  it('bins a Find together with its Items and its photos, and names the parent', async () => {
    await seed(smallSeed({ binnedFindRatio: 0.3 }))
    const [finds, items, photos] = await Promise.all([allFinds(), allItems(), allPhotos()])
    const binned = finds.filter((find) => find.deletedAt !== LIVE)
    expect(binned.length).toBeGreaterThan(0)

    for (const find of binned) {
      for (const item of items.filter((row) => row.findId === find.id)) {
        expect(item.deletedAt).toBe(find.deletedAt)
        expect(item.cascadeDeletedFrom).toBe(find.id)
      }
      for (const photo of photos.filter((row) => row.ownerId === find.id)) {
        expect(photo.deletedAt).toBe(find.deletedAt)
      }
    }
    // The mirror image: nothing under a live Find is in the Bin.
    for (const find of finds.filter((row) => row.deletedAt === LIVE)) {
      expect(items.some((item) => item.findId === find.id && item.deletedAt !== LIVE)).toBe(false)
      expect(photos.some((photo) => photo.ownerId === find.id && photo.deletedAt !== LIVE)).toBe(false)
    }
  })

  it('makes Misses at the planned ratio, with no Items, and queues the silent ones for detail', async () => {
    const plan = smallSeed({ finds: 40, missRatio: 0.25 })
    await seed(plan)
    const finds = await allFinds()
    const misses = finds.filter((find) => find.categoryId === '')
    expect(misses.length).toBe(Math.round(plan.finds * plan.missRatio))
    for (const miss of misses) expect(miss.itemCount).toBe(0)

    const queued = finds.filter((find) => find.needsDetail === 1)
    expect(queued.length).toBeGreaterThan(0)
    for (const find of queued) {
      expect(find.itemCount).toBe(0)
      expect(find.note.trim()).toBe('')
    }
  })
})

describe('seed: photo bytes', () => {
  it('never claims bytes that are not really in photoBlobs', async () => {
    const plan = smallSeed({ photos: 20, photoBlobCount: 3 })
    const report = await seed(plan)
    const photos = await allPhotos()
    const withBytes = photos.filter((photo) => photo.bytes > 0)

    expect(withBytes.length).toBe(3)
    let stored = 0
    for (const photo of withBytes) {
      const blob = await db().photoBlobs.get(photo.id)
      expect(blob, `no blob row for ${photo.id}`).toBeDefined()
      expect(blob!.full.size).toBe(photo.bytes)
      expect(blob!.thumb, `no thumbnail for ${photo.id}`).not.toBeNull()
      expect(blob!.thumb!.size).toBe(plan.photoThumbBytes)
      stored += blob!.full.size + blob!.thumb!.size
    }
    // The rest is metadata only, which is what makes a 15,000-row photo store
    // benchmarkable on a laptop.
    expect(photos.filter((photo) => photo.bytes === 0).length).toBe(17)
    // The report sums what was written, not what the plan asked for. Photo sizes
    // vary from one image to the next, so a figure taken from the plan would
    // drift away from the blobs, and it is the figure a storage estimate is
    // checked against.
    expect(report.photoBytes).toBe(stored)
  })

  it('stores a decodable JPEG for every photo the plan gives bytes to', async () => {
    const plan = smallSeed({ photos: 4, photoBlobCount: 4 })
    await seed(plan)
    const photos = (await allPhotos()).filter((photo) => photo.bytes > 0)
    expect(photos.length).toBe(4)

    for (const photo of photos) {
      const blob = await db().photoBlobs.get(photo.id)
      const bytes = new Uint8Array(await blob!.full.arrayBuffer())
      expect(bytes.length, 'the row and the Photo record disagree about the size').toBe(photo.bytes)
      // SOI at the front, EOI at the back, and a marker segment between them:
      // enough structure that a real decoder is handed a JPEG rather than a
      // buffer of the right length.
      expect(bytes[0]).toBe(0xff)
      expect(bytes[1]).toBe(0xd8)
      expect(bytes[2]).toBe(0xff)
      expect(bytes[bytes.length - 2]).toBe(0xff)
      expect(bytes[bytes.length - 1]).toBe(0xd9)
      // The dimensions have to describe the image that is actually in the blob,
      // or the photo viewer sizes its canvas from a guess.
      expect(photo.widthPx).toBe(JPEG_WIDTH_PX)
      expect(photo.heightPx).toBe(JPEG_HEIGHT_PX)
    }
  })
})

describe('seed: the photo size dial', () => {
  it('splits one figure per photo into image and thumbnail', () => {
    const plan = fullSeedAtPhotoBytes(40_000)

    expect(plan.photoBlobBytes + plan.photoThumbBytes).toBe(40_000)
    expect(plan.photoThumbBytes).toBe(8_000)
    // Nothing else about the ceiling moves. The dial changes what a photo costs,
    // not how many rows the benchmark reads.
    expect(plan).toEqual({ ...FULL_SEED, photoBlobBytes: 32_000, photoThumbBytes: 8_000 })
  })

  it('never asks for a blob smaller than the photograph inside it', () => {
    for (const bytes of [1, 5_000, 9_000, 200_000]) {
      const plan = fullSeedAtPhotoBytes(bytes)
      expect(plan.photoBlobBytes, `${bytes} bytes per photo`).toBeGreaterThanOrEqual(JPEG_MIN_BYTES)
      expect(plan.photoThumbBytes, `${bytes} bytes per photo`).toBeGreaterThanOrEqual(JPEG_MIN_BYTES)
    }
  })
})

describe('clearAllData', () => {
  it('empties every store and keeps the schema', async () => {
    await seed()
    expect((await countRows(db())).finds).toBeGreaterThan(0)

    await clearAllData(db())

    for (const value of Object.values(await countRows(db()))) expect(value).toBe(0)
    // Not a delete: the stores and their version survive, which is what step 11's
    // "clear my data, keep my app" needs.
    expect(await readSchemaVersion(`seed-${seq}`)).toBe(2)
  })
})

describe('seed: progress', () => {
  it('reports each store as it writes, and never past the total', async () => {
    const seen = new Map<string, number>()
    await seedDatabase(db(), smallSeed({ finds: 8, items: 20, sessions: 2, trackPoints: 120 }), {
      now: T0,
      chunkSize: 10,
      onProgress: (stage) => {
        expect(stage.done).toBeLessThanOrEqual(stage.total)
        seen.set(stage.store, Math.max(seen.get(stage.store) ?? 0, stage.done))
      },
    })
    expect(seen.get('finds')).toBe(8)
    expect(seen.get('trackPoints')).toBe(120)
    expect([...seen.keys()].sort()).toEqual(
      ['detectors', 'finds', 'items', 'landowners', 'permissions', 'photoBlobs', 'photos', 'presets', 'sessions', 'sites', 'trackPoints'].sort(),
    )
  })
})

describe('FULL_SEED', () => {
  it('is the PRD §11 ceiling', () => {
    expect(FULL_SEED).toMatchObject({ finds: 5_000, items: 12_000, photos: 15_000, sites: 30, sessions: 500, trackPoints: 500_000 })
  })
})
