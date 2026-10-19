import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { MINUTE, T0, makeRepos, type TestSetup } from './testHelpers'

const HOUR = 60 * MINUTE

describe('track points repository', () => {
  let app: TestSetup

  beforeEach(async () => {
    app = makeRepos(`track-${Math.random()}`)
  })

  async function newSession(date = '2026-01-15') {
    return app.repos.sessions.create({ date, startedAt: T0, endedAt: T0 + 4 * HOUR })
  }

  it('adds a run of points in order and reports how many landed', async () => {
    const session = await newSession()
    const added = await app.repos.trackPoints.addAll(session.id, [
      { lat: 39, lon: -98, at: T0 },
      { lat: 39.001, lon: -98, at: T0 + 3_000 },
      { lat: 39.002, lon: -98, at: T0 + 6_000 },
    ])

    expect(added).toBe(3)
    expect(await app.repos.trackPoints.countAll()).toBe(3)
  })

  it('refreshes the Session totals once for a bulk add', async () => {
    const session = await newSession()
    await app.repos.trackPoints.addAll(session.id, [
      { lat: 39, lon: -98, at: T0 },
      { lat: 39.001, lon: -98, at: T0 + 3_000 },
      { lat: 39.002, lon: -98, at: T0 + 6_000 },
    ])

    const stored = await app.repos.sessions.get(session.id)
    expect(stored?.trackPointCount).toBe(3)
    // 0.001° of latitude is about 110.5 m, twice over.
    expect(stored?.trackDistanceM).toBeCloseTo(221.1, 0)
  })

  it('adds nothing for an empty run and leaves the totals alone', async () => {
    const session = await newSession()
    expect(await app.repos.trackPoints.addAll(session.id, [])).toBe(0)

    const stored = await app.repos.sessions.get(session.id)
    expect(stored?.trackPointCount).toBe(0)
    expect(stored?.trackDistanceM).toBe(0)
  })

  it('reads a Session back in time order', async () => {
    const session = await newSession()
    await app.repos.trackPoints.addAll(session.id, [
      { lat: 39, lon: -98, at: T0 + 2 * MINUTE },
      { lat: 39.001, lon: -98, at: T0 },
      { lat: 39.002, lon: -98, at: T0 + MINUTE },
    ])

    const points = await app.repos.trackPoints.forSession(session.id)
    expect(points.map((p) => p.at)).toEqual([T0, T0 + MINUTE, T0 + 2 * MINUTE])
  })

  it('rebuilds the totals from the points when they have drifted', async () => {
    const session = await newSession()
    await app.repos.trackPoints.addAll(session.id, [
      { lat: 39, lon: -98, at: T0 },
      { lat: 39.001, lon: -98, at: T0 + 3_000 },
    ])
    await app.db.sessions.update(session.id, { trackPointCount: 99, trackDistanceM: 12_345 })

    const recount = await app.repos.trackPoints.recount(session.id)
    expect(recount.trackPointCount).toBe(2)
    expect(recount.trackDistanceM).toBeCloseTo(110.5, 0)

    const stored = await app.repos.sessions.get(session.id)
    expect(stored?.trackPointCount).toBe(2)
    expect(stored?.trackDistanceM).toBeCloseTo(110.5, 0)
  })

  it('deletes every point for a Session and zeroes its totals', async () => {
    const session = await newSession()
    await app.repos.trackPoints.addAll(session.id, [
      { lat: 39, lon: -98, at: T0 },
      { lat: 39.001, lon: -98, at: T0 + 3_000 },
    ])

    await app.repos.trackPoints.deleteForSession(session.id)

    expect((await app.repos.trackPoints.forSession(session.id)).length).toBe(0)
    expect(await app.repos.trackPoints.countAll()).toBe(0)
  })

  it('lists which Sessions hold Tracks, so the map knows what it can draw', async () => {
    const withTrack = await newSession('2026-01-15')
    const empty = await newSession('2026-01-16')
    await app.repos.trackPoints.addAll(withTrack.id, [{ lat: 39, lon: -98, at: T0 }])

    expect(await app.repos.trackPoints.sessionIdsWithTracks()).toEqual([withTrack.id])
    expect(await app.repos.trackPoints.forSession(empty.id)).toEqual([])
  })

  it('keeps a day of points for one Session without complaint', async () => {
    const session = await newSession()
    const points = Array.from({ length: 4_800 }, (_, i) => ({
      lat: 39 + i * 0.00001,
      lon: -98,
      at: T0 + i * 3_000,
    }))

    expect(await app.repos.trackPoints.addAll(session.id, points)).toBe(4_800)
    expect(await app.repos.trackPoints.countAll()).toBe(4_800)

    const stored = await app.repos.sessions.get(session.id)
    expect(stored?.trackPointCount).toBe(4_800)
    expect(stored?.trackDistanceM).toBeGreaterThan(0)
  })
})
