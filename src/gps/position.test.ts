import { describe, expect, it, vi } from 'vitest'
import {
  GpsFeed,
  IDLE_GPS_STATE,
  POOR_ACCURACY_M,
  PositionAverager,
  STALE_AFTER_MS,
  isPoorAccuracy,
  isStale,
  smoothHeading,
  type SatFix,
} from './position'

/** A reading with the parts a phone usually does not report already filled in. */
function fix(part: Partial<SatFix> & { lat: number; lon: number }): SatFix {
  return { altitudeM: 0, accuracy: 10, heading: null, speed: null, fixTime: 1_000, receivedAt: 1_000, ...part }
}

/**
 * R-GPS-3: the app averages a few seconds of readings before it offers a
 * position, because GPS error is roughly random and the mean sits nearer the
 * truth than any one fix. All of it is arithmetic, so it is tested here rather
 * than eyeballed on a walk.
 */
describe('PositionAverager', () => {
  it('is empty to begin with', () => {
    const averager = new PositionAverager()
    expect(averager.count).toBe(0)
    expect(averager.average()).toBeNull()
  })

  it('averages latitude and longitude', () => {
    const averager = new PositionAverager()
    averager.add(fix({ lat: 51.0, lon: -1.0, fixTime: 1_000 }))
    averager.add(fix({ lat: 51.0002, lon: -1.0002, fixTime: 1_500 }))
    const avg = averager.average()
    expect(avg?.lat).toBeCloseTo(51.0001, 9)
    expect(avg?.lon).toBeCloseTo(-1.0001, 9)
    expect(averager.count).toBe(2)
  })

  it('a single reading is its own mean', () => {
    const averager = new PositionAverager()
    averager.add(fix({ lat: 51.123456, lon: -1.654321, fixTime: 1_000 }))
    expect(averager.average()).toEqual({ lat: 51.123456, lon: -1.654321, accuracy: 10, altitudeM: 0, heading: null, scatterM: null })
  })

  it('averages the reported accuracy instead of taking the best or the worst', () => {
    const averager = new PositionAverager()
    averager.add(fix({ lat: 51, lon: -1, accuracy: 4, fixTime: 1_000 }))
    averager.add(fix({ lat: 51, lon: -1, accuracy: 30, fixTime: 1_200 }))
    expect(averager.average()?.accuracy).toBeCloseTo(17, 6)
  })

  it('does not average a missing altitude in as sea level', () => {
    const averager = new PositionAverager()
    averager.add(fix({ lat: 51, lon: -1, altitudeM: 0, fixTime: 1_000 }))
    averager.add(fix({ lat: 51, lon: -1, altitudeM: 100, fixTime: 1_200 }))
    averager.add(fix({ lat: 51, lon: -1, altitudeM: 0, fixTime: 1_400 }))
    expect(averager.average()?.altitudeM).toBeCloseTo(100, 6)
  })

  it('says altitude is unknown when no reading reported one', () => {
    const averager = new PositionAverager()
    averager.add(fix({ lat: 51, lon: -1, fixTime: 1_000 }))
    expect(averager.average()?.altitudeM).toBe(0)
  })

  it('averages heading the circular way, across north', () => {
    const averager = new PositionAverager()
    averager.add(fix({ lat: 51, lon: -1, heading: 350, fixTime: 1_000 }))
    averager.add(fix({ lat: 51, lon: -1, heading: 10, fixTime: 1_200 }))
    expect(averager.average()?.heading).toBeCloseTo(0, 4)
  })

  it('says heading is unknown when nothing reported one', () => {
    const averager = new PositionAverager()
    averager.add(fix({ lat: 51, lon: -1, heading: null, fixTime: 1_000 }))
    expect(averager.average()?.heading).toBeNull()
  })

  it('drops readings older than the window', () => {
    const averager = new PositionAverager(2_000, 6)
    averager.add(fix({ lat: 51.0, lon: -1, fixTime: 1_000 }))
    averager.add(fix({ lat: 51.001, lon: -1, fixTime: 6_000 }))
    expect(averager.count).toBe(1)
    expect(averager.average()?.lat).toBeCloseTo(51.001, 9)
  })

  it('keeps at most maxSamples readings', () => {
    const averager = new PositionAverager(60_000, 3)
    for (let i = 0; i < 10; i += 1) averager.add(fix({ lat: 51 + i / 1_000_000, lon: -1, fixTime: 1_000 + i }))
    expect(averager.count).toBe(3)
    // The last three readings, averaged: 7, 8 and 9 millionths of a degree.
    expect(averager.average()?.lat).toBeCloseTo(51 + 8 / 1_000_000, 9)
  })

  it('a long gap drops the old readings rather than averaging across the walk', () => {
    const averager = new PositionAverager(2_000, 6)
    averager.add(fix({ lat: 51, lon: -1, fixTime: 1_000 }))
    averager.add(fix({ lat: 51.002, lon: -1, fixTime: 90_000 }))
    expect(averager.count).toBe(1)
    expect(averager.average()?.lat).toBeCloseTo(51.002, 9)
  })

  it('forgets everything on reset', () => {
    const averager = new PositionAverager()
    averager.add(fix({ lat: 51, lon: -1 }))
    averager.reset()
    expect(averager.count).toBe(0)
    expect(averager.average()).toBeNull()
  })

  it('the default window is a few seconds of standing still', () => {
    const averager = new PositionAverager()
    for (let i = 0; i < 12; i += 1) averager.add(fix({ lat: 51, lon: -1, fixTime: 1_000 + i * 500 }))
    // 500 ms apart, so the window holds roughly the last four seconds of fixes.
    expect(averager.count).toBeGreaterThanOrEqual(4)
    expect(averager.count).toBeLessThanOrEqual(8)
  })

  it('reports no scatter for a single reading', () => {
    const averager = new PositionAverager()
    averager.add(fix({ lat: 51, lon: -1, fixTime: 1_000 }))
    expect(averager.average()?.scatterM).toBeNull()
  })

  it('scatter is zero when every reading is the same point', () => {
    const averager = new PositionAverager()
    averager.add(fix({ lat: 51, lon: -1, fixTime: 1_000 }))
    averager.add(fix({ lat: 51, lon: -1, fixTime: 1_500 }))
    expect(averager.average()?.scatterM).toBeCloseTo(0, 6)
  })

  it('scatter is the distance the dot wandered, not the distance walked', () => {
    // Two readings 20 m apart: each sits 10 m from the mean, so the scatter the
    // user is being told about is 10 m.
    const averager = new PositionAverager()
    averager.add(fix({ lat: 51.0, lon: -1.0, fixTime: 1_000 }))
    averager.add(fix({ lat: 51.0001809, lon: -1.0, fixTime: 1_500 }))
    expect(averager.average()?.scatterM).toBeCloseTo(10, 0)
  })
})

/**
 * R-MAP-6: the heading wedge and the heading-up rotation have to survive a
 * compass that reads 359 deg and then 1 deg, which is the one way a naive
 * average goes wrong.
 */
describe('smoothHeading', () => {
  it('a first heading is taken as given, normalised into 0-360', () => {
    expect(smoothHeading(null, 90)).toBe(90)
    expect(smoothHeading(null, -90)).toBe(270)
    expect(smoothHeading(null, 450)).toBe(90)
  })

  it('moves towards the new heading rather than snapping to it', () => {
    expect(smoothHeading(0, 90)).toBeCloseTo(27, 6)
  })

  it('takes the short way round north', () => {
    // 350 to 10 is +20 deg, not -340. Getting this wrong spins the map.
    expect(smoothHeading(350, 10)).toBeCloseTo(356, 6)
  })

  it('takes the short way round south too', () => {
    expect(smoothHeading(170, 190)).toBeCloseTo(176, 6)
  })

  it('stays inside 0-360 whatever it is given', () => {
    for (const from of [0, 1, 90, 179, 180, 181, 359, 360]) {
      for (const to of [-720, -1, 0, 0.5, 359, 719, 1_000]) {
        const next = smoothHeading(from, to)
        expect(next).toBeGreaterThanOrEqual(0)
        expect(next).toBeLessThan(360)
      }
    }
  })

  it('a steady reading stays steady', () => {
    let heading = 123
    for (let i = 0; i < 20; i += 1) heading = smoothHeading(heading, 123)
    expect(heading).toBeCloseTo(123, 6)
  })
})

describe('stale and poor accuracy rules (R-GPS-1, R-GPS-2)', () => {
  it('no fix at all is stale', () => {
    expect(isStale(null, 10_000)).toBe(true)
  })

  it('a fix that just arrived is not stale', () => {
    expect(isStale(fix({ lat: 51, lon: -1, fixTime: 10_000 }), 10_500)).toBe(false)
  })

  it('a fix past the ceiling is stale', () => {
    expect(isStale(fix({ lat: 51, lon: -1, fixTime: 10_000 }), 10_000 + STALE_AFTER_MS + 1)).toBe(true)
  })

  it('the stale ceiling is a few seconds, which is what the build list asks for', () => {
    expect(STALE_AFTER_MS).toBeGreaterThanOrEqual(3_000)
    expect(STALE_AFTER_MS).toBeLessThanOrEqual(15_000)
  })

  it('the poor-accuracy ceiling is in metres and warns before logging', () => {
    expect(POOR_ACCURACY_M).toBeGreaterThan(0)
    expect(isPoorAccuracy(POOR_ACCURACY_M)).toBe(false)
    expect(isPoorAccuracy(POOR_ACCURACY_M + 0.1)).toBe(true)
  })

  it('a zero accuracy figure is not "excellent", it is "unknown", and that is a different readout', () => {
    // 0 means the device reported nothing. `isPoorAccuracy` is only the
    // metres-ceiling comparison; saying "accuracy unknown" is the readout's job
    // (src/map/readouts.ts), because a warning that says "25 m" would be a lie.
    expect(isPoorAccuracy(0)).toBe(false)
  })
})

/**
 * The feed itself, as far as it can be tested without a phone: what it says when
 * the platform cannot give a position at all, and what it does with the compass.
 * The watch itself is a phone check (rule 1).
 */
describe('GpsFeed', () => {
  it('says so plainly when the platform has no location support', () => {
    const feed = new GpsFeed()
    expect(feed.isRunning).toBe(false)
    expect(feed.getState()).toEqual(IDLE_GPS_STATE)
    feed.start()
    const state = feed.getState()
    expect(state.status).toBe('unavailable')
    expect(state.message).toContain('location')
    expect(state.position).toBeNull()
    expect(state.stale).toBe(true)
    expect(feed.isRunning).toBe(false)
  })

  it('hands a new subscriber the current state straight away, so a screen never opens blank', () => {
    const feed = new GpsFeed()
    feed.start()
    const seen: string[] = []
    const unsubscribe = feed.subscribe((state) => seen.push(state.status))
    expect(seen).toEqual(['unavailable'])
    unsubscribe()
    feed.start()
    expect(seen).toEqual(['unavailable'])
  })

  it('smooths the compass instead of passing raw readings through', () => {
    const feed = new GpsFeed()
    feed.setHeading(90)
    expect(feed.getHeading()).toBeCloseTo(90, 6)
    feed.setHeading(100)
    expect(feed.getHeading()).toBeCloseTo(93, 6)
  })

  it('has no heading to report until the compass says something', () => {
    const feed = new GpsFeed()
    expect(feed.getHeading()).toBeNull()
    feed.setHeading(null)
    expect(feed.getHeading()).toBeNull()
  })

  it('forgets a compass that stopped reporting, rather than pointing the map the last way it heard', () => {
    vi.useFakeTimers()
    try {
      const feed = new GpsFeed()
      feed.setHeading(90)
      expect(feed.getHeading()).not.toBeNull()
      vi.advanceTimersByTime(16_000)
      expect(feed.getHeading()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resetHistory drops the averaged window, so a walk to a new spot is not averaged with the old one', () => {
    const feed = new GpsFeed()
    feed.resetHistory()
    expect(feed.getState().samples).toBe(0)
  })
})
