import { describe, expect, it } from 'vitest'
import {
  FOLLOW_PAN_THRESHOLD_M,
  decideOnFix,
  followLabel,
  initialFollowMode,
  modeAfterDrag,
  modeAfterRecenter,
  recenterIsUseful,
} from './followMode'

const AT = { lat: 51.0, lon: -1.0 }
/** Roughly 40 m north of AT. */
const NEARBY = { lat: 51.00036, lon: -1.0 }
/** Roughly 5 m north of AT, inside the jitter band. */
const JITTER = { lat: 51.000045, lon: -1.0 }

describe('follow mode transitions (build item 6)', () => {
  it('the map opens following the user', () => {
    expect(initialFollowMode()).toBe('following')
  })

  it('a drag releases follow mode, from either state', () => {
    expect(modeAfterDrag('following')).toBe('free')
    expect(modeAfterDrag('free')).toBe('free')
  })

  it('Recenter re-arms it', () => {
    expect(modeAfterRecenter('free')).toBe('following')
    expect(modeAfterRecenter('following')).toBe('following')
  })
})

describe('decideOnFix', () => {
  it('the first fix centres the map, because there is nothing to pan from', () => {
    expect(decideOnFix('following', null, AT)).toEqual({ mode: 'following', panTo: AT })
  })

  it('follow mode keeps up with a walk', () => {
    expect(decideOnFix('following', AT, NEARBY).panTo).toEqual(NEARBY)
  })

  it('follow mode does not lurch for GPS jitter', () => {
    // A phone reports a few metres of movement while the user stands still, and
    // panning the map for that is how follow mode becomes unusable.
    expect(decideOnFix('following', AT, JITTER).panTo).toBeNull()
  })

  it('free mode never pans, but the mode is unchanged', () => {
    const decision = decideOnFix('free', AT, NEARBY)
    expect(decision.panTo).toBeNull()
    expect(decision.mode).toBe('free')
  })

  it('nothing to do when there is no fix yet', () => {
    expect(decideOnFix('following', AT, null)).toEqual({ mode: 'following', panTo: null })
  })

  it('the jitter band is wider than a good phone fix and narrower than a pace', () => {
    expect(FOLLOW_PAN_THRESHOLD_M).toBeGreaterThan(10)
    expect(FOLLOW_PAN_THRESHOLD_M).toBeLessThan(60)
  })
})

describe('recenterIsUseful', () => {
  it('is useful while the user is looking somewhere else', () => {
    expect(recenterIsUseful('free', AT, NEARBY)).toBe(true)
    expect(recenterIsUseful('following', AT, NEARBY)).toBe(true)
  })

  it('is not useful while the map is already sitting on the user', () => {
    expect(recenterIsUseful('following', AT, JITTER)).toBe(false)
  })

  it('is not useful before there is a position to go to', () => {
    expect(recenterIsUseful('following', AT, null)).toBe(false)
    expect(recenterIsUseful('free', AT, null)).toBe(false)
  })

  it('is useful in free mode even when the map happens to be centred on the user, because the button is how you re-arm follow', () => {
    expect(recenterIsUseful('free', AT, AT)).toBe(true)
  })
})

describe('followLabel (what the status strip is allowed to claim)', () => {
  it('says Follow waiting while there is no fix, because the map is not following anyone yet', () => {
    expect(followLabel('following', false)).toBe('Follow waiting')
  })

  it('says Following once there is a position to follow', () => {
    expect(followLabel('following', true)).toBe('Following')
  })

  it('says Free whatever the position, because the user has the map', () => {
    expect(followLabel('free', true)).toBe('Free')
    expect(followLabel('free', false)).toBe('Free')
  })
})
