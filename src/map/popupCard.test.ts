import { describe, expect, it } from 'vitest'
import type { Find } from '../db/types'
import { MISS_LABEL, NO_SITE_LABEL, distanceToFind, isPlotted, popupCardFor } from './popupCard'

function find(part: Partial<Find> = {}): Find {
  return {
    id: 'find-1',
    foundAt: Date.UTC(2026, 9, 20, 12, 0, 0),
    siteId: 'site-1',
    sessionId: '',
    lat: 51.0,
    lon: -1.0,
    altitudeM: 0,
    accuracyM: 0,
    positionSource: 'hand',
    note: '',
    categoryId: '',
    itemCount: 0,
    photoCount: 0,
    needsDetail: 1,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: 0,
    cascadeDeletedFrom: '',
    ...part,
  }
}

const HERE = { lat: 51.0, lon: -1.0 }

describe('distanceToFind (R-MAP-2)', () => {
  it('is null when there is no fix to measure from', () => {
    expect(distanceToFind(find(), null)).toBeNull()
  })

  it('is zero when the user is standing on the Pin', () => {
    expect(distanceToFind(find({ lat: 51, lon: -1 }), HERE)).toBeCloseTo(0, 6)
  })

  it('matches a hand-computed figure: 0.001 degrees of latitude is 111.2 m', () => {
    const metres = distanceToFind(find({ lat: 51.001, lon: -1 }), HERE)
    expect(metres).not.toBeNull()
    expect(metres as number).toBeCloseTo(111.195, 1)
  })

  it('accounts for longitude shrinking with latitude', () => {
    // The same 0.001 degrees of east-west separation is shorter ground the
    // further north it is: 70 m at 51N, 56 m at 60N.
    const atHome = distanceToFind(find({ lat: 51, lon: -0.999 }), HERE) as number
    const atSixty = distanceToFind(find({ lat: 60, lon: -0.999 }), { lat: 60, lon: -1 }) as number
    expect(atHome).toBeCloseTo(70, 0)
    expect(atSixty).toBeCloseTo(56, 0)
    expect(atSixty).toBeLessThan(atHome)
  })

  it('refuses to measure to a Find with no position', () => {
    expect(distanceToFind(find({ lat: 0, lon: 0 }), HERE)).toBeNull()
  })
})

describe('isPlotted', () => {
  it('treats the 0/0 sentinel as no position', () => {
    expect(isPlotted({ lat: 0, lon: 0 })).toBe(false)
    expect(isPlotted({ lat: 51, lon: 0 })).toBe(true)
    expect(isPlotted({ lat: 0, lon: -1 })).toBe(true)
  })
})

describe('popupCardFor (R-MAP-2)', () => {
  it('shows the user note as the title, and a plain word when there is no note', () => {
    expect(popupCardFor(find({ note: 'Silver penny, ploughed' }), { siteName: 'Home', from: HERE }).title).toBe('Silver penny, ploughed')
    expect(popupCardFor(find(), { siteName: 'Home', from: HERE }).title).toBe(MISS_LABEL)
    expect(popupCardFor(find({ note: '   ' }), { siteName: 'Home', from: HERE }).title).toBe(MISS_LABEL)
    expect(popupCardFor(find({ itemCount: 2, categoryId: 'coin' }), { siteName: 'Home', from: HERE }).title).toBe('Find')
  })

  it('names a Find with no Items a Miss', () => {
    expect(popupCardFor(find(), { siteName: 'Home', from: HERE }).categoryLabel).toBe(MISS_LABEL)
    expect(popupCardFor(find({ categoryId: 'coin' }), { siteName: 'Home', from: HERE }).categoryLabel).toBe('coin')
  })

  it('shows Date On as a calendar day', () => {
    expect(popupCardFor(find({ foundAt: Date.UTC(2026, 9, 20, 12) }), { siteName: 'Home', from: HERE }).dayOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('says No Site rather than showing a blank', () => {
    expect(popupCardFor(find(), { siteName: '', from: HERE }).siteName).toBe(NO_SITE_LABEL)
  })

  it('quotes the distance in imperial, against a figure you can check by hand', () => {
    const card = popupCardFor(find({ lat: 51.001, lon: -1 }), { siteName: 'Home', from: HERE })
    // 111.2 m is 365 ft.
    expect(card.distanceLabel).toBe('365 ft')
  })

  it('switches to miles past a mile', () => {
    const card = popupCardFor(find({ lat: 51.018, lon: -1 }), { siteName: 'Home', from: HERE })
    expect(card.distanceLabel).toContain('mi')
  })

  it('says here rather than 0 ft when the user is standing on the Pin', () => {
    expect(popupCardFor(find(), { siteName: 'Home', from: HERE }).distanceLabel).toBe('here')
  })

  it('shows no distance at all when there is no fix, rather than a wrong one', () => {
    expect(popupCardFor(find(), { siteName: 'Home', from: null }).distanceLabel).toBe('')
  })

  it('shows the accuracy figure for a GPS Pin', () => {
    const card = popupCardFor(find({ positionSource: 'gps', accuracyM: 4.2 }), { siteName: 'Home', from: HERE })
    expect(card.accuracyLabel).toBe('±4.2 m')
    expect(card.positionSourceLabel).toBe('GPS')
  })

  it('shows no accuracy figure for a hand-placed Pin (criterion 5)', () => {
    const card = popupCardFor(find({ positionSource: 'hand', accuracyM: 0 }), { siteName: 'Home', from: HERE })
    expect(card.accuracyLabel).toBe('')
    expect(card.positionSourceLabel).toBe('Placed by hand')
  })

  it('prints whatever accuracy figure is on the record, because clearing it is the move pin rule, not the card', () => {
    // `movePinPatch` in pinWrites.ts is what guarantees a hand Pin has no
    // accuracy to print. The card only reports what it is shown, so a stray
    // number here means the write went wrong, and hiding it would hide the bug.
    expect(popupCardFor(find({ positionSource: 'hand', accuracyM: 12 }), { siteName: 'Home', from: HERE }).accuracyLabel).toBe('±12 m')
  })

  it('links to the Find', () => {
    expect(popupCardFor(find({ id: 'abc' }), { siteName: 'Home', from: HERE }).openPath).toBe('/finds/abc')
  })

  it('has no thumbnail until step 03 puts photos on a Find', () => {
    expect(popupCardFor(find(), { siteName: 'Home', from: HERE }).photoId).toBeNull()
    expect(popupCardFor(find(), { siteName: 'Home', from: HERE, photoId: 'p1' }).photoId).toBe('p1')
  })

  it('gives coordinates precise enough to compare against a mock location app', () => {
    expect(popupCardFor(find({ lat: 51.123456, lon: -1.654321 }), { siteName: 'Home', from: HERE }).coordLabel).toBe('51.123456, -1.654321')
  })
})
