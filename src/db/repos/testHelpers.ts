import { createDatabase, type AppDatabase } from '../schema'
import { createRepositories, type Repositories } from './index'

/**
 * Shared setup for the repository tests. Not imported by any app module, so it
 * never reaches the bundle.
 *
 * Every test opens its own database name: fake-indexeddb is per test file, but a
 * name shared between two files that run in the same worker would share state.
 */

/** A fixed "now" so the 30-day Bin and the Needs Detail queue are testable. */
export const T0 = Date.UTC(2026, 0, 15, 12, 0, 0)

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export interface TestSetup {
  db: AppDatabase
  repos: Repositories
  /** Move the injected clock forward, e.g. to push something into the Bin's past. */
  setNow: (at: number) => void
  now: () => number
  /** Release the connection so fake-indexeddb can drop the database. */
  close: () => void
}

export function makeRepos(name: string, now: number = T0): TestSetup {
  const db = createDatabase(name)
  let current = now
  const repos = createRepositories(db, { clock: () => current })
  return {
    db,
    repos,
    setNow: (at: number) => {
      current = at
    },
    now: () => current,
    close: () => db.close(),
  }
}

/** A Find the way the field logs one: position, timestamp, nothing else. */
export function fieldLog(repos: Repositories, at: number, lat = 39, lon = -98) {
  return repos.finds.create({ foundAt: at, lat, lon })
}
