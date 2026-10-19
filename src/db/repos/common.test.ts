import { describe, expect, it } from 'vitest'
import { UNASSIGNED, type Find, type Item } from '../types'
import {
  computeNeedsDetail,
  deriveFromItems,
  findCategoryId,
  mostSignificantItem,
  needsDetailFor,
} from './common'

/**
 * The derived fields on a Find (`itemCount`, `categoryId`, `needsDetail`) are the
 * reason pin colours and the Needs Detail queue are index scans rather than joins,
 * so the rules that produce them are worth pinning down on their own.
 */

function item(overrides: Partial<Item> & { id: string }): Item {
  return {
    findId: 'find-1',
    categoryId: '',
    subType: '',
    tags: [],
    note: '',
    country: '',
    ruler: '',
    mintMark: '',
    denomination: '',
    composition: '',
    material: '',
    isSilver: 'unknown',
    isGold: 'unknown',
    dateOnYear: 0,
    dateOnText: '',
    weightG: 0,
    depthM: 0,
    lengthMm: 0,
    widthMm: 0,
    thicknessMm: 0,
    condition: '',
    cleaningNotes: '',
    isIdentified: false,
    identificationNotes: '',
    photoCount: 0,
    createdAt: 100,
    updatedAt: 100,
    deletedAt: 0,
    cascadeDeletedFrom: '',
    ...overrides,
  }
}

function find(overrides: Partial<Find> = {}): Find {
  return {
    id: 'find-1',
    foundAt: 1_000,
    siteId: UNASSIGNED,
    sessionId: UNASSIGNED,
    categoryId: UNASSIGNED,
    lat: 39,
    lon: -98,
    altitudeM: 0,
    accuracyM: 0,
    positionSource: 'gps',
    note: '',
    photoCount: 0,
    itemCount: 0,
    needsDetail: 1,
    createdAt: 100,
    updatedAt: 100,
    deletedAt: 0,
    cascadeDeletedFrom: '',
    ...overrides,
  }
}

describe('needsDetailFor / computeNeedsDetail', () => {
  it('is true for a field log that is only a position and a time', () => {
    expect(needsDetailFor('', 0)).toBe(1)
  })

  it('is false once anything has been written about the Find', () => {
    expect(needsDetailFor('Roman sestertius, near the fence line', 0)).toBe(0)
  })

  it('is false once anything has been recovered from it', () => {
    expect(needsDetailFor('', 3)).toBe(0)
  })

  it('is false when both are present, and true when both are empty', () => {
    expect(needsDetailFor('note', 1)).toBe(0)
    expect(computeNeedsDetail({ note: '', itemCount: 0 })).toBe(1)
    expect(computeNeedsDetail({ note: 'x', itemCount: 0 })).toBe(0)
    expect(computeNeedsDetail({ note: '', itemCount: 1 })).toBe(0)
  })

  it('treats whitespace as nothing written', () => {
    expect(needsDetailFor('   \n\t ', 0)).toBe(1)
  })
})

describe('mostSignificantItem', () => {
  it('is null when there is nothing to choose from', () => {
    expect(mostSignificantItem([])).toBeNull()
  })

  it('prefers silver over everything unmarked', () => {
    const plain = item({ id: 'plain', categoryId: 'coin' })
    const silver = item({ id: 'silver', categoryId: 'button', isSilver: 'yes' })
    expect(mostSignificantItem([plain, silver])?.id).toBe('silver')
  })

  it('prefers gold, and prefers a precious metal over an unknown category', () => {
    const unknown = item({ id: 'unknown-cat', categoryId: 'unknown' })
    const gold = item({ id: 'gold', categoryId: '', isGold: 'yes' })
    expect(mostSignificantItem([unknown, gold])?.id).toBe('gold')
  })

  it('prefers a named category over unknown and unclassified', () => {
    const unknown = item({ id: 'unknown', categoryId: 'unknown' })
    const blank = item({ id: 'blank', categoryId: '' })
    const buckle = item({ id: 'buckle', categoryId: 'buckle' })
    expect(mostSignificantItem([unknown, blank, buckle])?.id).toBe('buckle')
  })

  it('breaks a tie between equally named categories by earliest createdAt, then id', () => {
    const later = item({ id: 'b', categoryId: 'coin', createdAt: 300 })
    const earlier = item({ id: 'a', categoryId: 'coin', createdAt: 200 })
    expect(mostSignificantItem([later, earlier])?.id).toBe('a')

    const sameAgeB = item({ id: 'b', categoryId: 'coin', createdAt: 200 })
    const sameAgeA = item({ id: 'a', categoryId: 'coin', createdAt: 200 })
    expect(mostSignificantItem([sameAgeB, sameAgeA])?.id).toBe('a')
  })

  it('is deterministic regardless of the order the Items arrive in', () => {
    const items = [
      item({ id: 'scrap', categoryId: 'scrap', createdAt: 5 }),
      item({ id: 'silver-coin', categoryId: 'coin', isSilver: 'yes', createdAt: 9 }),
      item({ id: 'unknown', categoryId: 'unknown', createdAt: 1 }),
      item({ id: 'silver-button', categoryId: 'button', isSilver: 'yes', createdAt: 2 }),
    ]
    const forward = mostSignificantItem(items)?.id
    const backward = mostSignificantItem([...items].reverse())?.id
    expect(forward).toBe('silver-button')
    expect(backward).toBe(forward)
  })
})

describe('findCategoryId', () => {
  it('is the empty sentinel for a Miss', () => {
    expect(findCategoryId([])).toBe(UNASSIGNED)
  })

  it('is the empty sentinel when no category has been chosen at all', () => {
    expect(findCategoryId([item({ id: 'a', categoryId: '' })])).toBe(UNASSIGNED)
  })

  /**
   * `unknown` is a choice the user makes from the Category list, not the absence
   * of one, so it has to survive onto the Find — otherwise the pin would be
   * coloured as if nothing had been classified.
   */
  it('keeps unknown when that is what was actually chosen', () => {
    expect(findCategoryId([item({ id: 'a', categoryId: 'unknown' })])).toBe('unknown')
  })
})

describe('deriveFromItems', () => {
  it('turns a Find with nothing in it into a Miss that still needs detail', () => {
    const derived = deriveFromItems(find(), [])
    expect(derived.itemCount).toBe(0)
    expect(derived.categoryId).toBe(UNASSIGNED)
    expect(derived.needsDetail).toBe(1)
  })

  it('carries the count, the category and the flag together', () => {
    const items = [
      item({ id: 'a', categoryId: 'coin', isSilver: 'yes' }),
      item({ id: 'b', categoryId: 'scrap' }),
    ]
    const derived = deriveFromItems(find({ note: '' }), items)
    expect(derived.itemCount).toBe(2)
    expect(derived.categoryId).toBe('coin')
    // Items exist, so the Find is no longer waiting on detail even with no note.
    expect(derived.needsDetail).toBe(0)
  })

  it('keeps a note the Find already has when re-deriving', () => {
    const derived = deriveFromItems(find({ note: 'deep under the plough pan' }), [])
    expect(derived.note).toBe('deep under the plough pan')
    expect(derived.needsDetail).toBe(0)
  })

  it('never invents a Miss flag: a Miss is a Find with zero Items', () => {
    const derived = deriveFromItems(find(), [])
    expect('isMiss' in derived).toBe(false)
    expect('miss' in derived).toBe(false)
  })

  /**
   * R-EDIT-2: the Bin takes a Find and its Items down together, and it is the
   * Find that comes back. If the cascade counted as a deletion here, a Find in
   * the Bin would be labelled "Miss" beside the three Items sitting under it, and
   * restoring it would return a log that claims nothing was recovered.
   */
  it('counts Items the Bin took down with the Find', () => {
    const carried = item({ id: 'carried', categoryId: 'coin', deletedAt: 500, cascadeDeletedFrom: 'find-1' })
    const derived = deriveFromItems(find({ deletedAt: 500 }), [carried])
    expect(derived.itemCount).toBe(1)
    expect(derived.categoryId).toBe('coin')
    expect(derived.needsDetail).toBe(0)
  })

  /** The other half of the rule: an Item the user binned on its own has stopped describing the Find. */
  it('becomes a Miss when the only Item was binned in its own right', () => {
    const byHand = item({ id: 'by-hand', categoryId: 'coin', deletedAt: 500 })
    const derived = deriveFromItems(find(), [byHand])
    expect(derived.itemCount).toBe(0)
    expect(derived.categoryId).toBe(UNASSIGNED)
    expect(derived.needsDetail).toBe(1)
  })
})
