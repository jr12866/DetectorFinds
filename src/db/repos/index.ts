import { getAppDatabase, type AppDatabase } from '../schema'
import type { RepoOptions } from './common'
import { createFindsRepository } from './finds'
import { createItemsRepository } from './items'
import { createPhotosRepository } from './photos'
import { createSitesRepository, createLandownersRepository, createPermissionsRepository } from './sites'
import { createSessionsRepository } from './sessions'
import { createTrackPointsRepository } from './trackPoints'
import { createDetectorsRepository } from './detectors'
import { createMetaRepository } from './meta'
import { createBinRepository } from './bin'

/**
 * Every repository for one database, wired together.
 *
 * The Bin is built last because it is the only module that knows about the
 * others: it delegates the cascade rules to the repository that owns them rather
 * than reimplementing them. Everything else is independent and takes the same
 * injected clock, so a test can pin "now" for the whole set and the 30-day Bin
 * and the Needs Detail queue both become deterministic.
 */
export function createRepositories(db: AppDatabase, options: RepoOptions = {}) {
  const finds = createFindsRepository(db, options)
  const items = createItemsRepository(db, options)
  const photos = createPhotosRepository(db, options)
  const sites = createSitesRepository(db, options)
  const landowners = createLandownersRepository(db, options)
  const permissions = createPermissionsRepository(db, options)
  const sessions = createSessionsRepository(db, options)
  const trackPoints = createTrackPointsRepository(db, options)
  const detectors = createDetectorsRepository(db, options)
  const meta = createMetaRepository(db, options)
  const bin = createBinRepository(db, { finds, items, photos, sites, landowners, permissions, sessions, detectors }, options)

  return { db, finds, items, photos, sites, landowners, permissions, sessions, trackPoints, detectors, meta, bin }
}

export type Repositories = ReturnType<typeof createRepositories>

let singleton: Repositories | null = null

/**
 * The repositories for the one app database. Screens and hooks go through this
 * rather than constructing their own, so there is exactly one connection and one
 * injected clock in the running app, and exactly one place to put a debug hook.
 */
export function getRepositories(): Repositories {
  if (!singleton) singleton = createRepositories(getAppDatabase())
  return singleton
}

/** Test seam: drops the cached set so a test can install its own database. */
export function resetRepositories(): void {
  singleton = null
}

export { createFindsRepository } from './finds'
export { createItemsRepository } from './items'
export { createPhotosRepository, MAX_ITEM_PHOTOS } from './photos'
export { createSitesRepository, createLandownersRepository, createPermissionsRepository, ringAreaSqM, ringIsClosed } from './sites'
export { createSessionsRepository, distanceM, largestGapM, TRACK_SAMPLE_INTERVAL_MS, TRACK_SAMPLE_DISTANCE_M } from './sessions'
export { createTrackPointsRepository } from './trackPoints'
export { createDetectorsRepository } from './detectors'
export { createMetaRepository, META_KEYS } from './meta'
export { createBinRepository, BIN_RETENTION_MS, BIN_STORES } from './bin'
export type { BinEntry, BinStore } from './bin'
export type { FindsRepository } from './finds'
export type { ItemsRepository } from './items'
export type { PhotosRepository, NewPhoto } from './photos'
export type { SitesRepository, LandownersRepository, PermissionsRepository } from './sites'
export type { SessionsRepository } from './sessions'
export type { TrackPointsRepository } from './trackPoints'
export type { DetectorsRepository } from './detectors'
export type { MetaRepository } from './meta'
export type { NewFind, NewItem } from './common'
