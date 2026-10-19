import type { Table } from 'dexie'
import type { AppDatabase } from '../schema'
import { LIVE, type StoreName } from '../types'
import { clockFrom, type RepoOptions } from './common'
import type { FindsRepository } from './finds'
import type { ItemsRepository } from './items'
import type { PhotosRepository } from './photos'
import type { SitesRepository, LandownersRepository, PermissionsRepository } from './sites'
import type { SessionsRepository } from './sessions'
import type { DetectorsRepository } from './detectors'

const DAY_MS = 24 * 60 * 60 * 1000

/** R-EDIT-2: how long the Bin keeps something. */
export const BIN_RETENTION_MS = 30 * DAY_MS

/**
 * The stores that can hold a deleted-but-not-gone record. Track points are not
 * here, because a Track belongs to a Session and is destroyed with it; nor are
 * tombstones or meta, which the user never deletes.
 */
export const BIN_STORES = [
  'finds',
  'items',
  'photos',
  'sites',
  'landowners',
  'permissions',
  'sessions',
  'detectors',
  'presets',
] as const satisfies readonly StoreName[]

export type BinStore = (typeof BIN_STORES)[number]

export interface BinEntry {
  store: BinStore
  id: string
  /** One line the user can recognise, built from the row itself. */
  label: string
  deletedAt: number
  /**
   * Set when this record went into the Bin because its parent did. This is what
   * lets the Bin say "this item was already in the Bin before its find was
   * deleted", and it is what keeps R-EDIT-4 honest on the way back. Empty when
   * the user binned this record themselves.
   */
  cascadeDeletedFrom: string
}

/** The repositories the Bin delegates to. Built after them, never before. */
export interface BinDependencies {
  finds: FindsRepository
  items: ItemsRepository
  photos: PhotosRepository
  sites: SitesRepository
  landowners: LandownersRepository
  permissions: PermissionsRepository
  sessions: SessionsRepository
  detectors: DetectorsRepository
}

type BinnableRow = { id: string; deletedAt: number }

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function clip(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/**
 * The Bin (R-EDIT-2). One list, one restore, one purge, one 30-day clock.
 *
 * The rules that make this subtle all live in the individual repositories: a
 * Find's Items follow it into the Bin, an Item that was already in the Bin does
 * not come back with its Find, deleting an Item leaves the Find as a Miss, and a
 * tombstone is only written when a record is actually destroyed. This module only
 * has to find the rows, describe them, and call the right repository.
 */
export function createBinRepository(db: AppDatabase, repos: BinDependencies, options: RepoOptions = {}) {
  const clock = clockFrom(options)

  function tableFor(store: BinStore): Table<BinnableRow, string> {
    switch (store) {
      case 'finds':
        return db.finds as unknown as Table<BinnableRow, string>
      case 'items':
        return db.items as unknown as Table<BinnableRow, string>
      case 'photos':
        return db.photos as unknown as Table<BinnableRow, string>
      case 'sites':
        return db.sites as unknown as Table<BinnableRow, string>
      case 'landowners':
        return db.landowners as unknown as Table<BinnableRow, string>
      case 'permissions':
        return db.permissions as unknown as Table<BinnableRow, string>
      case 'sessions':
        return db.sessions as unknown as Table<BinnableRow, string>
      case 'detectors':
        return db.detectors as unknown as Table<BinnableRow, string>
      case 'presets':
        return db.presets as unknown as Table<BinnableRow, string>
    }
  }

  function labelFor(store: BinStore, row: Record<string, unknown>): string {
    switch (store) {
      case 'finds': {
        const category = String(row.categoryId ?? '')
        return `${category === '' ? 'Miss' : category} · ${day(Number(row.foundAt ?? 0))}`
      }
      case 'items': {
        const category = String(row.categoryId ?? '') || 'uncategorised'
        return clip([category, String(row.subType ?? ''), String(row.note ?? '')].filter(Boolean).join(' · '))
      }
      case 'photos':
        return `${row.ownerKind === 'item' ? 'Item' : 'Find'} photo · ${day(Number(row.createdAt ?? 0))}`
      case 'sites':
        return String(row.name ?? '') || 'unnamed site'
      case 'landowners':
        return String(row.name ?? '') || 'unnamed landowner'
      case 'permissions':
        return `Permission granted ${String(row.grantedOn ?? '')}`
      case 'sessions':
        return `Session ${String(row.date ?? '')}`
      case 'detectors':
        return `${String(row.make ?? '')} ${String(row.model ?? '')}`.trim() || 'detector'
      case 'presets':
        return String(row.name ?? '') || 'preset'
    }
  }

  function purgeWith(store: BinStore, id: string): Promise<void> {
    switch (store) {
      case 'finds':
        return repos.finds.purge(id)
      case 'items':
        return repos.items.purge(id)
      case 'photos':
        return repos.photos.remove(id)
      case 'sites':
        return repos.sites.purge(id)
      case 'landowners':
        return repos.landowners.purge(id)
      case 'permissions':
        return repos.permissions.purge(id)
      case 'sessions':
        return repos.sessions.purge(id)
      case 'detectors':
        return repos.detectors.purge(id)
      case 'presets':
        return repos.detectors.purgePreset(id)
    }
  }

  function restoreWith(store: BinStore, id: string): Promise<void> {
    switch (store) {
      case 'finds':
        return repos.finds.restore(id)
      case 'items':
        return repos.items.restore(id)
      case 'photos':
        return repos.photos.restore(id)
      case 'sites':
        return repos.sites.restore(id)
      case 'landowners':
        return repos.landowners.restore(id)
      case 'permissions':
        return repos.permissions.restore(id)
      case 'sessions':
        return repos.sessions.restore(id)
      case 'detectors':
        return repos.detectors.restore(id)
      case 'presets':
        return repos.detectors.restorePreset(id)
    }
  }

  async function entriesIn(store: BinStore): Promise<BinEntry[]> {
    const rows = await tableFor(store).where('deletedAt').above(LIVE).toArray()
    return rows.map((row) => {
      const raw = row as unknown as Record<string, unknown>
      return {
        store,
        id: row.id,
        label: labelFor(store, raw),
        deletedAt: row.deletedAt,
        cascadeDeletedFrom: String(raw.cascadeDeletedFrom ?? ''),
      }
    })
  }

  return {
    /** Everything in the Bin, newest deletion first. */
    async list(): Promise<BinEntry[]> {
      const groups = await Promise.all(BIN_STORES.map(entriesIn))
      return groups.flat().sort((a, b) => b.deletedAt - a.deletedAt)
    },

    async count(): Promise<number> {
      const counts = await Promise.all(BIN_STORES.map((store) => tableFor(store).where('deletedAt').above(LIVE).count()))
      return counts.reduce((total, n) => total + n, 0)
    },

    /** Whole days this record still has left before it is destroyed. */
    daysLeft(entry: BinEntry): number {
      return Math.ceil((entry.deletedAt + BIN_RETENTION_MS - clock()) / DAY_MS)
    },

    restore(store: BinStore, id: string): Promise<void> {
      return restoreWith(store, id)
    },

    /** Destroys one record and writes its tombstone (ADR-0002). */
    purge(store: BinStore, id: string): Promise<void> {
      return purgeWith(store, id)
    },

    /**
     * Runs on app start. Anything that has been in the Bin for thirty days is
     * destroyed, which is the moment its tombstone is written.
     *
     * The count is Bin entries cleared, which is what the Bin showed the user.
     * Every id is collected before anything is destroyed, because purging a
     * Find takes its Items with it: reading each store inside the loop would
     * report fewer entries than `count()` just reported. Purging a row a
     * cascade already destroyed is a no-op, so no tombstone is written twice.
     */
    async purgeOlderThan(now = clock(), retentionMs = BIN_RETENTION_MS): Promise<number> {
      const horizon = now - retentionMs
      const targets: { store: BinStore; id: string }[] = []
      for (const store of BIN_STORES) {
        // Deliberately half-open at the top, unlike every other range here
        // (see ranges.ts): "in the Bin for thirty days" means deletedAt strictly
        // before the horizon, so a record binned at exactly now-30d survives this
        // run and goes on the next one. `LIVE + 1` is the floor because 0 is the
        // sentinel for "live", not a deletion time.
        const ancient = await tableFor(store)
          .where('deletedAt')
          .between(LIVE + 1, horizon)
          .primaryKeys()
        for (const id of ancient) targets.push({ store, id })
      }
      for (const target of targets) await purgeWith(target.store, target.id)
      return targets.length
    },

    /**
     * "Empty Bin": destroys everything in it, and writes every tombstone.
     * Counts Bin entries cleared, for the same reason as `purgeOlderThan`.
     */
    async empty(): Promise<number> {
      const targets: { store: BinStore; id: string }[] = []
      for (const store of BIN_STORES) {
        const ids = await tableFor(store).where('deletedAt').above(LIVE).primaryKeys()
        for (const id of ids) targets.push({ store, id })
      }
      for (const target of targets) await purgeWith(target.store, target.id)
      return targets.length
    },
  }
}

export type BinRepository = ReturnType<typeof createBinRepository>
