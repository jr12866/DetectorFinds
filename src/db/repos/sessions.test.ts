import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { DeleteBlockedError } from '../errors'
import type { TrackPoint } from '../types'
import {
  TRACK_SAMPLE_DISTANCE_M,
  TRACK_SAMPLE_INTERVAL_MS,
  distanceM,
  largestGapM,
} from './sessions'
import { DAY, MINUTE, T0, makeRepos } from './testHelpers'

/** A previous Track point, for the two-argument sampling rule. */
function lastPoint(at: number, lat = 39, lon = -99): TrackPoint {
  return {
    id: 'previous',
    sessionId: 'session',
    lat,
    lon,
    at,
    accuracyM: 0,
    altitudeM: 0,
    distanceM: 0,
  }
}

describe('sessions: one Session per calendar day', () => {
  it('creates a Session with the fields the field flow needs', async () => {
    const { repos, close } = makeRepos('t-sess-create')
    const session = await repos.sessions.create({
      date: '2026-04-18',
      siteId: 'site-1',
      detectorId: 'det-1',
      detectorPresetName: 'Park mode',
      startedAt: T0,
    })
    expect(session.date).toBe('2026-04-18')
    expect(session.startedAt).toBe(T0)
    expect(session.endedAt).toBe(0)
    expect(session.trackPointCount).toBe(0)
    expect(session.trackDistanceM).toBe(0)
    expect(session.detectorPresetName).toBe('Park mode')
    // The Session stores the preset's name, not a settings snapshot.
    expect(session.detectorPresetId).toBe('')
    await close()
  })

  it('the date column is what the calendar asks about, not startedAt', async () => {
    const { repos, close } = makeRepos('t-sess-date')
    // Started 23:50, finished after midnight: it still belongs to the 17th.
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    await repos.sessions.close(session.id, T0 + 2 * 60 * 60 * 1000)
    expect((await repos.sessions.byDate('2026-04-17')).map((s) => s.id)).toEqual([session.id])
    expect(await repos.sessions.byDate('2026-04-18')).toEqual([])
    await close()
  })

  it('knows whether a day already has a Session, and ignores binned ones', async () => {
    const { repos, close } = makeRepos('t-sess-has')
    expect(await repos.sessions.hasSessionOn('2026-04-17')).toBe(false)
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    expect(await repos.sessions.hasSessionOn('2026-04-17')).toBe(true)
    await repos.sessions.softDelete(session.id)
    expect(await repos.sessions.hasSessionOn('2026-04-17')).toBe(false)
    await close()
  })

  it('a Session may exist with no Site, which steps 02-05 rely on', async () => {
    const { repos, close } = makeRepos('t-sess-no-site')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    expect(session.siteId).toBe('')
    expect(await repos.sessions.bySite('')).toHaveLength(1)
    await close()
  })
})

describe('sessions: open and close', () => {
  it('finds the one open Session and stops finding it after closing', async () => {
    const { repos, close } = makeRepos('t-sess-open')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    expect((await repos.sessions.openSession())?.id).toBe(session.id)
    expect(await repos.sessions.isOpen(session.id)).toBe(true)

    const closed = await repos.sessions.close(session.id, T0 + 60 * 60 * 1000)
    expect(closed?.endedAt).toBe(T0 + 60 * 60 * 1000)
    expect(await repos.sessions.openSession()).toBeUndefined()
    expect(await repos.sessions.isOpen(session.id)).toBe(false)
    await close()
  })

  it('closes at the injected clock when no time is given', async () => {
    const { repos, setNow, close } = makeRepos('t-sess-close-now')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    setNow(T0 + 3 * 60 * 60 * 1000)
    const closed = await repos.sessions.close(session.id)
    expect(closed?.endedAt).toBe(T0 + 3 * 60 * 60 * 1000)
    await close()
  })

  it('closing a Session that is not there changes nothing', async () => {
    const { repos, close } = makeRepos('t-sess-close-missing')
    expect(await repos.sessions.close('nope')).toBeUndefined()
    expect(await repos.sessions.isOpen('nope')).toBe(false)
    await close()
  })

  it('a binned Session is not the open one', async () => {
    const { repos, close } = makeRepos('t-sess-bin-open')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    await repos.sessions.softDelete(session.id)
    expect(await repos.sessions.openSession()).toBeUndefined()
    expect(await repos.sessions.allLive()).toEqual([])
    await close()
  })

  it('lists live Sessions newest start first', async () => {
    const { repos, close } = makeRepos('t-sess-list')
    const oldest = await repos.sessions.create({ date: '2026-04-15', startedAt: T0 - 2 * DAY })
    const older = await repos.sessions.create({ date: '2026-04-16', startedAt: T0 - DAY })
    const newest = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    expect((await repos.sessions.allLive()).map((s) => s.id)).toEqual([
      newest.id,
      older.id,
      oldest.id,
    ])
    await close()
  })

  it('lists the Sessions held at one Site', async () => {
    const { repos, close } = makeRepos('t-sess-bysite')
    const here = await repos.sessions.create({ date: '2026-04-17', startedAt: T0, siteId: 'site-1' })
    await repos.sessions.create({ date: '2026-04-16', startedAt: T0 - DAY, siteId: 'site-2' })
    expect((await repos.sessions.bySite('site-1')).map((s) => s.id)).toEqual([here.id])
    await close()
  })

  it('update keeps the id and the original createdAt', async () => {
    const { repos, setNow, close } = makeRepos('t-sess-update')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0, notes: 'cold start' })
    setNow(T0 + 10 * MINUTE)
    const saved = await repos.sessions.update(session.id, { notes: 'cold start, then rain' })
    expect(saved?.id).toBe(session.id)
    expect(saved?.createdAt).toBe(session.createdAt)
    expect(saved?.updatedAt).toBe(T0 + 10 * MINUTE)
    expect(saved?.notes).toBe('cold start, then rain')
    // A Session that is not there is not an error worth throwing here.
    expect(await repos.sessions.update('nope', { notes: 'x' })).toBeUndefined()
    await close()
  })

  it('finds the Finds made during a Session', async () => {
    const { repos, close } = makeRepos('t-sess-finds')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    const other = await repos.sessions.create({ date: '2026-04-16', startedAt: T0 - DAY })
    const one = await repos.finds.create({ sessionId: session.id, lat: 39, lon: -99, foundAt: T0 + MINUTE })
    const two = await repos.finds.create({ sessionId: session.id, lat: 39, lon: -99, foundAt: T0 + 2 * MINUTE })
    await repos.finds.create({ sessionId: other.id, lat: 39, lon: -99, foundAt: T0 })
    // Ids, oldest first: the caller reads them straight onto a map.
    expect(await repos.sessions.finds(session.id)).toEqual([one.id, two.id])
    await close()
  })
})

describe('sessions: deleting', () => {
  it('refuses to delete a Session that still has Finds', async () => {
    const { repos, close } = makeRepos('t-sess-block')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    const find = await repos.finds.create({ sessionId: session.id, lat: 39, lon: -99 })
    await expect(repos.sessions.softDelete(session.id)).rejects.toThrow(DeleteBlockedError)
    await expect(repos.sessions.softDelete(session.id)).rejects.toMatchObject({
      reason: 'session-has-finds',
      store: 'sessions',
      blockingStore: 'finds',
      blockingIds: [find.id],
    })
    expect(await repos.sessions.get(session.id)).toBeDefined()
    await close()
  })

  it('a binned Find does not hold its Session in place', async () => {
    const { repos, close } = makeRepos('t-sess-block-bin')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    const find = await repos.finds.create({ sessionId: session.id, lat: 39, lon: -99 })
    await repos.finds.softDelete(find.id)
    await repos.sessions.softDelete(session.id)
    expect(await repos.sessions.allLive()).toEqual([])
    expect(((await repos.sessions.get(session.id))?.deletedAt ?? 0) > 0).toBe(true)
    await close()
  })

  it('re-parenting the Finds first is what lets the Session go', async () => {
    const { repos, close } = makeRepos('t-sess-reparent')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    const other = await repos.sessions.create({ date: '2026-04-18', startedAt: T0 + DAY })
    const find = await repos.finds.create({ sessionId: session.id, lat: 39, lon: -99 })
    await repos.finds.update(find.id, { sessionId: other.id })
    await repos.sessions.softDelete(session.id)
    expect((await repos.finds.get(find.id))?.sessionId).toBe(other.id)
    await close()
  })

  it('purging a Session takes its Track points and leaves tombstones for both', async () => {
    const { repos, setNow, close } = makeRepos('t-sess-purge')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    const a = await repos.sessions.addTrackPoint(session.id, { lat: 39, lon: -99, at: T0 })
    const b = await repos.sessions.addTrackPoint(session.id, { lat: 39.001, lon: -99, at: T0 + 5000 })
    const c = await repos.sessions.addTrackPoint(session.id, { lat: 39.002, lon: -99, at: T0 + 10_000 })
    expect(await repos.sessions.trackCount(session.id)).toBe(3)

    setNow(T0 + 31 * DAY)
    await repos.sessions.purge(session.id)
    expect(await repos.sessions.get(session.id)).toBeUndefined()
    expect(await repos.sessions.trackCount(session.id)).toBe(0)

    const graves = await repos.db.tombstones.toArray()
    const dead = new Map(graves.map((g) => [g.id, g.store]))
    expect(dead.get(session.id)).toBe('sessions')
    for (const point of [a, b, c]) expect(dead.get(point!.id)).toBe('trackPoints')
    expect(graves.every((g) => g.purgedAt === T0 + 31 * DAY)).toBe(true)
    await close()
  })
})

describe('sessions: Track sampling', () => {
  it('takes a point once enough time has passed', async () => {
    const { repos, close } = makeRepos('t-sess-sample-time')
    // Standing still: the clock alone decides.
    expect(
      repos.sessions.shouldRecordPoint(lastPoint(T0), { lat: 39, lon: -99, at: T0 + TRACK_SAMPLE_INTERVAL_MS }),
    ).toBe(true)
    expect(
      repos.sessions.shouldRecordPoint(lastPoint(T0), { lat: 39, lon: -99, at: T0 + TRACK_SAMPLE_INTERVAL_MS - 1 }),
    ).toBe(false)
    await close()
  })

  it('takes a point sooner when the user has moved far enough', async () => {
    const { repos, close } = makeRepos('t-sess-sample-dist')
    const moved = 0.001 // about 111 m of latitude
    expect(
      repos.sessions.shouldRecordPoint(lastPoint(T0), { lat: 39 + moved, lon: -99, at: T0 + 500 }),
    ).toBe(true)
    // Standing still: neither the time nor the distance is worth a point yet.
    expect(repos.sessions.shouldRecordPoint(lastPoint(T0), { lat: 39, lon: -99, at: T0 + 500 })).toBe(false)
    await close()
  })

  it('the first point of a Session is always recorded', async () => {
    const { repos, close } = makeRepos('t-sess-sample-first')
    expect(repos.sessions.shouldRecordPoint(null, { lat: 39, lon: -99, at: T0 })).toBe(true)
    await close()
  })

  it('the sampling rule matches the PRD: 3 seconds or 5 metres', () => {
    expect(TRACK_SAMPLE_INTERVAL_MS).toBe(3000)
    expect(TRACK_SAMPLE_DISTANCE_M).toBe(5)
  })

  it('distanceM is roughly ground distance and shrinks with latitude', () => {
    expect(distanceM({ lat: 39, lon: -99 }, { lat: 39, lon: -99 })).toBe(0)
    const oneDegreeLat = distanceM({ lat: 39, lon: -99 }, { lat: 40, lon: -99 })
    expect(oneDegreeLat).toBeGreaterThan(110_000)
    expect(oneDegreeLat).toBeLessThan(112_000)
    // One degree of longitude at 60°N is half one degree of latitude.
    const atSixty = distanceM({ lat: 60, lon: -99 }, { lat: 60, lon: -98 })
    expect(atSixty).toBeLessThan(oneDegreeLat * 0.55)
    expect(atSixty).toBeGreaterThan(oneDegreeLat * 0.45)
  })

  it('largestGapM measures the hole in a Track, not its length', () => {
    expect(largestGapM([])).toBe(0)
    expect(largestGapM([{ lat: 39, lon: -99 }])).toBe(0)
    const dense = [
      { lat: 39, lon: -99 },
      { lat: 39.0001, lon: -99 },
      { lat: 39.0002, lon: -99 },
    ]
    expect(largestGapM(dense)).toBeLessThan(30)
    const withAHole = [
      { lat: 39, lon: -99 },
      { lat: 39.0001, lon: -99 },
      { lat: 39.02, lon: -99 },
    ]
    expect(largestGapM(withAHole)).toBeGreaterThan(2000)
  })
})

describe('sessions: Track points', () => {
  it('keeps a running point count and distance on the Session', async () => {
    const { repos, close } = makeRepos('t-sess-track-total')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    await repos.sessions.addTrackPoint(session.id, { lat: 39, lon: -99, at: T0 })
    await repos.sessions.addTrackPoint(session.id, { lat: 39.001, lon: -99, at: T0 + 3000 })
    await repos.sessions.addTrackPoint(session.id, { lat: 39.002, lon: -99, at: T0 + 6000 })

    const saved = await repos.sessions.get(session.id)
    expect(saved?.trackPointCount).toBe(3)
    const expected =
      distanceM({ lat: 39, lon: -99 }, { lat: 39.001, lon: -99 }) +
      distanceM({ lat: 39.001, lon: -99 }, { lat: 39.002, lon: -99 })
    expect(saved?.trackDistanceM).toBeCloseTo(expected, 6)
    await close()
  })

  it('the first point of a Session records no distance', async () => {
    const { repos, close } = makeRepos('t-sess-track-first')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    const point = await repos.sessions.addTrackPoint(session.id, { lat: 39, lon: -99, at: T0 })
    expect(point?.distanceM).toBe(0)
    await close()
  })

  it('keeps altitude and accuracy, and 0 means the receiver did not say', async () => {
    const { repos, close } = makeRepos('t-sess-track-accuracy')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    const withAlt = await repos.sessions.addTrackPoint(session.id, {
      lat: 39,
      lon: -99,
      at: T0,
      accuracyM: 4.2,
      altitudeM: 213.5,
    })
    expect(withAlt?.accuracyM).toBeCloseTo(4.2)
    expect(withAlt?.altitudeM).toBeCloseTo(213.5)

    const without = await repos.sessions.addTrackPoint(session.id, { lat: 39, lon: -99, at: T0 + 5000 })
    expect(without?.accuracyM).toBe(0)
    expect(without?.altitudeM).toBe(0)
    await close()
  })

  it('refuses a point for a Session that does not exist', async () => {
    const { repos, close } = makeRepos('t-sess-track-orphan')
    expect(await repos.sessions.addTrackPoint('nope', { lat: 39, lon: -99, at: T0 })).toBeUndefined()
    expect(await repos.sessions.trackCount('nope')).toBe(0)
    await close()
  })

  it('keeps two Sessions Tracks apart and reads them back in order', async () => {
    const { repos, close } = makeRepos('t-sess-track-two')
    const one = await repos.sessions.create({ date: '2026-04-16', startedAt: T0 - DAY })
    const two = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    await repos.sessions.addTrackPoint(one.id, { lat: 39, lon: -99, at: T0 + 30 * 60 * 1000 })
    await repos.sessions.addTrackPoint(two.id, { lat: 40, lon: -98, at: T0 })
    await repos.sessions.addTrackPoint(one.id, { lat: 39.001, lon: -99, at: T0 })

    expect((await repos.sessions.track(one.id)).map((p) => p.at)).toEqual([T0, T0 + 30 * 60 * 1000])
    expect((await repos.sessions.track(two.id)).map((p) => p.lat)).toEqual([40])
    expect(await repos.sessions.trackCount(one.id)).toBe(2)
    await close()
  })

  it('reports the largest gap in a Session Track', async () => {
    const { repos, close } = makeRepos('t-sess-track-gap')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    expect(await repos.sessions.largestTrackGapM(session.id)).toBe(0)
    await repos.sessions.addTrackPoint(session.id, { lat: 39, lon: -99, at: T0 })
    await repos.sessions.addTrackPoint(session.id, { lat: 39.0001, lon: -99, at: T0 + 3000 })
    await repos.sessions.addTrackPoint(session.id, { lat: 39.02, lon: -99, at: T0 + 6000 })
    expect(await repos.sessions.largestTrackGapM(session.id)).toBeGreaterThan(2000)
    await close()
  })

  it('counts live Sessions without dragging Track points along', async () => {
    const { repos, close } = makeRepos('t-sess-count')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    await repos.sessions.addTrackPoint(session.id, { lat: 39, lon: -99, at: T0 })
    await repos.sessions.create({ date: '2026-04-16', startedAt: T0 - DAY })
    expect(await repos.sessions.countLive()).toBe(2)
    await repos.sessions.softDelete(session.id)
    expect(await repos.sessions.countLive()).toBe(1)
    await close()
  })

  it('a binned Session keeps its Track points until it is purged', async () => {
    const { repos, close } = makeRepos('t-sess-track-bin')
    const session = await repos.sessions.create({ date: '2026-04-17', startedAt: T0 })
    await repos.sessions.addTrackPoint(session.id, { lat: 39, lon: -99, at: T0 })
    await repos.sessions.softDelete(session.id)
    expect(await repos.sessions.trackCount(session.id)).toBe(1)
    await close()
  })
})
