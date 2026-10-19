import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { DeleteBlockedError } from '../errors'
import { ringAreaSqM, ringIsClosed } from './sites'
import { T0, makeRepos } from './testHelpers'

/**
 * Sites, Landowners and Permissions.
 *
 * What is worth testing is what decides something: the boundary area is derived
 * rather than typed in, a Site holding Finds cannot be deleted, and "which
 * Permission covers this Site today" is a rule about dates rather than a lookup.
 * The plain CRUD is only here where its behaviour is not obvious.
 */

/** 0.001° x 0.001° at latitude 39: about 110.5 m by 86.5 m. */
const SQUARE: [number, number][] = [
  [39, -100],
  [39.001, -100],
  [39.001, -99.999],
  [39, -99.999],
]

describe('ring area', () => {
  it('measures a plotted boundary against what a map says it should be', () => {
    // A degree of latitude is ~110.57 km and a degree of longitude at 39°N is
    // ~86.45 km, so this ring is ~9,560 m² whatever the code thinks.
    expect(ringAreaSqM(SQUARE)).toBeCloseTo(9560, -2)
  })

  it('does not care which way the boundary was walked', () => {
    const forwards = ringAreaSqM(SQUARE)
    expect(ringAreaSqM([...SQUARE].reverse())).toBeCloseTo(forwards, 6)
  })

  it('halves a triangle walked out of the same square', () => {
    const triangle: [number, number][] = [SQUARE[0], SQUARE[1], SQUARE[2]]
    // The mean latitude of three vertices is not quite the mean of four, so the
    // approximation lands within a hair of half rather than exactly half.
    expect(ringAreaSqM(triangle)).toBeCloseTo(ringAreaSqM(SQUARE) / 2, 0)
  })

  it('an open line is not an area', () => {
    expect(ringAreaSqM([[39, -100], [39.001, -100]])).toBe(0)
    expect(ringAreaSqM([])).toBe(0)
  })
})

describe('ring closure', () => {
  it('accepts a ring that ends where it began', () => {
    expect(ringIsClosed([[39, -100], [39.001, -100], [39.001, -99.999], [39, -100]])).toBe(true)
  })

  it('accepts a ring that closes within walking distance of the start', () => {
    // 10 m north of the first vertex, which is what a handheld GPS is worth.
    const nearly: [number, number][] = [[39, -100], [39.001, -100], [39.001, -99.999], [39 + 10 / 110_540, -100]]
    expect(ringIsClosed(nearly)).toBe(true)
  })

  it('refuses a ring with a gap the walker never crossed', () => {
    // 60 m away: too far to be the same corner, close enough that a naive
    // coordinate comparison would have called it closed.
    const gap: [number, number][] = [[39, -100], [39.001, -100], [39.001, -99.999], [39 + 60 / 110_540, -100]]
    expect(ringIsClosed(gap)).toBe(false)
    expect(ringIsClosed(gap, 100)).toBe(true)
  })

  it('measures the east-west gap in metres, not degrees', () => {
    // 0.0005° of longitude at latitude 39 is ~43 m, so it is open at the default
    // tolerance and closed at 50 m.
    const east: [number, number][] = [[39, -100], [39.001, -100], [39.001, -99.999], [39, -100 + 0.0005]]
    expect(ringIsClosed(east)).toBe(false)
    expect(ringIsClosed(east, 50)).toBe(true)
  })

  it('two points never close', () => {
    expect(ringIsClosed([[39, -100], [39, -100]])).toBe(false)
  })
})

describe('sites: the boundary area is derived', () => {
  it('measures the boundary rather than trusting the number that came in', async () => {
    const { repos, close } = makeRepos('t-site-area')
    const site = await repos.sites.create({ name: 'Home farm', boundary: SQUARE, boundaryAreaSqM: 12_345 })
    expect(site.boundaryAreaSqM).toBeCloseTo(ringAreaSqM(SQUARE), 6)
    expect(site.boundaryAreaSqM).not.toBe(12_345)
    await close()
  })

  it('re-measures on an update, including when the boundary is taken away', async () => {
    const { repos, close } = makeRepos('t-site-area-update')
    const site = await repos.sites.create({ name: 'No boundary' })
    expect(site.boundary).toBeNull()
    expect(site.boundaryAreaSqM).toBe(0)

    const fenced = await repos.sites.update(site.id, { boundary: SQUARE })
    expect(fenced?.boundaryAreaSqM).toBeCloseTo(ringAreaSqM(SQUARE), 6)

    const cleared = await repos.sites.update(site.id, { boundary: null })
    expect(cleared?.boundary).toBeNull()
    expect(cleared?.boundaryAreaSqM).toBe(0)
    await close()
  })

  it('an edit that says nothing about the boundary keeps the measurement it already had', async () => {
    const { repos, setNow, close } = makeRepos('t-site-area-untouched')
    const site = await repos.sites.create({ name: 'Fenced', boundary: SQUARE })
    setNow(T0 + 60_000)
    const renamed = await repos.sites.update(site.id, { name: 'Renamed' })
    expect(renamed?.name).toBe('Renamed')
    expect(renamed?.boundaryAreaSqM).toBe(site.boundaryAreaSqM)
    // R-EDIT-1: the edit is stamped and the creation date survives it.
    expect(renamed?.createdAt).toBe(site.createdAt)
    expect(renamed?.updatedAt).toBe(T0 + 60_000)
    await close()
  })
})

describe('sites: reading and deleting', () => {
  it('lists live Sites by name and hides the binned ones', async () => {
    const { repos, close } = makeRepos('t-site-list')
    await repos.sites.create({ name: 'Zeo field' })
    const second = await repos.sites.create({ name: 'Acre field' })
    await repos.sites.create({ name: 'Binned field' })
    await repos.sites.softDelete(second.id)
    expect((await repos.sites.allLive()).map((site) => site.name)).toEqual(['Binned field', 'Zeo field'])
    await close()
  })

  it('finds a Site by its exact name, which is what the duplicate check leans on', async () => {
    const { repos, close } = makeRepos('t-site-name')
    const site = await repos.sites.create({ name: 'Home farm' })
    await repos.sites.create({ name: 'Home farm east' })
    expect((await repos.sites.byName('Home farm')).map((row) => row.id)).toEqual([site.id])
    expect(await repos.sites.byName('farm')).toEqual([])
    await close()
  })

  it('counts the Finds attached to a Site and ignores the binned ones', async () => {
    const { repos, close } = makeRepos('t-site-finds')
    const site = await repos.sites.create({ name: 'Attached' })
    const keep = await repos.finds.create({ foundAt: T0, siteId: site.id })
    const gone = await repos.finds.create({ foundAt: T0 + 1, siteId: site.id })
    await repos.finds.softDelete(gone.id)
    expect(await repos.sites.finds(site.id)).toEqual([keep.id])
    await close()
  })

  it('counts unassigned live Finds, which is the backlog step 06 works through', async () => {
    const { repos, close } = makeRepos('t-site-unassigned')
    const site = await repos.sites.create({ name: 'Assigned' })
    await repos.finds.create({ foundAt: T0 })
    await repos.finds.create({ foundAt: T0 + 1 })
    const stray = await repos.finds.create({ foundAt: T0 + 2 })
    await repos.finds.create({ foundAt: T0 + 3, siteId: site.id })
    await repos.finds.softDelete(stray.id)
    expect(await repos.sites.unassignedFindCount()).toBe(2)
    await close()
  })

  it('refuses to delete a Site that still holds Finds, and names them so the UI can offer to move them', async () => {
    const { repos, close } = makeRepos('t-site-block-finds')
    const site = await repos.sites.create({ name: 'Busy' })
    const one = await repos.finds.create({ foundAt: T0, siteId: site.id })
    const two = await repos.finds.create({ foundAt: T0 + 1, siteId: site.id })
    await expect(repos.sites.softDelete(site.id)).rejects.toThrow(DeleteBlockedError)
    await expect(repos.sites.softDelete(site.id)).rejects.toMatchObject({
      reason: 'site-has-finds',
      store: 'sites',
      blockingStore: 'finds',
      count: 2,
    })
    expect((await repos.sites.get(site.id))?.deletedAt).toBe(0)
    await repos.finds.softDelete(one.id)
    await repos.finds.softDelete(two.id)
    await repos.sites.softDelete(site.id)
    expect((await repos.sites.allLive()).map((row) => row.id)).not.toContain(site.id)
    await close()
  })

  it('refuses to delete a Site that still holds Sessions, even when the Finds have gone', async () => {
    const { repos, close } = makeRepos('t-site-block-sessions')
    const site = await repos.sites.create({ name: 'Session still open' })
    const session = await repos.sessions.create({ date: '2026-01-15', siteId: site.id, startedAt: T0 })
    await expect(repos.sites.softDelete(site.id)).rejects.toMatchObject({ reason: 'site-has-sessions', blockingIds: [session.id] })
    await repos.sessions.softDelete(session.id)
    await repos.sites.softDelete(site.id)
    expect((await repos.sites.allLive()).map((row) => row.id)).not.toContain(site.id)
    await close()
  })

  it('purging a Site leaves a tombstone, so a later sync cannot resurrect it', async () => {
    const { repos, close } = makeRepos('t-site-purge')
    const site = await repos.sites.create({ name: 'Gone for good' })
    await repos.sites.purge(site.id)
    expect(await repos.sites.get(site.id)).toBeUndefined()
    const stones = await repos.db.tombstones.where('store').equals('sites').toArray()
    expect(stones.map((stone) => stone.id)).toEqual([site.id])
    await close()
  })

  it('searches the PLSS quarter, with blank Range and Section acting as wildcards', async () => {
    const { repos, close } = makeRepos('t-site-plss')
    const t4n = await repos.sites.create({ name: 'T4N R2W S12', plssTownship: 'T4N', plssRange: 'R2W', plssSection: '12' })
    const neighbouringRange = await repos.sites.create({ name: 'T4N R3W S7', plssTownship: 'T4N', plssRange: 'R3W', plssSection: '7' })
    await repos.sites.create({ name: 'T5N R2W S12', plssTownship: 'T5N', plssRange: 'R2W', plssSection: '12' })

    expect((await repos.sites.byPlss('T4N', '', '')).map((row) => row.id).sort()).toEqual([t4n.id, neighbouringRange.id].sort())
    expect((await repos.sites.byPlss('T4N', 'R2W', '')).map((row) => row.id)).toEqual([t4n.id])
    expect((await repos.sites.byPlss('T4N', 'R2W', '12')).map((row) => row.id)).toEqual([t4n.id])
    // A Section nobody entered is not a match for a Section somebody asked for.
    expect(await repos.sites.byPlss('T4N', 'R2W', '99')).toEqual([])
    expect(await repos.sites.byPlss('', '', '')).toEqual([])
    await close()
  })
})

describe('landowners', () => {
  it('refuses to delete a Landowner whose Sites are still live, and lets it go once they are binned', async () => {
    const { repos, close } = makeRepos('t-owner-block')
    const owner = await repos.landowners.create({ name: 'Farmer' })
    const site = await repos.sites.create({ name: 'Their field', landownerId: owner.id })
    expect((await repos.landowners.sites(owner.id)).map((row) => row.id)).toEqual([site.id])

    await expect(repos.landowners.softDelete(owner.id)).rejects.toMatchObject({
      reason: 'landowner-has-sites',
      store: 'landowners',
      blockingStore: 'sites',
      blockingIds: [site.id],
    })
    await repos.sites.softDelete(site.id)
    await repos.landowners.softDelete(owner.id)
    expect((await repos.landowners.allLive()).map((row) => row.id)).not.toContain(owner.id)
    await close()
  })
})

describe('permissions: which record covers a Site today', () => {
  it('defaults an open-ended Permission to no expiry and no conditions', async () => {
    const { repos, close } = makeRepos('t-perm-defaults')
    const site = await repos.sites.create({ name: 'Covered' })
    const permission = await repos.permissions.create({ landownerId: 'owner', siteIds: [site.id], grantedOn: '2026-01-01' })
    expect(permission.expiresOn).toBe('')
    expect(permission.conditions).toBe('')
    await close()
  })

  it('reads a Permission through every Site it covers, which is what siteIds[] is for', async () => {
    const { repos, close } = makeRepos('t-perm-multientry')
    const one = await repos.sites.create({ name: 'North field' })
    const two = await repos.sites.create({ name: 'South field' })
    const permission = await repos.permissions.create({ siteIds: [one.id, two.id], grantedOn: '2026-01-01' })
    expect((await repos.permissions.forSite(one.id)).map((row) => row.id)).toEqual([permission.id])
    expect((await repos.permissions.forSite(two.id)).map((row) => row.id)).toEqual([permission.id])
    expect(await repos.permissions.forSite('uncovered')).toEqual([])
    await close()
  })

  it('picks the newest Permission that has not expired', async () => {
    const { repos, close } = makeRepos('t-perm-current')
    const site = await repos.sites.create({ name: 'Tied up' })
    await repos.permissions.create({ siteIds: [site.id], grantedOn: '2026-01-01', expiresOn: '2026-03-01' })
    const openEnded = await repos.permissions.create({ siteIds: [site.id], grantedOn: '2025-05-05', expiresOn: '' })
    const newest = await repos.permissions.create({ siteIds: [site.id], grantedOn: '2026-04-01', expiresOn: '2026-12-31' })

    const today = '2026-06-01'
    expect((await repos.permissions.currentForSite(site.id, today))?.id).toBe(newest.id)
    // The expired grant is still history, it is just not the current one.
    expect((await repos.permissions.forSite(site.id)).length).toBe(3)

    await repos.permissions.softDelete(newest.id)
    expect((await repos.permissions.currentForSite(site.id, today))?.id).toBe(openEnded.id)

    // An open-ended grant that is dated into the past is expired too.
    await repos.permissions.update(openEnded.id, { expiresOn: '2026-05-31' })
    expect(await repos.permissions.currentForSite(site.id, today)).toBeUndefined()
    // ...and the same record is current again the day before it lapses.
    expect((await repos.permissions.currentForSite(site.id, '2026-05-31'))?.id).toBe(openEnded.id)
    await close()
  })
})
