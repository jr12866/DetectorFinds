/**
 * The numbers a field map has to show, as text (step 02 build items 4, 8, 13;
 * R-GPS-1, R-GPS-2, R-MAP-2).
 *
 * R-GPS-2 wants the accuracy figure on screen at all times, and a warning past
 * the threshold that never blocks the user from logging. "At all times" includes
 * the case where the device reported nothing, which is why unknown is a level of
 * its own here rather than a zero: a readout that says "±0 m" would be a claim
 * the phone never made, and R-GPS-4 forbids it.
 *
 * Imperial is a display concern only (ADR-0006); the metres figure is what the
 * database holds and what the popup quotes for accuracy.
 */
import { formatDistance } from '../units/units'
import { POOR_ACCURACY_M, isPoorAccuracy } from '../gps/position'

/** R-GPS-4: a Placed Pin carries no accuracy claim, so 0 means "not reported". */
export function accuracyKnown(accuracyM: number): boolean {
  return Number.isFinite(accuracyM) && accuracyM > 0
}

/** The accuracy figure in metres, or blank when there is no figure to show. */
export function accuracyText(accuracyM: number): string {
  if (!accuracyKnown(accuracyM)) return ''
  // Sub-metre accuracy is worth a decimal; 18 m of error is not.
  const text = accuracyM < 10 ? accuracyM.toFixed(1) : String(Math.round(accuracyM))
  return `±${text} m`
}

export type AccuracyLevel = 'ok' | 'warn' | 'unknown'

export interface AccuracyAdvice {
  level: AccuracyLevel
  /** What the screen shows next to the accuracy figure. */
  text: string
  /**
   * True when the user should be offered the chance to wait for a better fix.
   * R-GPS-2: an offer, never a block - a detectorist who has decided to dig is
   * allowed to dig.
   */
  offerWait: boolean
}

/**
 * The accuracy readout and its warning. `stale` is the fix being older than
 * `STALE_AFTER_MS`, which matters even when the accuracy figure looks fine: a
 * 3 m circle from a fix taken two minutes ago is not where the user is standing.
 */
export function accuracyAdvice(accuracyM: number, stale: boolean): AccuracyAdvice {
  if (!accuracyKnown(accuracyM)) {
    return { level: 'unknown', text: 'No accuracy figure from the device.', offerWait: true }
  }
  if (stale) {
    return { level: 'warn', text: 'Fix is stale. Wait for a fresh one, or place the pin by hand.', offerWait: true }
  }
  if (isPoorAccuracy(accuracyM)) {
    return {
      level: 'warn',
      text: `Accuracy is worse than ${POOR_ACCURACY_M} m. Wait for a better fix if you can.`,
      offerWait: true,
    }
  }
  return { level: 'ok', text: '', offerWait: false }
}

/** How old the current fix is, in the words a screen shows next to the dot. */
export function fixAgeText(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown'
  if (ageMs < 2_000) return 'just now'
  if (ageMs < 60_000) return `${Math.round(ageMs / 1_000)} s ago`
  const minutes = Math.round(ageMs / 60_000)
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.round(minutes / 60)} h ago`
}

/**
 * Distance from the user to a Pin (R-MAP-2). `fromM` is null when there is no
 * position to measure from, which is a different thing from being on top of it.
 */
export function distanceText(fromM: number | null): string {
  if (fromM === null) return ''
  if (fromM < 1) return 'here'
  return formatDistance(fromM)
}

/**
 * Date On for the popup card (GLOSSARY). Local calendar day, written
 * year-month-day: unambiguous across the Atlantic, and the same string the
 * export uses, so a user comparing the two is not confused.
 */
export function dayText(millis: number): string {
  if (!Number.isFinite(millis) || millis <= 0) return ''
  const at = new Date(millis)
  const month = String(at.getMonth() + 1).padStart(2, '0')
  const day = String(at.getDate()).padStart(2, '0')
  return `${at.getFullYear()}-${month}-${day}`
}

/**
 * Coordinates to six decimal places: about 0.1 m at this latitude, which is
 * finer than any phone fix but the right number to compare against a mock
 * location app when checking acceptance on a phone.
 */
export function coordText(lat: number, lon: number): string {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`
}

/** Scatter of the averaged fixes, in metres, for R-GPS-3's "show both". */
export function scatterText(scatterM: number | null): string {
  if (scatterM === null || !Number.isFinite(scatterM)) return ''
  return `spread ${scatterM < 10 ? scatterM.toFixed(1) : Math.round(scatterM)} m`
}

/**
 * Faster than this is walking, not standing (about 2.2 mph). A phone reports a
 * few tenths of a metre per second while a person is merely shifting their
 * weight, so the threshold has to sit above the noise and below a pace.
 */
export const STANDING_SPEED_MPS = 1

/**
 * R-GPS-3: what to tell the user while the app averages fixes. The flow asks
 * them to stand still, and the only honest way to run it is to say what it is
 * actually seeing - how many fixes, how far they spread, whether the user is
 * moving. None of it blocks logging (R-GPS-2); it is the reason the mean is or
 * is not worth waiting for.
 */
export function averagingAdvice(samples: number, scatterM: number | null, speedMps: number): string {
  if (samples === 0) return 'No fix yet. Stand still and wait for the blue dot.'
  if (speedMps > STANDING_SPEED_MPS) return 'You appear to be moving. Stand still for a few seconds for a better position.'
  if (samples < 3) return 'Still collecting fixes. Stay still.'
  if (scatterM !== null && scatterM > POOR_ACCURACY_M) {
    return `${scatterText(scatterM)} while standing still. The position has not settled; wait if you can.`
  }
  return ''
}
