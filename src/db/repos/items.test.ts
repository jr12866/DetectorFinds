import 'fake-indexeddb/auto'
import { afterAll, describe, expect, it } from 'vitest'
import { NotFoundError } from '../errors'
import { DAY, T0, makeRepos } from './testHelpers'

const setups: Array<() => void> = []
const setup = (name: string) => {
  const h = makeRepos(name)
  setups.push(h.close)
  return h
}

afterAll(() => setups.forEach((close) => close()))

describe('items.create', () => {
  const { repos, setNow, now } = setup('items-create')

  it('refuses an Item with no Find, because an orphan has nowhere to be shown', async () => {
    await expect(repos.items.create('no-such-find')).rejects.toThrow(NotFoundError)
  })

  it('starts every optional field at its empty value, so "not recorded" is one shape', async () => {
    const find = await repos.finds.create()
    const item = await repos.items.create(find.id)
    expect(item.categoryId).toBe('')
    expect(item.subType).toBe('')
    expect(item.tags).toEqual([])
    expect(item.isSilver).toBe('unknown')
    expect(item.isGold).toBe('unknown')
    expect(item.dateOnYear).toBe(0)
    expect(item.weightG).toBe(0)
    expect(item.depthM).toBe(0)
    expect(item.photoCount).toBe(0)
    expect(item.deletedAt).toBe(0)
  })

  it('takes the clock it is given and never invents a Find id', async () => {
    setNow(T0)
    const find = await repos.finds.create()
    const item = await repos.items.create(find.id, { categoryId: 'coin' })
    expect(item.findId).toBe(find.id)
    expect(item.createdAt).toBe(T0)
    expect(item.updatedAt).toBe(now())
  })
})

describe('items and their Find stay derived', () => {
  const { repos } = setup('items-derive')

  it('adding the first Item takes the Find out of Needs Detail', async () => {
    const find = await repos.finds.create({ note: '' })
    expect(find.needsDetail).toBe(1)
    await repos.items.create(find.id, { categoryId: 'coin', note: 'copper penny' })
    const after = await repos.finds.get(find.id)
    expect(after?.itemCount).toBe(1)
    expect(after?.needsDetail).toBe(0)
    expect(after?.categoryId).toBe('coin')
  })

  it('binning the last Item turns the Find into a Miss rather than deleting it (R-EDIT-4)', async () => {
    const find = await repos.finds.create({ note: 'silver ring found at the fence line' })
    const item = await repos.items.create(find.id, { categoryId: 'jewellery', isSilver: 'yes' })
    await repos.items.softDelete(item.id)

    const after = await repos.finds.get(find.id)
    expect(after).toBeTruthy()
    expect(after?.itemCount).toBe(0)
    expect(after?.categoryId).toBe('')
    // the note is what makes this a finished Miss, so it must not be flagged
    expect(after?.needsDetail).toBe(0)
  })

  it('an Item binned on its own is not resurrected when the Find is binned and restored', async () => {
    const find = await repos.finds.create()
    const own = await repos.items.create(find.id, { categoryId: 'coin' })
    const kept = await repos.items.create(find.id, { categoryId: 'button' })
    await repos.items.softDelete(own.id)
    const binned = await repos.items.get(own.id)
    expect(binned?.cascadeDeletedFrom).toBe('')

    await repos.finds.softDelete(find.id)
    await repos.finds.restore(find.id)

    expect((await repos.items.get(own.id))?.deletedAt).toBeGreaterThan(0)
    expect((await repos.items.get(kept.id))?.deletedAt).toBe(0)
    expect((await repos.finds.get(find.id))?.itemCount).toBe(1)
  })

  it('re-filing an Item re-derives both Finds (R-EDIT-1)', async () => {
    const empty = await repos.finds.create({ note: '' })
    const donor = await repos.finds.create({ note: '' })
    const item = await repos.items.create(donor.id, { categoryId: 'coin', isSilver: 'yes' })

    const moved = await repos.items.moveToFind(item.id, empty.id)
    expect(moved?.findId).toBe(empty.id)
    expect((await repos.finds.get(empty.id))?.itemCount).toBe(1)
    expect((await repos.finds.get(donor.id))?.itemCount).toBe(0)
    // the Find that lost its only Item is now a bare field log again
    expect((await repos.finds.get(donor.id))?.needsDetail).toBe(1)
  })

  it('re-filing to an unknown Find is refused', async () => {
    const find = await repos.finds.create()
    const item = await repos.items.create(find.id)
    await expect(repos.items.moveToFind(item.id, 'no-such-find')).rejects.toThrow(NotFoundError)
  })

  it('re-filing a missing Item is a no-op', async () => {
    const find = await repos.finds.create()
    expect(await repos.items.moveToFind('no-such-item', find.id)).toBeUndefined()
  })
})

describe('items.forFind / allLive / countLive', () => {
  const { repos, setNow } = setup('items-read')

  it('lists live Items oldest first and hides binned ones', async () => {
    const find = await repos.finds.create()
    setNow(T0)
    const first = await repos.items.create(find.id, { note: 'first' })
    setNow(T0 + 60_000)
    const second = await repos.items.create(find.id, { note: 'second' })
    setNow(T0 + 120_000)
    const third = await repos.items.create(find.id, { note: 'third' })
    await repos.items.softDelete(third.id)

    const listed = await repos.items.forFind(find.id)
    expect(listed.map((i) => i.id)).toEqual([first.id, second.id])
    expect(await repos.items.countLive()).toBe(2)
    expect((await repos.items.allLive()).length).toBe(2)
  })

  it('update returns undefined for an unknown id instead of throwing', async () => {
    expect(await repos.items.update('no-such-item', { note: 'x' })).toBeUndefined()
  })

  it('update keeps the id, the Find and the creation time no matter what the patch says', async () => {
    const find = await repos.finds.create()
    setNow(T0)
    const item = await repos.items.create(find.id, { note: 'one' })
    setNow(T0 + DAY)
    const patched = await repos.items.update(
      item.id,
      // a patch that tries to move the Item sideways must not be able to
      { note: 'two', findId: 'other', id: 'other' } as unknown as Parameters<typeof repos.items.update>[1],
    )
    expect(patched?.note).toBe('two')
    expect(patched?.id).toBe(item.id)
    expect(patched?.findId).toBe(find.id)
    expect(patched?.createdAt).toBe(T0)
    expect(patched?.updatedAt).toBe(T0 + DAY)
  })

  it('restore brings an Item back and re-derives the Find', async () => {
    const find = await repos.finds.create({ note: '' })
    const item = await repos.items.create(find.id, { categoryId: 'coin' })
    await repos.items.softDelete(item.id)
    expect((await repos.finds.get(find.id))?.needsDetail).toBe(1)
    await repos.items.restore(item.id)
    expect((await repos.items.get(item.id))?.deletedAt).toBe(0)
    expect((await repos.finds.get(find.id))?.needsDetail).toBe(0)
  })
})

describe('items.purge', () => {
  const { repos } = setup('items-purge')

  it('destroys the Item and its photos and leaves tombstones for both', async () => {
    const find = await repos.finds.create()
    const item = await repos.items.create(find.id, { categoryId: 'coin' })
    const photo = await repos.photos.add({ ownerKind: 'item', ownerId: item.id, full: new Blob(['x']) })

    await repos.items.purge(item.id)

    expect(await repos.items.get(item.id)).toBeUndefined()
    expect(await repos.photos.get(photo.id)).toBeUndefined()
    expect(await repos.photos.blob(photo.id)).toBeUndefined()
    const marks = await repos.db.tombstones.toArray()
    expect(marks.map((t) => `${t.store}:${t.id}`).sort()).toEqual(
      [`items:${item.id}`, `photos:${photo.id}`].sort(),
    )
  })

  it('leaves the Find behind as a Miss', async () => {
    const find = await repos.finds.create({ note: 'one silver coin, no photo' })
    const item = await repos.items.create(find.id, { categoryId: 'coin', isSilver: 'yes' })
    await repos.items.purge(item.id)
    expect((await repos.finds.get(find.id))?.itemCount).toBe(0)
  })
})

describe('items queries used by the filter sheet', () => {
  // Each test opens its own database: these queries are store-wide, so rows left
  // behind by a sibling test would answer for it.
  it('filters silver and gold separately, and unknown is not yes (R-ITEM-3)', async () => {
    const { repos } = setup('items-metal')
    const find = await repos.finds.create()
    const silver = await repos.items.create(find.id, { categoryId: 'coin', isSilver: 'yes', isGold: 'no' })
    await repos.items.create(find.id, { categoryId: 'coin', isSilver: 'no', isGold: 'yes' })
    await repos.items.create(find.id, { categoryId: 'scrap' })

    const silverItems = await repos.items.byMetal('isSilver')
    expect(silverItems.map((i) => i.id)).toEqual([silver.id])
    expect((await repos.items.byMetal('isGold')).length).toBe(1)
    expect((await repos.items.byMetal('isSilver', 'unknown')).length).toBe(1)
  })

  it('shows live Items for the same queries', async () => {
    const { repos } = setup('items-text-queries')
    const find = await repos.finds.create()
    await repos.items.create(find.id, { categoryId: 'buckle', subType: 'buckle frame', material: 'brass', tags: ['wet'] })
    expect((await repos.items.byCategory('buckle')).length).toBe(1)
    expect((await repos.items.bySubType('buckle frame')).length).toBe(1)
    expect((await repos.items.byMaterial('brass')).length).toBe(1)
    expect((await repos.items.taggedWith('wet')).length).toBe(1)
  })

  it('hides binned Items from every query', async () => {
    const { repos } = setup('items-hidden')
    const find = await repos.finds.create()
    const item = await repos.items.create(find.id, {
      categoryId: 'buckle',
      subType: 'belt buckle',
      material: 'iron',
      tags: ['mud'],
    })
    await repos.items.softDelete(item.id)
    expect(await repos.items.byCategory('buckle')).toEqual([])
    expect(await repos.items.bySubType('belt buckle')).toEqual([])
    expect(await repos.items.byMaterial('iron')).toEqual([])
    expect(await repos.items.taggedWith('mud')).toEqual([])
    expect(await repos.items.countLive()).toBe(0)
    expect(await repos.items.allLive()).toEqual([])
  })

  it('never matches Date On year 0 against a range (R-ITEM-6)', async () => {
    const { repos } = setup('items-dateon')
    const find = await repos.finds.create()
    const known = await repos.items.create(find.id, { dateOnYear: 1864 })
    await repos.items.create(find.id, { dateOnYear: 0, dateOnText: 'c. 1900' })
    const hits = await repos.items.dateOnBetween(1800, 1900)
    expect(hits.map((i) => i.id)).toEqual([known.id])
  })

  it('includes both years of a Date On range, because they are typed into two boxes', async () => {
    const { repos } = setup('items-dateon-ends')
    const find = await repos.finds.create()
    const from = await repos.items.create(find.id, { dateOnYear: 1700 })
    const middle = await repos.items.create(find.id, { dateOnYear: 1864 })
    const to = await repos.items.create(find.id, { dateOnYear: 1800 })

    // Index order, so ascending by year, and both boundary rows are present.
    expect((await repos.items.dateOnBetween(1700, 1800)).map((i) => i.id)).toEqual([from.id, to.id])
    // A one-year range is what "this coin only" looks like in the filter screen.
    expect((await repos.items.dateOnBetween(1864, 1864)).map((i) => i.id)).toEqual([middle.id])
  })

  it('categoryOf answers with the pin colour, and a Miss has none', async () => {
    const { repos } = setup('items-category-of')
    const miss = await repos.finds.create()
    expect(await repos.items.categoryOf(miss.id)).toBe('')

    const withItems = await repos.finds.create()
    await repos.items.create(withItems.id, { categoryId: 'unknown' })
    await repos.items.create(withItems.id, { categoryId: 'coin', isSilver: 'yes' })
    expect(await repos.items.categoryOf(withItems.id)).toBe('coin')
  })

  /**
   * The popup card reads this, the map reads `Find.categoryId`. If the two used
   * different rules about the Bin, a binned Find would be coloured "Miss" in one
   * place and "coin" in the other.
   */
  it('categoryOf names the same category for a binned Find as the Find itself stores', async () => {
    const { repos } = setup('items-category-of-binned')
    const find = await repos.finds.create()
    await repos.items.create(find.id, { categoryId: 'coin' })
    await repos.finds.softDelete(find.id)

    expect((await repos.finds.get(find.id))?.categoryId).toBe('coin')
    expect(await repos.items.categoryOf(find.id)).toBe('coin')
  })
})

describe('items.distinct, the picker source', () => {
  it('lists the values a picker should offer, sorted and without blanks', async () => {
    const { repos } = setup('items-distinct')
    const a = await repos.finds.create()
    await repos.items.create(a.id, { categoryId: 'coin', subType: 'penny', material: 'copper' })
    await repos.items.create(a.id, { categoryId: 'coin', subType: 'farthing' })
    await repos.items.create(a.id, { categoryId: '', subType: '', material: '' })
    expect(await repos.items.distinct('categoryId')).toEqual(['coin'])
    expect(await repos.items.distinct('subType')).toEqual(['farthing', 'penny'])
    expect(await repos.items.distinct('material')).toEqual(['copper'])
  })

  it('leaves binned Items out of the picker', async () => {
    const { repos } = setup('items-distinct-binned')
    const a = await repos.finds.create()
    const item = await repos.items.create(a.id, { categoryId: 'toy', subType: 'spinning top', material: 'lead' })
    await repos.items.softDelete(item.id)
    expect(await repos.items.distinct('categoryId')).toEqual([])
    expect(await repos.items.distinct('subType')).toEqual([])
    expect(await repos.items.distinct('material')).toEqual([])
  })
})

describe('items.photoCount, the cap lookup', () => {
  const { repos } = setup('items-photo-count')

  it('is kept in step by the photos repository and read by the editor', async () => {
    const find = await repos.finds.create()
    const item = await repos.items.create(find.id)
    const photo = await repos.photos.add({ ownerKind: 'item', ownerId: item.id, full: new Blob(['x']) })
    expect((await repos.items.get(item.id))?.photoCount).toBe(1)
    await repos.photos.softDelete(photo.id)
    expect((await repos.items.get(item.id))?.photoCount).toBe(0)
    await repos.photos.restore(photo.id)
    expect((await repos.items.get(item.id))?.photoCount).toBe(1)
    expect((await repos.items.photosOf(item.id)).length).toBe(1)
  })
})
