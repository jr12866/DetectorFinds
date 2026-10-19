import 'fake-indexeddb/auto'
import Dexie, { type Table } from 'dexie'
import { describe, expect, it } from 'vitest'
import {
  createDatabase,
  deleteDatabase,
  getAppDatabase,
  readSchemaVersion,
  DB_NAME,
  type AppDatabase,
} from './schema'
import type { Find, Item, Session } from './types'

/**
 * v1 declared exactly these stores. They are module-private in schema.ts on
 * purpose, because nothing outside the schema should write to a versioned map,
 * so the migration test re-declares them. If they ever drift apart this test is
 * the thing that notices.
 */
const FINDS_V1 =
  'id, foundAt, deletedAt, [siteId+foundAt], [sessionId+foundAt], [categoryId+foundAt], [deletedAt+foundAt], [needsDetail+foundAt], [deletedAt+siteId]'
const ITEMS_V1 =
  'id, findId, categoryId, subType, material, *tags, isSilver, isGold, dateOnYear, createdAt, deletedAt, [findId+categoryId]'
const SESSIONS_V1 =
  'id, date, siteId, detectorId, startedAt, endedAt, deletedAt, [siteId+startedAt]'

class V1Database extends Dexie {
  finds!: Table<Find, string>
  items!: Table<Item, string>
  sessions!: Table<Session, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      finds: FINDS_V1,
      items: ITEMS_V1,
      sessions: SESSIONS_V1,
    })
  }
}

const T0 = Date.UTC(2026, 0, 15, 9, 0, 0)

/**
 * The v1 rows, deliberately partial. A record written by the old schema really
 * is missing fields the current schema requires, and typing them as partials and
 * casting at the write keeps that drift visible instead of papering over it with
 * a default that would make the migration look easier than it is.
 */

/** A Find written by the old schema: no updatedAt field anywhere on it. */
function oldFind(id: string, foundAt: number): Partial<Find> {
  return {
    id,
    siteId: 'site-1',
    sessionId: 'session-1',
    lat: 39,
    lon: -98,
    altitudeM: 0,
    accuracyM: 5,
    positionSource: 'gps',
    foundAt,
    categoryId: 'coin',
    needsDetail: 0,
    note: `find ${id}`,
    createdAt: foundAt,
    deletedAt: 0,
  }
}

function oldItem(id: string, findId: string, createdAt: number): Partial<Item> {
  return {
    id,
    findId,
    categoryId: 'coin',
    subType: '',
    material: '',
    tags: [],
    isSilver: 'unknown',
    isGold: 'unknown',
    dateOnYear: 0,
    dateOnText: '',
    note: `item ${id}`,
    photoCount: 0,
    createdAt,
    deletedAt: 0,
  }
}

function oldSession(id: string, startedAt: number): Partial<Session> {
  return {
    id,
    date: '2026-01-15',
    siteId: 'site-1',
    detectorId: '',
    detectorPresetId: '',
    detectorPresetName: '',
    notes: '',
    startedAt,
    endedAt: startedAt + 3_600_000,
    trackPointCount: 0,
    trackDistanceM: 0,
    createdAt: startedAt,
    deletedAt: 0,
  }
}

/**
 * Builds a database that is genuinely on v1, with rows that predate `updatedAt`,
 * and leaves it closed so the next open is the upgrade.
 */
async function makeV1Database(name: string): Promise<void> {
  const db = new V1Database(name)
  await db.open()
  expect(db.verno).toBe(1)

  await db.finds.bulkAdd([oldFind('f-old', T0), oldFind('f-old-2', T0 + 1000)] as Find[])
  await db.items.bulkAdd([oldItem('i-old', 'f-old', T0), oldItem('i-old-2', 'f-old-2', T0 + 1000)] as Item[])
  await db.sessions.bulkAdd([oldSession('s-old', T0)] as Session[])

  // Proof the rows really have no updatedAt, rather than the driver inventing one.
  const raw = await db.finds.get('f-old')
  expect(raw).toBeTruthy()
  expect('updatedAt' in (raw as object)).toBe(false)

  db.close()
}

describe('schema', () => {
  it('opens a brand new database at the current version with every store', async () => {
    const db = createDatabase('df-schema-fresh')
    await db.open()

    expect(db.verno).toBe(2)
    for (const name of [
      'finds',
      'items',
      'photos',
      'photoBlobs',
      'landowners',
      'sites',
      'permissions',
      'detectors',
      'presets',
      'sessions',
      'trackPoints',
      'tombstones',
      'meta',
    ]) {
      expect(db.tables.map((t) => t.name)).toContain(name)
    }
    db.close()
    await deleteDatabase('df-schema-fresh')
  })

  it('reports the version of a database without creating it', async () => {
    const name = 'df-schema-version-read'
    expect(await readSchemaVersion(name)).toBe(0)

    const db = createDatabase(name)
    await db.open()
    db.close()

    expect(await readSchemaVersion(name)).toBe(2)
    // Reading must not have created a second database or bumped anything.
    expect(await readSchemaVersion(name)).toBe(2)
    await deleteDatabase(name)
  })

  it('upgrades a v1 database and backfills updatedAt from createdAt', async () => {
    const name = 'df-schema-upgrade'
    await makeV1Database(name)
    expect(await readSchemaVersion(name)).toBe(1)

    const db: AppDatabase = createDatabase(name)
    await db.open()
    expect(db.verno).toBe(2)

    const find = await db.finds.get('f-old')
    expect(find?.updatedAt).toBe(T0)
    const item = await db.items.get('i-old')
    expect(item?.updatedAt).toBe(T0)
    const session = await db.sessions.get('s-old')
    expect(session?.updatedAt).toBe(T0)

    // Nothing was lost or rewritten by the migration.
    expect(await db.finds.count()).toBe(2)
    expect(await db.items.count()).toBe(2)
    expect(await db.sessions.count()).toBe(1)
    expect((await db.finds.get('f-old-2'))?.note).toBe('find f-old-2')

    db.close()
    await deleteDatabase(name)
  })

  it('makes migrated rows reachable through the new updatedAt index', async () => {
    const name = 'df-schema-upgrade-index'
    await makeV1Database(name)

    const db = createDatabase(name)
    await db.open()

    // The whole point of the migration: a row that never had updatedAt would
    // have no key in this index and would be invisible to an incremental export.
    // A compound index needs compound bounds — a scalar bound like above(0)
    // silently matches every array key, because IndexedDB orders arrays above
    // numbers, so it would return rows we are trying to exclude.
    const liveByUpdate = await db.finds
      .where('[deletedAt+updatedAt]')
      .between([0, -Infinity], [0, Infinity])
      .toArray()
    expect(liveByUpdate.map((f) => f.id).sort()).toEqual(['f-old', 'f-old-2'])

    const itemsByUpdate = await db.items
      .where('[deletedAt+updatedAt]')
      .between([0, -Infinity], [0, Infinity])
      .sortBy('updatedAt')
    expect(itemsByUpdate.map((i) => i.id)).toEqual(['i-old', 'i-old-2'])

    const sessionsByUpdate = await db.sessions
      .where('[deletedAt+updatedAt]')
      .between([0, -Infinity], [0, Infinity])
      .toArray()
    expect(sessionsByUpdate.map((s) => s.id)).toEqual(['s-old'])

    db.close()
    await deleteDatabase(name)
  })

  it('keeps the v1 indexes working after the upgrade', async () => {
    const name = 'df-schema-upgrade-indexes'
    await makeV1Database(name)

    const db = createDatabase(name)
    await db.open()

    const bySite = await db.finds.where('[siteId+foundAt]').between(['site-1', -Infinity], ['site-1', Infinity]).toArray()
    expect(bySite.map((f) => f.id)).toEqual(['f-old', 'f-old-2'])

    const inSession = await db.finds.where('[sessionId+foundAt]').between(['session-1', -Infinity], ['session-1', Infinity]).toArray()
    expect(inSession).toHaveLength(2)

    const itemsForFind = await db.items.where('[findId+categoryId]').between(['f-old', ''], ['f-old', '\uffff']).toArray()
    expect(itemsForFind.map((i) => i.id)).toEqual(['i-old'])

    const sessionsAtSite = await db.sessions.where('[siteId+startedAt]').between(['site-1', -Infinity], ['site-1', Infinity]).toArray()
    expect(sessionsAtSite.map((s) => s.id)).toEqual(['s-old'])

    db.close()
    await deleteDatabase(name)
  })

  it('re-opens an already upgraded database without running the migration twice', async () => {
    const name = 'df-schema-idempotent'
    await makeV1Database(name)

    const first = createDatabase(name)
    await first.open()
    const original = await first.finds.get('f-old')
    // Move one row forward in time, then reopen.
    await first.finds.update('f-old', { updatedAt: T0 + 5000, note: 'edited after upgrade' })
    first.close()

    const second = createDatabase(name)
    await second.open()
    expect(second.verno).toBe(2)
    const after = await second.finds.get('f-old')
    expect(after?.updatedAt).toBe(T0 + 5000)
    expect(after?.note).toBe('edited after upgrade')
    // The backfill must not have clobbered a real edit.
    expect(after?.updatedAt).not.toBe(original?.updatedAt)
    second.close()

    await deleteDatabase(name)
  })

  it('names the app database consistently and reuses one instance', async () => {
    expect(DB_NAME).toBeTruthy()
    const a = getAppDatabase()
    const b = getAppDatabase()
    expect(a).toBe(b)
    expect(a.name).toBe(DB_NAME)
    await a.open()
    expect(a.verno).toBe(2)
    a.close()
  })

  it('deletes a database completely', async () => {
    const name = 'df-schema-delete'
    const db = createDatabase(name)
    await db.open()
    await db.finds.add(oldFind('f-delete', T0) as Find)
    db.close()

    await deleteDatabase(name)
    expect(await readSchemaVersion(name)).toBe(0)

    const again = createDatabase(name)
    await again.open()
    expect(await again.finds.count()).toBe(0)
    again.close()
    await deleteDatabase(name)
  })
})
