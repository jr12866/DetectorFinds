import type { AppDatabase } from '../schema'
import { newId } from '../ids'
import type { TrackPoint } from '../types'
import { clockFrom, type RepoOptions } from './common'
import { distanceM } from './sessions'

/**
 * Bulk Track work: seeding, importing and repairing the running totals.
 *
 * Appending a single live point belongs to the Sessions repository, because that
 * is where the Session's point count and distance live. This module is for the
 * cases where many points arrive at once, or where the totals have to be rebuilt
 * from the points themselves.
 */
export function createTrackPointsRepository(db: AppDatabase, options: RepoOptions = {}) {
  const clock = clockFrom(options)

  return {
    /** Adds many points to one Session in order, and refreshes its totals once. */
    async addAll(
      sessionId: string,
      points: { lat: number; lon: number; at: number; accuracyM?: number; altitudeM?: number | null }[],
    ): Promise<number> {
      if (points.length === 0) return 0
      const rows: TrackPoint[] = []
      points.forEach((point, index) => {
        const previous = index === 0 ? null : points[index - 1]
        rows.push({
          id: newId(),
          sessionId,
          at: point.at,
          lat: point.lat,
          lon: point.lon,
          accuracyM: point.accuracyM ?? 0,
          altitudeM: point.altitudeM ?? 0,
          distanceM: previous ? distanceM(previous, point) : 0,
        })
      })
      await db.transaction('rw', db.sessions, db.trackPoints, async () => {
        await db.trackPoints.bulkPut(rows)
        await recountInside(db, sessionId, clock())
      })
      return rows.length
    },

    forSession(sessionId: string): Promise<TrackPoint[]> {
      return db.trackPoints
        .where('[sessionId+at]')
        .between([sessionId, -Infinity], [sessionId, Infinity])
        .sortBy('at')
    },

    /** R-TRACK-3: the Track is deleted with the Session, never on its own. */
    async deleteForSession(sessionId: string): Promise<number> {
      return db.transaction('rw', db.sessions, db.trackPoints, db.tombstones, async () => {
        const ids = await db.trackPoints.where('sessionId').equals(sessionId).primaryKeys()
        await db.trackPoints.bulkDelete(ids)
        const at = clock()
        await db.tombstones.bulkPut(ids.map((id) => ({ id, store: 'trackPoints' as const, deletedAt: at, purgedAt: at })))
        await recountInside(db, sessionId, at)
        return ids.length
      })
    },

    /** Rebuilds a Session's Track totals from its points. */
    recount(sessionId: string): Promise<{ trackPointCount: number; trackDistanceM: number }> {
      return db.transaction('rw', db.sessions, db.trackPoints, async () =>
        recountInside(db, sessionId, clock()),
      )
    },

    countAll(): Promise<number> {
      return db.trackPoints.count()
    },

    /** Sessions that have a Track at all, which is what step 05 lists. */
    sessionIdsWithTracks(): Promise<string[]> {
      return db.trackPoints.toArray().then((rows) => [...new Set(rows.map((row) => row.sessionId))])
    },
  }
}

async function recountInside(
  db: AppDatabase,
  sessionId: string,
  at: number,
): Promise<{ trackPointCount: number; trackDistanceM: number }> {
  const session = await db.sessions.get(sessionId)
  const points = await db.trackPoints
    .where('[sessionId+at]')
    .between([sessionId, -Infinity], [sessionId, Infinity])
    .sortBy('at')
  let distance = 0
  for (let i = 1; i < points.length; i++) distance += distanceM(points[i - 1], points[i])
  if (session) {
    await db.sessions.put({ ...session, trackPointCount: points.length, trackDistanceM: distance, updatedAt: at })
  }
  return { trackPointCount: points.length, trackDistanceM: distance }
}

export type TrackPointsRepository = ReturnType<typeof createTrackPointsRepository>
