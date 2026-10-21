/**
 * What the map writes when the user says "put a pin here" (step 02 build items
 * 9 and 12; R-FIND-1, R-GPS-4, R-EDIT-1).
 *
 * Two rules decide the shape of these records, and both are about honesty
 * rather than storage:
 *
 * - A GPS Pin carries the accuracy the device reported, and nothing else. If the
 *   device reported nothing, `accuracyM` is 0, which is how the schema says
 *   "unknown" (see `db/types.ts`). Inventing a figure would make a bad fix look
 *   defensible five years later when the user is trying to re-find the hole.
 * - A Placed Pin carries no accuracy claim at all (R-GPS-4), including when it
 *   replaces a GPS position. So a pin move clears `accuracyM` rather than
 *   keeping the old number, and sets `positionSource: 'hand'`.
 */
import type { NewFind } from '../db/repos/common'
import type { PositionSource } from '../db/types'
import type { AveragedFix, LivePosition } from '../gps/position'

/** A Find logged from a field map always has these four things decided here. */
export interface PinContext {
  siteId: string
  sessionId: string
  /** When the Find happened, from the repository's clock. */
  foundAt: number
  note?: string
}

/** One decimal of a metre is finer than any phone fix, so it is the storage precision. */
function metres(value: number | undefined | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value * 10) / 10
}

/**
 * R-FIND-1 / R-GPS-3: "Log find" writes the averaged position, not the last fix.
 * The average is what the screen showed the user, so it is what the record has
 * to contain.
 */
export function gpsPinInput(averaged: AveragedFix, context: PinContext): NewFind {
  return {
    foundAt: context.foundAt,
    siteId: context.siteId,
    sessionId: context.sessionId,
    note: context.note ?? '',
    lat: averaged.lat,
    lon: averaged.lon,
    accuracyM: metres(averaged.accuracy),
    altitudeM: metres(averaged.altitudeM),
    positionSource: 'gps',
  }
}

/**
 * R-GPS-4: a hand-placed Pin. No accuracy, no altitude - the user pointed at the
 * map, and the app must not claim more than that.
 */
export function handPinInput(lat: number, lon: number, context: PinContext): NewFind {
  return {
    foundAt: context.foundAt,
    siteId: context.siteId,
    sessionId: context.sessionId,
    note: context.note ?? '',
    lat,
    lon,
    accuracyM: 0,
    altitudeM: 0,
    positionSource: 'hand',
  }
}

/**
 * A Pin the user has been offered but has not confirmed yet (build item 7). The
 * sheet that asks for confirmation shows these numbers, and the Find that
 * eventually gets written contains the same ones, so there is exactly one place
 * where a position is decided.
 */
export interface PendingPin {
  lat: number
  lon: number
  /** 'gps' from the averaged fix, 'hand' from a tap on the map. */
  source: PositionSource
  accuracyM: number
  altitudeM: number
  /** R-GPS-3: the spread the user stood still to get, null until two fixes. */
  scatterM: number | null
  samples: number
}

/**
 * The part of the GPS state a Pin is made from. The feed's `GpsState` satisfies
 * this, and a test can hand in exactly the four fields the decision reads.
 */
export interface GpsOffer {
  position: LivePosition | null
  /** The feed's own verdict on fix age (`STALE_AFTER_MS`). */
  stale: boolean
  scatterM: number | null
  samples: number
}

/**
 * R-GPS-3: offer the averaged position, with the scatter that came with it.
 *
 * Null when there is nothing honest to offer, which the screen reads as "Log
 * find is disabled" rather than offering a Pin at 0/0. A stale fix is refused
 * here rather than warned about, because R-GPS-2 blocks saving a stale position
 * outright; a poor accuracy is *not* refused, because R-GPS-4 says a warning
 * must never stop a save.
 */
export function pendingGpsPin(offer: GpsOffer): PendingPin | null {
  const position = offer.position
  if (offer.stale || position === null || !isPlottable(position.lat, position.lon)) return null
  return {
    lat: position.lat,
    lon: position.lon,
    source: 'gps',
    accuracyM: position.accuracyM,
    altitudeM: position.altitudeM,
    scatterM: offer.scatterM,
    samples: offer.samples,
  }
}

/** R-GPS-4: a tapped position. No accuracy, no altitude, no scatter to show. */
export function pendingHandPin(lat: number, lon: number): PendingPin | null {
  if (!isPlottable(lat, lon)) return null
  return { lat, lon, source: 'hand', accuracyM: 0, altitudeM: 0, scatterM: null, samples: 1 }
}

/** The Find record for a confirmed Pin, in whichever way it was arrived at. */
export function pinInputFor(pin: PendingPin, context: PinContext): NewFind {
  return pin.source === 'hand'
    ? handPinInput(pin.lat, pin.lon, context)
    : gpsPinInput(
        {
          lat: pin.lat,
          lon: pin.lon,
          accuracy: pin.accuracyM,
          altitudeM: pin.altitudeM,
          heading: null,
          scatterM: pin.scatterM,
        },
        context,
      )
}

/** The patch `finds.setPosition` takes when Move Pin commits (R-EDIT-1). */
export interface MovePinPatch {
  lat: number
  lon: number
  accuracyM: number
  altitudeM: number
  source: PositionSource
}

/**
 * R-EDIT-1: moving a Pin is a hand decision, so the moved Pin becomes a Placed
 * Pin. Keeping the old accuracy figure would attach a GPS claim to a position no
 * GPS produced, which is the mistake this whole file exists to prevent.
 */
export function movePinPatch(lat: number, lon: number): MovePinPatch {
  return { lat, lon, accuracyM: 0, altitudeM: 0, source: 'hand' }
}

/**
 * A Pin move is allowed whatever the GPS is doing - R-GPS-2 says the app never
 * blocks a logging action - but a position of 0/0 is the schema's "no position",
 * and writing one would put a Find in the sea.
 */
export function isPlottable(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  if (lat === 0 && lon === 0) return false
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}
