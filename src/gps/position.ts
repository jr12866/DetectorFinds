/**
 * One GPS feed for the whole app (docs/build/02-map-gps-and-the-first-pin.md).
 *
 * The browser is only asked for one `watchPosition`. Everything else subscribes.
 * Heading comes from the device orientation sensor, which is separate, and is
 * smoothed so the map does not wobble.
 */
import type { Millis, PositionSource } from '../db/types'

export type GpsStatus = 'idle' | 'requesting' | 'ok' | 'denied' | 'unavailable' | 'error'

/**
 * Position (GLOSSARY): lat, lon, altitudeM, accuracyM, headingDeg, speedMps,
 * fixTime, source. There is no Position row in the database - the fields live
 * inline on the Find or TrackPoint that used them - so this is the reading the
 * screens pass along. Zero means "the device did not report it", which is how
 * the rows say the same thing.
 */
export interface LivePosition {
  lat: number
  lon: number
  /** metres, 0 = unknown */
  accuracyM: number
  /** metres, 0 = not reported */
  altitudeM: number
  /** degrees true, 0 = unknown */
  headingDeg: number
  /** metres/second, 0 = unknown */
  speedMps: number
  fixTime: Millis
  source: PositionSource
}

/** A raw reading, before it is averaged. */
export interface SatFix {
  lat: number
  lon: number
  /** metres, 0 = not reported */
  altitudeM: number
  /** metres, 0 = unknown */
  accuracy: number
  /** degrees true, or null when the device is not giving one */
  heading: number | null
  /** metres/second, or null */
  speed: number | null
  /** when the hardware took the reading */
  fixTime: number
  /** when we received it */
  receivedAt: number
}

export interface GpsState {
  status: GpsStatus
  /** human-readable reason when status is denied/unavailable/error */
  message: string
  fix: SatFix | null
  /** the fix's age in ms at the moment the state was produced */
  ageMs: number
  /** true when the fix is too old or too inaccurate to log against */
  stale: boolean
  /** how many averaged readings went into `position` */
  samples: number
  /** the averaged position, or null before the first fix */
  position: LivePosition | null
}

export const STALE_AFTER_MS = 8_000
/** Above this we warn before logging. R-GPS-05. */
export const POOR_ACCURACY_M = 25

export const IDLE_GPS_STATE: GpsState = {
  status: 'idle',
  message: '',
  fix: null,
  ageMs: 0,
  stale: true,
  samples: 0,
  position: null,
}

/**
 * Running mean of the recent readings. Averaging over a few seconds pulls the
 * plotted point back towards the truth because GPS error is roughly random
 * (R-GPS-04).
 */
export class PositionAverager {
  private readonly samples: SatFix[] = []

  constructor(private readonly windowMs: number = 4_000, private readonly maxSamples: number = 6) {}

  reset(): void {
    this.samples.length = 0
  }

  add(fix: SatFix): void {
    this.samples.push(fix)
    const newest = fix.fixTime
    while (this.samples.length > this.maxSamples) this.samples.shift()
    while (this.samples.length > 1 && newest - this.samples[0].fixTime > this.windowMs) this.samples.shift()
  }

  get count(): number {
    return this.samples.length
  }

  /** Mean position of the window, or null when empty. */
  average(): AveragedFix | null {
    if (this.samples.length === 0) return null
    let lat = 0
    let lon = 0
    let accuracy = 0
    let altitudeTotal = 0
    let altitudeCount = 0
    let sumSin = 0
    let sumCos = 0
    let headingCount = 0
    for (const fix of this.samples) {
      lat += fix.lat
      lon += fix.lon
      accuracy += fix.accuracy
      // Altitude is usually missing on a phone. Averaging the zeros in would
      // invent a sea-level altitude, so only reported values are counted.
      if (fix.altitudeM !== 0) {
        altitudeTotal += fix.altitudeM
        altitudeCount += 1
      }
      if (fix.heading !== null) {
        const rad = (fix.heading * Math.PI) / 180
        sumSin += Math.sin(rad)
        sumCos += Math.cos(rad)
        headingCount += 1
      }
    }
    const n = this.samples.length
    return {
      lat: lat / n,
      lon: lon / n,
      accuracy: accuracy / n,
      altitudeM: altitudeCount === 0 ? 0 : altitudeTotal / altitudeCount,
      heading: headingCount === 0 ? null : ((Math.atan2(sumSin, sumCos) * 180) / Math.PI + 360) % 360,
    }
  }
}

export interface AveragedFix {
  lat: number
  lon: number
  accuracy: number
  altitudeM: number
  heading: number | null
}

/**
 * Low-pass filter for the compass. Heading is circular, so the shortest way
 * between 350° and 10° is +20°, not -340°.
 */
export function smoothHeading(previous: number | null, next: number, alpha: number = 0.3): number {
  if (previous === null) return ((next % 360) + 360) % 360
  const diff = ((next - previous + 540) % 360) - 180
  return (((previous + alpha * diff) % 360) + 360) % 360
}

export function isStale(fix: SatFix | null, now: number): boolean {
  if (fix === null) return true
  return now - fix.fixTime > STALE_AFTER_MS
}

export function isPoorAccuracy(accuracy: number): boolean {
  return accuracy > POOR_ACCURACY_M
}

/**
 * The single GPS feed. Call `start()` when a screen needs the position and
 * `stop()` when it does not; the watch is reference-counted so two screens
 * never fight over it.
 */
export class GpsFeed {
  private watchId: number | null = null
  private refs = 0
  private state: GpsState = IDLE_GPS_STATE
  private readonly listeners = new Set<(state: GpsState) => void>()
  private readonly averager = new PositionAverager()
  private heading: number | null = null
  private headingAt = 0
  private ageTimer: number | null = null

  get isRunning(): boolean {
    return this.watchId !== null
  }

  getState(): GpsState {
    return this.state
  }

  subscribe(listener: (state: GpsState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Keeps the watch alive while at least one caller holds it. */
  retain(): () => void {
    this.refs += 1
    this.start()
    let released = false
    return () => {
      if (released) return
      released = true
      this.refs = Math.max(0, this.refs - 1)
      if (this.refs === 0) this.stop()
    }
  }

  start(): void {
    if (this.watchId !== null) return
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.publish({ ...IDLE_GPS_STATE, status: 'unavailable', message: 'This browser has no location support.' })
      return
    }
    this.patch({ status: 'requesting', message: 'Waiting for satellites…' })
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onFix(pos),
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED
        this.patch({
          status: denied ? 'denied' : 'error',
          message: denied
            ? 'Location permission is off. Enable it for this site in the browser, then pull to refresh.'
            : err.message || 'No position available.',
        })
      },
      // R-GPS-01: high accuracy, no timeout. A cold start on a phone can take
      // a minute and the app must keep waiting rather than give up.
      { enableHighAccuracy: true, timeout: 0, maximumAge: 0 },
    )
    this.ageTimer = window.setInterval(() => this.publishAge(), 1_000)
  }

  stop(): void {
    if (this.watchId !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
    if (this.ageTimer !== null) {
      window.clearInterval(this.ageTimer)
      this.ageTimer = null
    }
  }

  /** Feed the compass in from the device orientation events. */
  setHeading(heading: number | null): void {
    if (heading === null) return
    this.heading = smoothHeading(this.heading, heading)
    this.headingAt = Date.now()
    if (this.state.fix) {
      this.patch({ fix: { ...this.state.fix, heading: this.heading } })
    }
  }

  getHeading(): number | null {
    // A compass that stopped reporting is not a heading we should keep drawing.
    if (this.heading === null) return null
    return Date.now() - this.headingAt > 15_000 ? null : this.heading
  }

  /** Drop the averaged history, e.g. when the user walks into a new area. */
  resetHistory(): void {
    this.averager.reset()
  }

  private onFix(pos: GeolocationPosition): void {
    const fix: SatFix = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      altitudeM: pos.coords.altitude ?? 0,
      accuracy: pos.coords.accuracy ?? 0,
      heading: this.getHeading(),
      speed: pos.coords.speed ?? null,
      fixTime: pos.timestamp || Date.now(),
      receivedAt: Date.now(),
    }
    this.averager.add(fix)
    const avg = this.averager.average()
    const position: LivePosition | null = avg
      ? {
          lat: avg.lat,
          lon: avg.lon,
          accuracyM: Math.round(avg.accuracy * 10) / 10,
          altitudeM: Math.round(avg.altitudeM * 10) / 10,
          headingDeg: avg.heading === null ? 0 : Math.round(avg.heading),
          speedMps: fix.speed ?? 0,
          fixTime: fix.fixTime,
          source: 'gps',
        }
      : null
    this.publish({
      status: 'ok',
      message: '',
      fix,
      ageMs: Date.now() - fix.fixTime,
      stale: isStale(fix, Date.now()),
      samples: this.averager.count,
      position,
    })
  }

  private publishAge(): void {
    if (!this.state.fix) return
    const now = Date.now()
    this.publish({
      ...this.state,
      ageMs: now - this.state.fix.fixTime,
      stale: isStale(this.state.fix, now),
    })
  }

  private patch(part: Partial<GpsState>): void {
    this.publish({ ...this.state, ...part })
  }

  private publish(state: GpsState): void {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }
}

/** The one feed the app uses. */
export const gpsFeed = new GpsFeed()
