import type { AppDatabase } from '../schema'
import { DeleteBlockedError } from '../errors'
import { newId } from '../ids'
import { LIVE, type Boundary, type GroundKind, type Landowner, type Permission, type Site } from '../types'
import { clockFrom, tombstone, type RepoOptions } from './common'

/** R-SITE-5: the boundary is stored as an ordered ring of lat/lon pairs. */
export function ringAreaSqM(ring: [number, number][]): number {
  if (ring.length < 3) return 0
  // Spherical excess is overkill at these sizes; the planar approximation with a
  // latitude correction is what a surveyor's planimeter would give.
  const latRad = (ring.reduce((sum, p) => sum + p[0], 0) / ring.length) * (Math.PI / 180)
  const xFactor = Math.cos(latRad) * 111_320
  const yFactor = 110_540
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const [latA, lonA] = ring[i]
    const [latB, lonB] = ring[(i + 1) % ring.length]
    sum += latA * yFactor * (lonB * xFactor) - latB * yFactor * (lonA * xFactor)
  }
  return Math.abs(sum) / 2
}

/** True when a ring closes on itself, which the walk-the-boundary capture needs. */
export function ringIsClosed(ring: [number, number][], toleranceM = 25): boolean {
  if (ring.length < 3) return false
  const [latA, lonA] = ring[0]
  const [latB, lonB] = ring[ring.length - 1]
  const dLat = (latA - latB) * 110_540
  const dLon = (lonA - lonB) * 111_320 * Math.cos(((latA + latB) / 2) * (Math.PI / 180))
  return Math.hypot(dLat, dLon) <= toleranceM
}

/**
 * Sites, Landowners and Permissions (PRD §8).
 *
 * R-EDIT-3 is the interesting part: deleting a Site that still has Finds is
 * refused, and the error carries the child ids so the same dialog can offer to
 * move them. R-SITE-3 means a Permission can cover many Sites, so it is indexed
 * with multiEntry and the Site keeps a history of what it has been given.
 */
export function createSitesRepository(db: AppDatabase, options: RepoOptions = {}) {
  const clock = clockFrom(options)

  function blankSite(id: string, at: number): Site {
    return {
      id,
      name: '',
      landownerId: '',
      groundKind: 'unknown',
      accessNotes: '',
      plssTownship: '',
      plssRange: '',
      plssSection: '',
      plssMeridian: '',
      boundary: null,
      boundaryAreaSqM: 0,
      createdAt: at,
      updatedAt: at,
      deletedAt: LIVE,
    }
  }

  async function liveFindIdsFor(siteId: string): Promise<string[]> {
    return db.finds.where('[deletedAt+siteId]').equals([LIVE, siteId]).primaryKeys()
  }

  async function liveSessionIdsFor(siteId: string): Promise<string[]> {
    return db.sessions.where('siteId').equals(siteId).filter((s) => s.deletedAt === LIVE).primaryKeys()
  }

  return {
    async create(input: Partial<Site> & { name: string }): Promise<Site> {
      const at = clock()
      const id = input.id ?? newId()
      const boundary = input.boundary ?? null
      const site: Site = {
        ...blankSite(id, at),
        ...input,
        id,
        boundary,
        boundaryAreaSqM: boundary ? ringAreaSqM(boundary) : 0,
        createdAt: at,
        updatedAt: at,
        deletedAt: LIVE,
      }
      await db.sites.put(site)
      return site
    },

    get(id: string): Promise<Site | undefined> {
      return db.sites.get(id)
    },

    async update(id: string, patch: Partial<Omit<Site, 'id' | 'createdAt' | 'deletedAt'>>): Promise<Site | undefined> {
      const existing = await db.sites.get(id)
      if (!existing) return undefined
      const merged: Site = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: clock() }
      if (patch.boundary !== undefined) {
        merged.boundaryAreaSqM = patch.boundary ? ringAreaSqM(patch.boundary) : 0
      }
      await db.sites.put(merged)
      return merged
    },

    allLive(): Promise<Site[]> {
      return db.sites.where('deletedAt').equals(LIVE).sortBy('name')
    },

    byName(name: string): Promise<Site[]> {
      return db.sites.where('name').equals(name).filter((site) => site.deletedAt === LIVE).toArray()
    },

    /** R-SITE-1: the map's "show only this Site" filter reads through here. */
    finds(siteId: string): Promise<string[]> {
      return db.finds.where('[deletedAt+siteId]').equals([LIVE, siteId]).primaryKeys()
    },

    /** R-SITE-4: the PLSS quarter is searchable, because that is how deeds read. */
    byPlss(township: string, range: string, section: string): Promise<Site[]> {
      return db.sites
        .where('plssTownship')
        .equals(township)
        .filter(
          (site) =>
            site.deletedAt === LIVE &&
            (range === '' || site.plssRange === range) &&
            (section === '' || site.plssSection === section),
        )
        .toArray()
    },

    /** R-EDIT-3: refused while live Finds or live Sessions are attached. */
    async softDelete(id: string): Promise<void> {
      const finds = await liveFindIdsFor(id)
      if (finds.length > 0) {
        throw new DeleteBlockedError('site-has-finds', 'sites', id, 'finds', finds)
      }
      const sessions = await liveSessionIdsFor(id)
      if (sessions.length > 0) {
        throw new DeleteBlockedError('site-has-sessions', 'sites', id, 'sessions', sessions)
      }
      await db.sites.put({ ...(await db.sites.get(id))!, deletedAt: clock(), updatedAt: clock() })
    },

    async restore(id: string): Promise<void> {
      const site = await db.sites.get(id)
      if (!site) return
      await db.sites.put({ ...site, deletedAt: LIVE, updatedAt: clock() })
    },

    async purge(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.sites, db.tombstones, async () => {
        await db.sites.delete(id)
        await db.tombstones.put(tombstone('sites', id, at))
      })
    },

    /** R-SITE-2: the backlog step 06 needs is one index lookup, not a scan. */
    unassignedFindCount(): Promise<number> {
      return db.finds.where('[deletedAt+siteId]').equals([LIVE, '']).count()
    },
  }
}

export type SitesRepository = ReturnType<typeof createSitesRepository>

export function createLandownersRepository(db: AppDatabase, options: RepoOptions = {}) {
  const clock = clockFrom(options)

  return {
    async create(input: Partial<Landowner> & { name: string }): Promise<Landowner> {
      const at = clock()
      const id = input.id ?? newId()
      const landowner: Landowner = {
        id,
        name: input.name,
        contact: input.contact ?? '',
        notes: input.notes ?? '',
        createdAt: at,
        updatedAt: at,
        deletedAt: LIVE,
      }
      await db.landowners.put(landowner)
      return landowner
    },

    get(id: string): Promise<Landowner | undefined> {
      return db.landowners.get(id)
    },

    async update(id: string, patch: Partial<Omit<Landowner, 'id' | 'createdAt'>>): Promise<Landowner | undefined> {
      const existing = await db.landowners.get(id)
      if (!existing) return undefined
      const merged: Landowner = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: clock() }
      await db.landowners.put(merged)
      return merged
    },

    allLive(): Promise<Landowner[]> {
      return db.landowners.where('deletedAt').equals(LIVE).sortBy('name')
    },

    sites(landownerId: string): Promise<Site[]> {
      return db.sites.where('landownerId').equals(landownerId).filter((site) => site.deletedAt === LIVE).toArray()
    },

    async softDelete(id: string): Promise<void> {
      const sites = await db.sites
        .where('landownerId')
        .equals(id)
        .filter((site) => site.deletedAt === LIVE)
        .primaryKeys()
      if (sites.length > 0) {
        throw new DeleteBlockedError('landowner-has-sites', 'landowners', id, 'sites', sites)
      }
      const existing = await db.landowners.get(id)
      if (!existing) return
      await db.landowners.put({ ...existing, deletedAt: clock(), updatedAt: clock() })
    },

    async restore(id: string): Promise<void> {
      const landowner = await db.landowners.get(id)
      if (!landowner) return
      await db.landowners.put({ ...landowner, deletedAt: LIVE, updatedAt: clock() })
    },

    async purge(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.landowners, db.tombstones, async () => {
        await db.landowners.delete(id)
        await db.tombstones.put(tombstone('landowners', id, at))
      })
    },
  }
}

export type LandownersRepository = ReturnType<typeof createLandownersRepository>

export function createPermissionsRepository(db: AppDatabase, options: RepoOptions = {}) {
  const clock = clockFrom(options)

  return {
    /** R-SITE-3: one Permission can cover several Sites, hence siteIds[]. */
    async create(
      input: Partial<Omit<Permission, 'createdAt' | 'updatedAt' | 'deletedAt'>> & {
        grantedOn: string
        siteIds: string[]
      },
    ): Promise<Permission> {
      const at = clock()
      const permission: Permission = {
        id: input.id ?? newId(),
        landownerId: input.landownerId ?? '',
        siteIds: input.siteIds,
        grantedOn: input.grantedOn,
        expiresOn: input.expiresOn ?? '',
        conditions: input.conditions ?? '',
        createdAt: at,
        updatedAt: at,
        deletedAt: LIVE,
      }
      await db.permissions.put(permission)
      return permission
    },

    get(id: string): Promise<Permission | undefined> {
      return db.permissions.get(id)
    },

    async update(id: string, patch: Partial<Omit<Permission, 'id' | 'createdAt'>>): Promise<Permission | undefined> {
      const existing = await db.permissions.get(id)
      if (!existing) return undefined
      const merged: Permission = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: clock() }
      await db.permissions.put(merged)
      return merged
    },

    /** R-SITE-3: the Site detail screen's permission history. */
    forSite(siteId: string): Promise<Permission[]> {
      return db.permissions
        // The `*` in the schema declares the index multiEntry; it is not part of
        // the index name, so asking for '*siteIds' throws a SchemaError.
        .where('siteIds')
        .equals(siteId)
        .filter((permission) => permission.deletedAt === LIVE)
        .toArray()
    },

    forLandowner(landownerId: string): Promise<Permission[]> {
      return db.permissions
        .where('landownerId')
        .equals(landownerId)
        .filter((permission) => permission.deletedAt === LIVE)
        .toArray()
    },

    allLive(): Promise<Permission[]> {
      return db.permissions.where('deletedAt').equals(LIVE).toArray()
    },

    /**
     * R-SITE-3: the current Permission for a Site is the newest one that has not
     * expired. Expiry warnings are v2, but knowing which record is current is
     * needed now, because the Field mode header shows it.
     */
    async currentForSite(siteId: string, todayIso: string): Promise<Permission | undefined> {
      const rows = await this.forSite(siteId)
      const live = rows
        .filter((row) => row.expiresOn === '' || row.expiresOn >= todayIso)
        .sort((a, b) => (a.grantedOn < b.grantedOn ? 1 : -1))
      return live[0]
    },

    async softDelete(id: string): Promise<void> {
      const existing = await db.permissions.get(id)
      if (!existing) return
      await db.permissions.put({ ...existing, deletedAt: clock(), updatedAt: clock() })
    },

    async restore(id: string): Promise<void> {
      const existing = await db.permissions.get(id)
      if (!existing) return
      await db.permissions.put({ ...existing, deletedAt: LIVE, updatedAt: clock() })
    },

    async purge(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.permissions, db.tombstones, async () => {
        await db.permissions.delete(id)
        await db.tombstones.put(tombstone('permissions', id, at))
      })
    },
  }
}

export type PermissionsRepository = ReturnType<typeof createPermissionsRepository>

export type { GroundKind, Boundary }
