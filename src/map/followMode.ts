/**
 * Follow mode (step 02 build item 6).
 *
 * The rule is short: while the user is walking, the map keeps the dot in the
 * middle; the moment the user drags the map, it stops; Recenter starts it again.
 * What makes it feel right or wrong is the detail - how far the dot has to move
 * before the map pans, and the fact that a pan the user did not ask for must
 * never look like a drag they did ask for - so the decision lives here where it
 * can be argued with in a test rather than felt on a phone.
 */
import { distanceM, type LatLng } from '../geo/distance'

export type FollowMode = 'following' | 'free'

/**
 * How far the fix has to move before the map pans after it. Below this the dot
 * moves inside the circle it is already drawn in, and panning the whole map for
 * a metre of GPS jitter is what makes a follow-mode map feel ill.
 */
export const FOLLOW_PAN_THRESHOLD_M = 25

/**
 * The map opens following. A detectorist arriving at a field wants to see where
 * they are, and the alternative - opening centred on nothing - shows a grey
 * rectangle until they tap something.
 */
export function initialFollowMode(): FollowMode {
  return 'following'
}

/** Build item 6: any drag of the map ends follow mode. There is no "drag a bit". */
export function modeAfterDrag(_mode: FollowMode): FollowMode {
  return 'free'
}

/** The Recenter button re-arms follow mode, and also centres this time. */
export function modeAfterRecenter(_mode: FollowMode): FollowMode {
  return 'following'
}

export interface FollowDecision {
  mode: FollowMode
  /** Where to move the map, or null to leave it exactly where it is. */
  panTo: LatLng | null
}

/**
 * What to do when a new fix arrives.
 *
 * In 'free' the dot still moves - the user is always allowed to see where they
 * are - but the map does not. That distinction is the whole point of the mode.
 */
export function decideOnFix(mode: FollowMode, centre: LatLng | null, position: LatLng | null): FollowDecision {
  if (mode !== 'following' || position === null) return { mode, panTo: null }
  if (centre === null) return { mode, panTo: position }
  if (distanceM(centre, position) < FOLLOW_PAN_THRESHOLD_M) return { mode, panTo: null }
  return { mode, panTo: position }
}

/**
 * Whether the Recenter button is worth showing. It is only useful while the map
 * is looking somewhere other than the user.
 */
export function recenterIsUseful(mode: FollowMode, centre: LatLng | null, position: LatLng | null): boolean {
  if (position === null) return false
  if (mode === 'free') return true
  if (centre === null) return true
  return distanceM(centre, position) >= FOLLOW_PAN_THRESHOLD_M
}

/**
 * What the status strip says about follow mode. The wording separates the mode
 * being armed from the map actually following: before the first fix the map
 * cannot follow anyone, and "Following" would be a claim about a thing that is
 * not happening.
 */
export function followLabel(mode: FollowMode, hasPosition: boolean): string {
  if (mode === 'free') return 'Free'
  return hasPosition ? 'Following' : 'Follow waiting'
}
