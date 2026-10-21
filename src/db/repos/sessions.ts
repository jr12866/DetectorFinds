import type { AppDatabase } from '../schema'
import { DeleteBlockedError } from '../errors'
import { newId } from '../ids'
import { LIVE, type Session, type TrackPoint } from '../types'
import { distanceM } from '../../geo/distance'
import { clockFrom, tombstone, type RepoOptions } from './common'

/** R-TRACK-1: the sampling rule, stated here so the caller cannot invent its own. */
export const TRACK_SAMPLE_INTERVAL_MS = 3_000
export const TRACK_SAMPLE_DISTANCE_M = 5

/** The formula lives in src/geo/distance.ts; re-exported so existing imports keep working. */
export { distanceM } from '../../geo/distance'

/**
 * Sessions (PRD §7) and the Track that belongs to one.
 *
 * R-SESSION-1: start and stop are explicit, so nothing here opens a Session on
 * its own. R-SESSION-2: one Session per calendar day, which is why the date is a
 * stored column rather than something derived from startedAt at read time.
 * R-EDIT-3: a Session with Finds cannot be deleted.
 */
export function createSessionsRepository(db: AppDatabase, options: RepoOptions = {}) {
  const clock = clockFrom(options)

  /** R-TRACK-2: the whole Track, in order, because it is kept forever. */
  function track(sessionId: string): Promise<TrackPoint[]> {
    return db.trackPoints
      .where('[sessionId+at]')
      .between([sessionId, -Infinity], [sessionId, Infinity])
      .sortBy('at')
  }

  return {
    async create(
      input: Partial<Omit<Session, 'createdAt' | 'updatedAt' | 'deletedAt'>> & { date: string },
    ): Promise<Session> {
      const at = clock()
      const session: Session = {
        id: input.id ?? newId(),
        date: input.date,
        siteId: input.siteId ?? '',
        detectorId: input.detectorId ?? '',
        detectorPresetId: input.detectorPresetId ?? '',
        detectorPresetName: input.detectorPresetName ?? '',
        startedAt: input.startedAt ?? at,
        endedAt: input.endedAt ?? 0,
        notes: input.notes ?? '',
        trackPointCount: 0,
        trackDistanceM: 0,
        createdAt: at,
        updatedAt: at,
        deletedAt: LIVE,
      }
      await db.sessions.put(session)
      return session
    },

    get(id: string): Promise<Session | undefined> {
      return db.sessions.get(id)
    },

    async update(id: string, patch: Partial<Omit<Session, 'id' | 'createdAt'>>): Promise<Session | undefined> {
      const existing = await db.sessions.get(id)
      if (!existing) return undefined
      const merged: Session = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: clock() }
      await db.sessions.put(merged)
      return merged
    },

    /** R-SESSION-1: the only Session the app will ever treat as open. */
    async openSession(): Promise<Session | undefined> {
      const rows = await db.sessions.where('endedAt').equals(0).filter((s) => s.deletedAt === LIVE).toArray()
      return rows[0]
    },

    isOpen(id: string): Promise<boolean> {
      return db.sessions.get(id).then((session) => Boolean(session && session.endedAt === 0 && session.deletedAt === LIVE))
    },

    async close(id: string, endedAt = clock()): Promise<Session | undefined> {
      const existing = await db.sessions.get(id)
      if (!existing) return undefined
      const merged: Session = { ...existing, endedAt, updatedAt: clock() }
      await db.sessions.put(merged)
      return merged
    },

    allLive(): Promise<Session[]> {
      return db.sessions.where('deletedAt').equals(LIVE).toArray().then((rows) => rows.sort((a, b) => b.startedAt - a.startedAt))
    },

    byDate(dateIso: string): Promise<Session[]> {
      return db.sessions.where('date').equals(dateIso).filter((s) => s.deletedAt === LIVE).toArray()
    },

    bySite(siteId: string): Promise<Session[]> {
      return db.sessions.where('siteId').equals(siteId).filter((s) => s.deletedAt === LIVE).toArray()
    },

    /** R-SESSION-2: the guard behind the "you already have a Session for today" prompt. */
    hasSessionOn(dateIso: string): Promise<boolean> {
      return db.sessions.where('date').equals(dateIso).filter((s) => s.deletedAt === LIVE).count().then((n) => n > 0)
    },

    finds(sessionId: string): Promise<string[]> {
      return db.finds.where('[sessionId+foundAt]').between([sessionId, -Infinity], [sessionId, Infinity]).primaryKeys()
    },

    /** R-EDIT-3. */
    async softDelete(id: string): Promise<void> {
      const finds = await db.finds
        .where('[sessionId+foundAt]')
        .between([id, -Infinity], [id, Infinity])
        .filter((find) => find.deletedAt === LIVE)
        .primaryKeys()
      if (finds.length > 0) {
        throw new DeleteBlockedError('session-has-finds', 'sessions', id, 'finds', finds)
      }
      const existing = await db.sessions.get(id)
      if (!existing) return
      await db.sessions.put({ ...existing, deletedAt: clock(), updatedAt: clock() })
    },

    async restore(id: string): Promise<void> {
      const existing = await db.sessions.get(id)
      if (!existing) return
      await db.sessions.put({ ...existing, deletedAt: LIVE, updatedAt: clock() })
    },

    /** R-TRACK-3: the Track goes with the Session, and nowhere else. */
    async purge(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.sessions, db.trackPoints, db.tombstones, async () => {
        const pointIds = await db.trackPoints.where('sessionId').equals(id).primaryKeys()
        await db.trackPoints.bulkDelete(pointIds)
        await db.sessions.delete(id)
        await db.tombstones.bulkPut([
          tombstone('sessions', id, at),
          ...pointIds.map((pointId) => tombstone('trackPoints', pointId, at)),
        ])
      })
    },

    /**
     * R-TRACK-1: decides whether a position is worth recording. The caller keeps
     * the last accepted point, so this stays a pure decision the tests can pin.
     */
    shouldRecordPoint(last: TrackPoint | null, next: { lat: number; lon: number; at: number }): boolean {
      if (!last) return true
      if (next.at - last.at >= TRACK_SAMPLE_INTERVAL_MS) return true
      return distanceM(last, next) >= TRACK_SAMPLE_DISTANCE_M
    },

    /** Appends a point and keeps the Session's running totals current. */
    async addTrackPoint(
      sessionId: string,
      point: { lat: number; lon: number; at: number; accuracyM?: number; altitudeM?: number | null },
    ): Promise<TrackPoint | undefined> {
      const session = await db.sessions.get(sessionId)
      if (!session) return undefined
      return db.transaction('rw', db.sessions, db.trackPoints, async () => {
        const previous = await db.trackPoints
          .where('[sessionId+at]')
          .between([sessionId, -Infinity], [sessionId, Infinity])
          .last()
        const added = previous ? distanceM(previous, point) : 0
        const trackPoint: TrackPoint = {
          id: newId(),
          sessionId,
          at: point.at,
          lat: point.lat,
          lon: point.lon,
          accuracyM: point.accuracyM ?? 0,
          altitudeM: point.altitudeM ?? 0,
          distanceM: added,
        }
        await db.trackPoints.put(trackPoint)
        await db.sessions.put({
          ...session,
          trackPointCount: session.trackPointCount + 1,
          trackDistanceM: session.trackDistanceM + added,
          updatedAt: clock(),
        })
        return trackPoint
      })
    },

    track,

    /**
     * The largest gap in a Track, which is how step 06 refuses a Site Boundary
     * walked with the phone in a pocket. A gap is kept as a gap (ADR-0005), so
     * the only honest answer is the size of the hole.
     */
    largestTrackGapM(sessionId: string): Promise<number> {
      return track(sessionId).then((points) => largestGapM(points))
    },

    trackCount(sessionId: string): Promise<number> {
      return db.trackPoints.where('sessionId').equals(sessionId).count()
    },

    countLive(): Promise<number> {
      return db.sessions.where('deletedAt').equals(LIVE).count()
    },
  }
}

/** Largest distance between consecutive points; 0 when there is nothing to measure. */
export function largestGapM(points: { lat: number; lon: number }[]): number {
  let largest = 0
  for (let i = 1; i < points.length; i++) largest = Math.max(largest, distanceM(points[i - 1], points[i]))
  return largest
}

export type SessionsRepository = ReturnType<typeof createSessionsRepository>
