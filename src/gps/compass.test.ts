import { describe, expect, it } from 'vitest'
import { compassNeedsPermission, headingFromEvent } from './compass'

/** The shape the two platforms actually send, with the iOS-only fields. */
interface HeadingEvent {
  alpha?: number | null
  webkitCompassHeading?: number
}

function event(part: HeadingEvent) {
  return { ...part } as Parameters<typeof headingFromEvent>[0]
}

/**
 * R-MAP-6: heading has to come out of whichever sensor the platform exposes.
 * Android gives `deviceorientationabsolute` with alpha measured anticlockwise
 * from north; iOS gives `webkitCompassHeading` already clockwise. Both readings
 * arrive here, so the sign flip is the thing most likely to be wrong.
 */
describe('headingFromEvent', () => {
  it('says there is no heading when there is no event', () => {
    expect(headingFromEvent(null)).toBeNull()
  })

  it('takes the iOS heading as given, clockwise from north', () => {
    expect(headingFromEvent(event({ webkitCompassHeading: 0 }))).toBe(0)
    expect(headingFromEvent(event({ webkitCompassHeading: 90 }))).toBe(90)
    expect(headingFromEvent(event({ webkitCompassHeading: 180 }))).toBe(180)
    expect(headingFromEvent(event({ webkitCompassHeading: 270 }))).toBe(270)
  })

  it('normalises an iOS heading that arrives outside 0-360', () => {
    expect(headingFromEvent(event({ webkitCompassHeading: 450 }))).toBe(90)
    expect(headingFromEvent(event({ webkitCompassHeading: -90 }))).toBe(270)
  })

  it('flips Android alpha, which runs anticlockwise from north', () => {
    expect(headingFromEvent(event({ alpha: 0 }))).toBe(0)
    expect(headingFromEvent(event({ alpha: 90 }))).toBe(270)
    expect(headingFromEvent(event({ alpha: 270 }))).toBe(90)
    expect(headingFromEvent(event({ alpha: 180 }))).toBe(180)
  })

  it('prefers the iOS field when a browser sends both', () => {
    expect(headingFromEvent(event({ webkitCompassHeading: 90, alpha: 270 }))).toBe(90)
  })

  it('ignores a non-finite iOS heading and falls back to alpha', () => {
    expect(headingFromEvent(event({ webkitCompassHeading: Number.NaN, alpha: 90 }))).toBe(270)
  })

  it('says there is no heading when the sensor reports nothing usable', () => {
    expect(headingFromEvent(event({}))).toBeNull()
    expect(headingFromEvent(event({ alpha: null }))).toBeNull()
    expect(headingFromEvent(event({ alpha: Number.NaN }))).toBeNull()
    expect(headingFromEvent(event({ alpha: Number.POSITIVE_INFINITY }))).toBeNull()
  })

  it('keeps every heading it produces inside 0-360', () => {
    for (const alpha of [-720, -359, -1, 0, 0.5, 359.5, 360, 719, 1_000]) {
      const heading = headingFromEvent(event({ alpha }))
      expect(heading).not.toBeNull()
      expect(heading as number).toBeGreaterThanOrEqual(0)
      expect(heading as number).toBeLessThan(360)
    }
  })
})

describe('compassNeedsPermission', () => {
  it('does not ask for a permission this platform has never heard of', () => {
    // The build list is explicit: this is an Android app, and the code must not
    // throw on a desktop or anywhere else.
    expect(typeof DeviceOrientationEvent).toBe('undefined')
    expect(compassNeedsPermission()).toBe(false)
  })
})
