import { describe, expect, it } from 'vitest'
import { gpsPinInput, handPinInput, isPlottable, movePinPatch, pendingGpsPin, pendingHandPin, pinInputFor } from './pinWrites'
import type { AveragedFix } from '../gps/position'

const CONTEXT = { siteId: 'site-1', sessionId: 'session-1', foundAt: 1_700_000_000_000 }

function averaged(part: Partial<AveragedFix> = {}): AveragedFix {
  return { lat: 51.123456, lon: -1.654321, accuracy: 4.2, altitudeM: 87.55, heading: 90, scatterM: 1.2, ...part }
}

describe('gpsPinInput (R-FIND-1, R-GPS-3)', () => {
  it('writes the averaged position with a gps source', () => {
    const input = gpsPinInput(averaged(), CONTEXT)
    expect(input.positionSource).toBe('gps')
    expect(input.lat).toBe(51.123456)
    expect(input.lon).toBe(-1.654321)
  })

  it('carries the accuracy and altitude the device reported', () => {
    const input = gpsPinInput(averaged(), CONTEXT)
    expect(input.accuracyM).toBe(4.2)
    expect(input.altitudeM).toBe(87.6)
  })

  it('does not store precision finer than a metre tenth', () => {
    const input = gpsPinInput(averaged({ accuracy: 3.14159, altitudeM: 12.3456 }), CONTEXT)
    expect(input.accuracyM).toBe(3.1)
    expect(input.altitudeM).toBe(12.3)
  })

  it('leaves accuracy unknown when the device never gave one', () => {
    // R-GPS-4: 0 is the schema's "not reported". Making up a number here is how
    // a bad fix ends up looking trustworthy years later.
    const input = gpsPinInput(averaged({ accuracy: 0 }), CONTEXT)
    expect(input.accuracyM).toBe(0)
  })

  it('treats a nonsense figure as unknown rather than storing it', () => {
    for (const bad of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      expect(gpsPinInput(averaged({ accuracy: bad, altitudeM: bad }), CONTEXT).accuracyM).toBe(0)
    }
  })

  it('carries the Site, the Session and the date, which is what the map is filing the Find under', () => {
    const input = gpsPinInput(averaged(), CONTEXT)
    expect(input.siteId).toBe('site-1')
    expect(input.sessionId).toBe('session-1')
    expect(input.foundAt).toBe(1_700_000_000_000)
    expect(input.note).toBe('')
  })

  it('an unassigned Find is allowed, because step 02 has no Site chooser yet', () => {
    const input = gpsPinInput(averaged(), { siteId: '', sessionId: '', foundAt: 1 })
    expect(input.siteId).toBe('')
    expect(input.sessionId).toBe('')
  })
})

describe('handPinInput (R-GPS-4)', () => {
  it('records a hand source and no accuracy figure', () => {
    const input = handPinInput(51.5, -1.5, CONTEXT)
    expect(input.positionSource).toBe('hand')
    expect(input.accuracyM).toBe(0)
    expect(input.altitudeM).toBe(0)
  })

  it('the position is exactly where the user tapped', () => {
    const input = handPinInput(51.5, -1.5, CONTEXT)
    expect(input.lat).toBe(51.5)
    expect(input.lon).toBe(-1.5)
  })
})

describe('movePinPatch (R-EDIT-1)', () => {
  it('a moved Pin becomes a Placed Pin', () => {
    expect(movePinPatch(51.4, -1.4)).toEqual({ lat: 51.4, lon: -1.4, accuracyM: 0, altitudeM: 0, source: 'hand' })
  })

  it('the old accuracy figure does not survive the move', () => {
    // The patch is the only thing the caller can send, so there is no way to
    // leave a GPS accuracy attached to a position a finger chose.
    const patch = movePinPatch(51.4, -1.4)
    expect(patch.accuracyM).toBe(0)
    expect(patch.source).toBe('hand')
  })
})

describe('the Pin the user is asked to confirm (build item 7)', () => {
  const position = {
    lat: 51.123456,
    lon: -1.654321,
    accuracyM: 6.4,
    altitudeM: 92,
    headingDeg: 90,
    speedMps: 0,
    fixTime: 1,
    source: 'gps' as const,
  }

  it('offers the averaged position with its scatter and sample count', () => {
    expect(pendingGpsPin({ position, stale: false, scatterM: 1.8, samples: 7 })).toEqual({
      lat: 51.123456,
      lon: -1.654321,
      source: 'gps',
      accuracyM: 6.4,
      altitudeM: 92,
      scatterM: 1.8,
      samples: 7,
    })
  })

  it('offers nothing before there is a fix, rather than a pin at 0/0', () => {
    expect(pendingGpsPin({ position: null, stale: true, scatterM: null, samples: 0 })).toBeNull()
    expect(pendingGpsPin({ position: { ...position, lat: 0, lon: 0 }, stale: false, scatterM: null, samples: 3 })).toBeNull()
  })

  it('refuses a stale fix, because R-GPS-2 blocks a stale position rather than warning about it', () => {
    expect(pendingGpsPin({ position, stale: true, scatterM: 1.8, samples: 7 })).toBeNull()
  })

  it('still offers a poor accuracy, because R-GPS-4 says a warning must never block a save', () => {
    const pin = pendingGpsPin({ position: { ...position, accuracyM: 41 }, stale: false, scatterM: 12, samples: 5 })
    expect(pin?.accuracyM).toBe(41)
  })

  it('a tapped position is a hand Pin with nothing to claim', () => {
    expect(pendingHandPin(51.5, -1.5)).toEqual({
      lat: 51.5,
      lon: -1.5,
      source: 'hand',
      accuracyM: 0,
      altitudeM: 0,
      scatterM: null,
      samples: 1,
    })
  })

  it('refuses a tap that is not a position', () => {
    expect(pendingHandPin(0, 0)).toBeNull()
    expect(pendingHandPin(Number.NaN, -1)).toBeNull()
  })

  it('the Find written from a confirmed GPS Pin is the position that was on screen', () => {
    const pin = pendingGpsPin({ position, stale: false, scatterM: 1.8, samples: 7 })!
    const input = pinInputFor(pin, CONTEXT)
    expect(input.positionSource).toBe('gps')
    expect(input.lat).toBe(position.lat)
    expect(input.lon).toBe(position.lon)
    expect(input.accuracyM).toBe(6.4)
    expect(input.altitudeM).toBe(92)
  })

  it('the Find written from a confirmed hand Pin carries no accuracy', () => {
    const pin = pendingHandPin(51.5, -1.5)!
    const input = pinInputFor(pin, CONTEXT)
    expect(input.positionSource).toBe('hand')
    expect(input.accuracyM).toBe(0)
    expect(input.altitudeM).toBe(0)
  })
})

describe('isPlottable', () => {
  it('refuses the no-position sentinel', () => {
    expect(isPlottable(0, 0)).toBe(false)
  })

  it('refuses a coordinate off the earth or not a number', () => {
    for (const [lat, lon] of [
      [91, -1],
      [-91, -1],
      [51, 181],
      [51, -181],
      [Number.NaN, -1],
      [51, Number.NaN],
      [Number.POSITIVE_INFINITY, 0],
    ]) {
      expect(isPlottable(lat, lon)).toBe(false)
    }
  })

  it('accepts a real position, including one on the equator or meridian', () => {
    expect(isPlottable(51.1, -1.2)).toBe(true)
    expect(isPlottable(0, 1)).toBe(true)
    expect(isPlottable(1, 0)).toBe(true)
    expect(isPlottable(-90, 180)).toBe(true)
  })
})
