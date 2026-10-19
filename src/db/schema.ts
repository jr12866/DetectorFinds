import Dexie, { type Table, type Transaction } from 'dexie'
import type {
  Detector,
  DetectorPreset,
  Find,
  Item,
  Landowner,
  MetaRow,
  Permission,
  Photo,
  PhotoBlobRow,
  Session,
  Site,
  Tombstone,
  TrackPoint,
} from './types'

export const DB_NAME = 'detectorfinds'

/**
 * The schema, and nothing else. Repositories (src/db/repos) are the only thing
 * allowed to read and write these tables.
 *
 * Two versions are registered. v1 is what a fresh install gets; v2 exists so a
 * later additive change can be tested against a real upgrade path rather than
 * assumed. Nothing has shipped with a v1 database yet, so v1 itself is still
 * open to revision (docs/build/01-data-layer.md).
 */

/** v1 indexes. Only what a query actually needs; see docs/build/01-data-layer.md. */
const FINDS_V1 =
  'id, foundAt, deletedAt, [siteId+foundAt], [sessionId+foundAt], [categoryId+foundAt], [deletedAt+foundAt], [needsDetail+foundAt], [deletedAt+siteId]'
const ITEMS_V1 =
  'id, findId, categoryId, subType, material, *tags, isSilver, isGold, dateOnYear, createdAt, deletedAt, [findId+categoryId]'
const PHOTOS_V1 = 'id, ownerId, ownerKind, createdAt, captureAt, deletedAt, [ownerId+createdAt]'
const PHOTO_BLOBS_V1 = 'photoId'
const LANDOWNERS_V1 = 'id, name, deletedAt'
const SITES_V1 = 'id, name, landownerId, deletedAt, createdAt, plssTownship'
const PERMISSIONS_V1 = 'id, landownerId, *siteIds, grantedOn, expiresOn, deletedAt'
const DETECTORS_V1 = 'id, make, model, deletedAt'
const PRESETS_V1 = 'id, detectorId, name, deletedAt'
const SESSIONS_V1 = 'id, date, siteId, detectorId, startedAt, endedAt, deletedAt, [siteId+startedAt]'
const TRACK_POINTS_V1 = 'id, sessionId, at, [sessionId+at]'
const TOMBSTONES_V1 = 'id, store, deletedAt, purgedAt'
const META_V1 = 'key'

const v1Stores = {
  finds: FINDS_V1,
  items: ITEMS_V1,
  photos: PHOTOS_V1,
  photoBlobs: PHOTO_BLOBS_V1,
  landowners: LANDOWNERS_V1,
  sites: SITES_V1,
  permissions: PERMISSIONS_V1,
  detectors: DETECTORS_V1,
  presets: PRESETS_V1,
  sessions: SESSIONS_V1,
  trackPoints: TRACK_POINTS_V1,
  tombstones: TOMBSTONES_V1,
  meta: META_V1,
}

/**
 * v2 adds `updatedAt` to the three busiest stores plus an index to sort them by
 * it. Step 11 wants "give me everything changed since the last export" for
 * incremental export and for a future sync, and retrofitting that at the point
 * it is needed is a migration under pressure.
 */
const FINDS_V2 = `${FINDS_V1}, updatedAt, [deletedAt+updatedAt]`
const ITEMS_V2 = `${ITEMS_V1}, updatedAt, [deletedAt+updatedAt]`
const SESSIONS_V2 = `${SESSIONS_V1}, updatedAt, [deletedAt+updatedAt]`

const v2Stores = {
  ...v1Stores,
  finds: FINDS_V2,
  items: ITEMS_V2,
  sessions: SESSIONS_V2,
}

/**
 * Backfills `updatedAt` for rows written before the field existed. IndexedDB
 * cannot index `undefined`, so a migrated row with a hole in it would simply
 * vanish from the new index.
 */
function backfillUpdatedAt(tx: Transaction, storeNames: string[]): Promise<unknown> {
  return Promise.all(
    storeNames.map(async (name) => {
      const table = tx.table(name)
      await table.toCollection().modify((row: { updatedAt?: number; createdAt?: number }) => {
        if (typeof row.updatedAt !== 'number') row.updatedAt = row.createdAt ?? Date.now()
      })
    }),
  )
}

export class AppDatabase extends Dexie {
  finds!: Table<Find, string>
  items!: Table<Item, string>
  photos!: Table<Photo, string>
  photoBlobs!: Table<PhotoBlobRow, string>
  landowners!: Table<Landowner, string>
  sites!: Table<Site, string>
  permissions!: Table<Permission, string>
  detectors!: Table<Detector, string>
  presets!: Table<DetectorPreset, string>
  sessions!: Table<Session, string>
  trackPoints!: Table<TrackPoint, string>
  tombstones!: Table<Tombstone, string>
  meta!: Table<MetaRow, string>

  constructor(name: string = DB_NAME) {
    super(name)

    this.version(1).stores(v1Stores)

    this.version(2)
      .stores(v2Stores)
      .upgrade((tx) => backfillUpdatedAt(tx, ['finds', 'items', 'sessions']))
  }
}

/**
 * Opens a database. Pass a name to get an isolated one, which is what the tests
 * and the Diagnostics durability probe do.
 */
export function createDatabase(name: string = DB_NAME): AppDatabase {
  return new AppDatabase(name)
}

let singleton: AppDatabase | null = null

/** The app's database. One per page, because Dexie handles the multiplexing. */
export function getAppDatabase(): AppDatabase {
  if (!singleton) singleton = new AppDatabase()
  return singleton
}

/** Used by tests, and by a "wipe everything" action that step 11 will expose. */
export async function deleteDatabase(name: string = DB_NAME): Promise<void> {
  if (singleton && singleton.name === name) {
    singleton.close()
    singleton = null
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error(`deleting ${name} was blocked by another tab`))
  })
}

/**
 * Dexie does not use the raw IndexedDB version number: it opens the database at
 * `version * 10` so that a single Dexie release can carry minor schema bumps
 * (dexie.mjs: `var nativeVerToOpen = Math.round(db.verno * 10)`). So a schema
 * version 2 database sits on disk as IndexedDB version 20. Everything the app
 * reports and compares is the Dexie number, so convert on the way in.
 */
function dexieVersionFromNative(native: number): number {
  if (!native) return 0
  return Math.round(native / 10)
}

/**
 * The version of the database currently on disk, or 0 when there is none.
 * Reported on the Diagnostics screen, because when a phone says "your finds are
 * gone" the first question is which schema the phone is actually holding.
 */
export async function readSchemaVersion(name: string = DB_NAME): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0
  if (typeof indexedDB.databases === 'function') {
    const found = (await indexedDB.databases()).find((db) => db.name === name)
    if (!found) return 0
    return dexieVersionFromNative(typeof found.version === 'number' ? found.version : 0)
  }
  // Older engines have no indexedDB.databases(); open it to read the version.
  // Opening with no version argument does not upgrade, so this is safe to call.
  return new Promise((resolve) => {
    const request = indexedDB.open(name)
    request.onsuccess = () => {
      const db = request.result
      const version = db.version ?? 0
      db.close()
      resolve(dexieVersionFromNative(version))
    }
    request.onerror = () => resolve(0)
    request.onupgradeneeded = () => {
      // A bare open() only fires this when the store did not exist yet, in which
      // case the version we want is the one the upgrade transaction is creating.
      const tx = request.transaction
      if (!tx) return
      tx.oncomplete = () => {
        const db = request.result
        const version = db.version ?? 0
        db.close()
        resolve(dexieVersionFromNative(version))
      }
    }
  })
}
