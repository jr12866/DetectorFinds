import type { AppDatabase } from '../schema'
import { clockFrom, type RepoOptions } from './common'

/**
 * The meta table: small key/value facts about this installation.
 *
 * This is deliberately not a general settings store — the app's settings live in
 * their own table when step 09 needs them. What belongs here is bookkeeping that
 * has to survive exactly as long as the data does: the last export, the schema
 * notes, and the Diagnostics durability probe, which is the only way to prove on a
 * real phone that the database is still there after a restart.
 */
export function createMetaRepository(db: AppDatabase, options: RepoOptions = {}) {
  const clock = clockFrom(options)

  return {
    async get(key: string): Promise<string | undefined> {
      const row = await db.meta.get(key)
      return row?.value
    },

    async set(key: string, value: string): Promise<void> {
      await db.meta.put({ key, value, updatedAt: clock() })
    },

    async remove(key: string): Promise<void> {
      await db.meta.delete(key)
    },

    /** Everything, sorted, for the Diagnostics screen to show. */
    all(): Promise<{ key: string; value: string; updatedAt: number }[]> {
      return db.meta.toArray().then((rows) => rows.sort((a, b) => a.key.localeCompare(b.key)))
    },

    /**
     * Reads the whole table as plain text. A phone user diagnosing a problem has
     * no devtools, so this is what they read out over the phone.
     */
    async asText(): Promise<string> {
      const rows = await this.all()
      return rows.map((row) => `${row.key} = ${row.value}`).join('\n')
    },
  }
}

export type MetaRepository = ReturnType<typeof createMetaRepository>

/** Keys this app writes to meta, kept here so nothing invents its own spelling. */
export const META_KEYS = {
  lastExportAt: 'lastExportAt',
  lastSeedAt: 'lastSeedAt',
  lastBenchmarkAt: 'lastBenchmarkAt',
  /** The whole last benchmark run as JSON, so criterion 4 can compare two runs. */
  lastBenchmark: 'lastBenchmark',
  tourSeen: 'tourSeen',
  /**
   * Which screen a cold start opens on (R-START-2). Step 09 writes it from
   * Settings; the name lives here so the spelling is not invented twice, and
   * because it is bookkeeping about this installation rather than a record —
   * exactly the kind of thing meta is for.
   */
  startScreen: 'startScreen',
  importWarnedAt: 'importWarnedAt',
  durabilityProbe: 'diagnostics.durabilityProbe',
  /** Which Basemap the Field map uses (R-MAP-4, step 02 build item 2). A BasemapId. */
  mapBasemap: 'map.basemap',
  /**
   * Prefix for the per-Site map view (step 02 build item 14). The full key is
   * `mapView:<siteId>`, and the unassigned bucket uses the empty siteId, so a
   * Find logged before a Site is chosen still reopens where it was logged.
   */
  mapViewPrefix: 'mapView',
  /** The last view anywhere in the app, used when a Site has no view of its own. */
  mapLastView: 'mapLastView',
  /** The last position the phone reported, so a cold map opens near the user. */
  mapLastPosition: 'mapLastPosition',
} as const
