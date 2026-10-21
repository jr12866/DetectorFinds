import { describe, expect, it } from 'vitest'
import { POOR_ACCURACY_M } from '../gps/position'
import {
  averagingAdvice,
  accuracyAdvice,
  accuracyKnown,
  accuracyText,
  coordText,
  dayText,
  distanceText,
  fixAgeText,
  scatterText,
  STANDING_SPEED_MPS,
} from './readouts'

/**
 * R-GPS-2: the accuracy figure is on screen at all times, and the warning past
 * the threshold is an offer to wait rather than a block. Both halves of that
 * sentence are decisions, so they are tested rather than watched for.
 */
describe('accuracyText (R-GPS-1)', () => {
  it('quotes the figure in metres, which is what the database holds', () => {
    expect(accuracyText(4.2)).toBe('±4.2 m')
    expect(accuracyText(18.4)).toBe('±18 m')
    expect(accuracyText(120)).toBe('±120 m')
  })

  it('is blank when there is no figure, rather than saying zero metres', () => {
    expect(accuracyText(0)).toBe('')
    expect(accuracyText(Number.NaN)).toBe('')
    expect(accuracyKnown(0)).toBe(false)
    expect(accuracyKnown(1)).toBe(true)
  })
})

describe('accuracyAdvice (R-GPS-2)', () => {
  it('says nothing when the fix is good', () => {
    const advice = accuracyAdvice(4, false)
    expect(advice.level).toBe('ok')
    expect(advice.text).toBe('')
    expect(advice.offerWait).toBe(false)
  })

  it('warns past the accuracy ceiling and quotes the ceiling it is using', () => {
    const advice = accuracyAdvice(POOR_ACCURACY_M + 5, false)
    expect(advice.level).toBe('warn')
    expect(advice.text).toContain(String(POOR_ACCURACY_M))
    expect(advice.offerWait).toBe(true)
  })

  it('warns about a stale fix even when the accuracy figure looks fine', () => {
    // A 3 m circle from a fix taken two minutes ago is not where the user is
    // standing, and a good-looking number would otherwise hide that.
    const advice = accuracyAdvice(3, true)
    expect(advice.level).toBe('warn')
    expect(advice.text.toLowerCase()).toContain('stale')
  })

  it('says the figure is unknown instead of inventing one', () => {
    const advice = accuracyAdvice(0, false)
    expect(advice.level).toBe('unknown')
    expect(advice.text).toContain('No accuracy figure')
  })

  it('never blocks: whatever the fix looks like, the advice is advice', () => {
    for (const accuracy of [0, 4, POOR_ACCURACY_M + 100]) {
      for (const stale of [false, true]) {
        const advice = accuracyAdvice(accuracy, stale)
        expect(advice.text).not.toContain('cannot')
        expect(advice.text).not.toContain('Cannot')
        expect(['ok', 'warn', 'unknown']).toContain(advice.level)
      }
    }
    // Everything short of "good" offers the chance to wait for a better fix.
    expect(accuracyAdvice(0, false).offerWait).toBe(true)
    expect(accuracyAdvice(POOR_ACCURACY_M + 1, false).offerWait).toBe(true)
    expect(accuracyAdvice(4, true).offerWait).toBe(true)
    expect(accuracyAdvice(4, false).offerWait).toBe(false)
  })
})

describe('fixAgeText (R-GPS-1)', () => {
  it('calls a fresh fix just now', () => {
    expect(fixAgeText(0)).toBe('just now')
    expect(fixAgeText(1_900)).toBe('just now')
  })

  it('counts whole seconds up to a minute', () => {
    expect(fixAgeText(3_000)).toBe('3 s ago')
    expect(fixAgeText(59_000)).toBe('59 s ago')
  })

  it('counts minutes, then hours, because a stale fix in a field is a long one', () => {
    expect(fixAgeText(120_000)).toBe('2 min ago')
    expect(fixAgeText(3_600_000 * 2)).toBe('2 h ago')
  })

  it('says unknown rather than a negative age', () => {
    expect(fixAgeText(-5_000)).toBe('unknown')
    expect(fixAgeText(Number.NaN)).toBe('unknown')
  })
})

describe('distanceText (R-MAP-2)', () => {
  it('is blank with nothing to measure from', () => {
    expect(distanceText(null)).toBe('')
  })

  it('says here when the user is standing on the Pin', () => {
    expect(distanceText(0.4)).toBe('here')
  })

  it('uses the app-wide imperial formatting above that', () => {
    expect(distanceText(111.195)).toBe('365 ft')
    expect(distanceText(2_000)).toBe('1.24 mi')
  })
})

describe('dayText and coordText', () => {
  it('writes Date On as a year-month-day local calendar day', () => {
    const at = new Date(2026, 9, 20, 23, 59).getTime()
    expect(dayText(at)).toBe('2026-10-20')
    // A month or day under ten still gets two digits, so the string sorts.
    expect(dayText(new Date(2026, 0, 5, 12).getTime())).toBe('2026-01-05')
  })

  it('is blank for a date the record does not have', () => {
    expect(dayText(0)).toBe('')
    expect(dayText(Number.NaN)).toBe('')
  })

  it('quotes coordinates to six decimal places', () => {
    expect(coordText(51.123456, -1.654321)).toBe('51.123456, -1.654321')
    expect(coordText(51, -1)).toBe('51.000000, -1.000000')
  })
})

describe('scatterText (R-GPS-3)', () => {
  it('is blank when there is nothing to report', () => {
    expect(scatterText(null)).toBe('')
    expect(scatterText(Number.NaN)).toBe('')
  })

  it('shows the spread the user waited for', () => {
    expect(scatterText(1.234)).toBe('spread 1.2 m')
    expect(scatterText(14.6)).toBe('spread 15 m')
  })
})

describe('averagingAdvice (R-GPS-3)', () => {
  it('says to wait when there is no fix at all', () => {
    expect(averagingAdvice(0, null, 0)).toContain('No fix yet')
  })

  it('says so when the user is walking rather than standing', () => {
    expect(averagingAdvice(8, 2, 1.6)).toContain('moving')
  })

  it('says so when too few fixes have arrived to average yet', () => {
    expect(averagingAdvice(2, null, 0)).toContain('Still collecting')
  })

  it('says so when standing-still fixes refuse to settle', () => {
    const advice = averagingAdvice(10, POOR_ACCURACY_M + 12, 0)
    expect(advice).toContain('not settled')
    // R-GPS-3 wants the scatter shown, not just hinted at.
    expect(advice).toContain('spread')
  })

  it('says nothing when the position is good, because silence is the pass signal', () => {
    expect(averagingAdvice(10, 1.4, 0)).toBe('')
    expect(averagingAdvice(4, null, 0)).toBe('')
  })

  it('never tells the user they cannot log (R-GPS-2)', () => {
    for (const [samples, scatter, speed] of [
      [0, null, 0],
      [2, null, 0],
      [8, 2, 3],
      [10, 400, 0],
    ] as const) {
      const advice = averagingAdvice(samples, scatter, speed)
      expect(advice).not.toContain('cannot')
      expect(advice).not.toContain('Cannot')
      expect(advice).not.toContain('blocked')
    }
  })

  it('the standing threshold is above shifting-weight noise and below a walk', () => {
    expect(STANDING_SPEED_MPS).toBeGreaterThan(0.3)
    expect(STANDING_SPEED_MPS).toBeLessThan(1.5)
  })
})
