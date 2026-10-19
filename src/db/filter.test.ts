import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from './schema'
import type { Repositories } from './repos/index'
import { fieldLog, makeRepos, T0, type TestSetup } from './repos/testHelpers'
import {
  countFinds,
  describeFilter,
  isEmptyFilter,
  itemsForFinds,
  needsDetailQueue,
  queryFinds,
} from './filter'

/**
 * The read side of PRD §12. The full filter matrix belongs to step 03; what is
 * pinned down here is where the filter API and the repositories have to agree,
 * because that is the part a screen cannot fix once it is wrong: a queue that
 * shows the Bin, or a Miss filter that counts a binned Find, are both bugs the
 * user sees as a number that does not add up.
 */
describe('filter: the Needs Detail queue', () => {
  let app: TestSetup
  let repos: Repositories
  let seq = 0

  beforeEach(() => {
    app = makeRepos(`filter-${(seq += 1)}`)
    repos = app.repos
  })

  afterEach(async () => {
    app.close()
    await deleteDatabase(app.db.name)
  })

  it('is oldest first, because the oldest unfinished log is the one to fix', async () => {
    const older = await fieldLog(repos, T0)
    const newer = await fieldLog(repos, T0 + 60_000)

    const queue = await needsDetailQueue(app.db)
    expect(queue.map((find) => find.id)).toEqual([older.id, newer.id])
  })

  /**
   * A binned Miss has no note and no Items, so its derived fields say "needs
   * detail" — but a record the user has thrown away is not waiting to be
   * finished, and being the oldest thing in the database it would otherwise sit
   * at the very front of the queue.
   */
  it('keeps the Bin out of the queue', async () => {
    const kept = await fieldLog(repos, T0)
    const binned = await fieldLog(repos, T0 - 60_000)
    await repos.finds.softDelete(binned.id)

    expect((await needsDetailQueue(app.db)).map((find) => find.id)).toEqual([kept.id])
  })

  it('leaves out a Find that already has an Item or a note', async () => {
    const withItem = await fieldLog(repos, T0)
    await repos.items.create(withItem.id, { categoryId: 'coin' })
    await repos.finds.create({ foundAt: T0, lat: 39, lon: -98, note: 'signal, nothing there' })

    expect(await needsDetailQueue(app.db)).toHaveLength(0)
  })

  it('caps the queue at the limit the screen can draw', async () => {
    for (let i = 0; i < 5; i++) await fieldLog(repos, T0 + i * 60_000)

    const queue = await needsDetailQueue(app.db, 3)
    expect(queue).toHaveLength(3)
    expect(queue[0].foundAt).toBe(T0)
  })
})

const DAY = 86_400_000

/**
 * A dataset small enough to reason about but shaped like the real thing: two
 * Sites under one Landowner, a Miss, a binned Find with an Item of its own, and
 * Items carrying the predicates the filter has to reach through.
 */
async function fixture(repos: Repositories) {
  const owner = await repos.landowners.create({ name: 'Farmer Brown' })
  const farm = await repos.sites.create({ name: 'Home farm', landownerId: owner.id })
  const river = await repos.sites.create({ name: 'River field' })

  const coin = await repos.finds.create({ foundAt: T0, siteId: farm.id, lat: 39, lon: -98 })
  await repos.items.create(coin.id, { categoryId: 'coin', material: 'silver', isSilver: 'yes', dateOnYear: 1901 })

  const buckle = await repos.finds.create({ foundAt: T0 + DAY, siteId: river.id, lat: 39, lon: -98 })
  await repos.items.create(buckle.id, { categoryId: 'buckle', material: 'bronze', isGold: 'yes' })

  const miss = await repos.finds.create({ foundAt: T0 + 2 * DAY, lat: 39, lon: -98 })

  const button = await repos.finds.create({
    foundAt: T0 + 3 * DAY,
    siteId: farm.id,
    lat: 39,
    lon: -98,
    note: 'Lead button, four shank',
  })
  await repos.items.create(button.id, { categoryId: 'button', material: 'lead', subType: 'four-shank', tags: ['clothing'] })

  const binned = await repos.finds.create({ foundAt: T0 + 4 * DAY, siteId: farm.id, lat: 39, lon: -98 })
  await repos.items.create(binned.id, { categoryId: 'coin', material: 'silver', isSilver: 'yes' })
  await repos.finds.softDelete(binned.id)

  return { owner, farm, river, coin, buckle, miss, button, binned }
}

const idsOf = (rows: Array<{ id: string }>): string[] => rows.map((row) => row.id)

describe('filter: the Find side', () => {
  let app: TestSetup
  let repos: Repositories
  let data: Awaited<ReturnType<typeof fixture>>
  let seq = 100

  beforeEach(async () => {
    app = makeRepos(`filter-matrix-${(seq += 1)}`)
    repos = app.repos
    data = await fixture(repos)
  })

  afterEach(async () => {
    app.close()
    await deleteDatabase(app.db.name)
  })

  it('reads every live Find newest first, with the Bin left out', async () => {
    const rows = await queryFinds(app.db, {})
    expect(idsOf(rows)).toEqual([data.button.id, data.miss.id, data.buckle.id, data.coin.id])
    expect(isEmptyFilter({})).toBe(true)
  })

  it('filters one Site through the [siteId+foundAt] index and keeps the others out', async () => {
    expect(idsOf(await queryFinds(app.db, { siteIds: [data.farm.id] }))).toEqual([data.button.id, data.coin.id])
    expect(idsOf(await queryFinds(app.db, { siteIds: [data.farm.id, data.river.id] }))).toEqual([
      data.button.id,
      data.buckle.id,
      data.coin.id,
    ])
  })

  it('treats an empty siteId as a value, so "Finds with no Site" is a filter you can ask for', async () => {
    expect(idsOf(await queryFinds(app.db, { siteIds: [''] }))).toEqual([data.miss.id])
    // `[]` means "no Site at all", not "any Site".
    expect(await queryFinds(app.db, { siteIds: [] })).toEqual([])
  })

  it('reads a Date Found range inclusively at both ends', async () => {
    const rows = await queryFinds(app.db, { fromMs: T0 + DAY, toMs: T0 + 2 * DAY })
    expect(idsOf(rows)).toEqual([data.miss.id, data.buckle.id])
    expect(idsOf(await queryFinds(app.db, { fromMs: T0, toMs: T0 }))).toEqual([data.coin.id])
  })

  it('filters Category, and an empty Category means the Misses', async () => {
    expect(idsOf(await queryFinds(app.db, { categories: ['coin'] }))).toEqual([data.coin.id])
    expect(idsOf(await queryFinds(app.db, { categories: ['coin', 'button'] }))).toEqual([data.button.id, data.coin.id])
    expect(idsOf(await queryFinds(app.db, { categories: [''] }))).toEqual([data.miss.id])
  })

  it('drops Misses when the screen asks to, and shows only them when the filter asks for their Category', async () => {
    expect(idsOf(await queryFinds(app.db, { hideMisses: true }))).toEqual([data.button.id, data.buckle.id, data.coin.id])
    expect(idsOf(await queryFinds(app.db, { hideMisses: true, categories: [''] }))).toEqual([])
  })

  it('selects the Needs Detail backlog, which is a Find with no Items and no note', async () => {
    expect(idsOf(await queryFinds(app.db, { needsDetailOnly: true }))).toEqual([data.miss.id])
  })

  it('filters by Session, including the Finds logged without one', async () => {
    const session = await repos.sessions.create({ date: '2026-01-15', siteId: data.farm.id, startedAt: T0 })
    const logged = await repos.finds.create({ foundAt: T0 + 5 * DAY, sessionId: session.id, siteId: data.farm.id, lat: 39, lon: -98 })
    expect(idsOf(await queryFinds(app.db, { sessionIds: [session.id] }))).toEqual([logged.id])
    expect(idsOf(await queryFinds(app.db, { sessionIds: [''] })).includes(data.miss.id)).toBe(true)
  })

  it('caps the page and keeps the newest rows, which is what the list screen scrolls through', async () => {
    const rows = await queryFinds(app.db, { limit: 2 })
    expect(idsOf(rows)).toEqual([data.button.id, data.miss.id])
    expect(await queryFinds(app.db, { limit: 0 })).toEqual([])
  })
})

describe('filter: the Item side and the search box', () => {
  let app: TestSetup
  let repos: Repositories
  let data: Awaited<ReturnType<typeof fixture>>
  let seq = 200

  beforeEach(async () => {
    app = makeRepos(`filter-items-${(seq += 1)}`)
    repos = app.repos
    data = await fixture(repos)
  })

  afterEach(async () => {
    app.close()
    await deleteDatabase(app.db.name)
  })

  it('filters precious metals through the Find, not the Item, so the list still shows whole Finds', async () => {
    expect(idsOf(await queryFinds(app.db, { preciousMetals: 'silver' }))).toEqual([data.coin.id])
    expect(idsOf(await queryFinds(app.db, { preciousMetals: 'gold' }))).toEqual([data.buckle.id])
    expect(idsOf(await queryFinds(app.db, { preciousMetals: 'silver-or-gold' }))).toEqual([data.buckle.id, data.coin.id])
    // 'any' restricts nothing, so a Miss with no Items at all survives it.
    expect(idsOf(await queryFinds(app.db, { preciousMetals: 'any' }))).toEqual(idsOf(await queryFinds(app.db, {})))
  })

  it('never lets a binned Find back in through a metal its Items still claim', async () => {
    const rows = await queryFinds(app.db, { preciousMetals: 'silver', categories: ['coin'] })
    expect(idsOf(rows)).toEqual([data.coin.id])
    expect(idsOf(rows)).not.toContain(data.binned.id)
  })

  it('filters Date On year inclusively, and an Item with no year recorded never matches', async () => {
    const range = await queryFinds(app.db, { dateOnFromYear: 1900, dateOnToYear: 1910 })
    expect(idsOf(range)).toEqual([data.coin.id])
    expect(idsOf(await queryFinds(app.db, { dateOnFromYear: 1901, dateOnToYear: 1901 }))).toEqual([data.coin.id])
    // dateOnYear 0 means "not recorded", not "year zero": a range wide enough to
    // hold every year still refuses the Items that have no year on them.
    const wide = await queryFinds(app.db, { dateOnFromYear: 1, dateOnToYear: 9999 })
    expect(idsOf(wide)).toEqual([data.coin.id])
    expect(idsOf(wide)).not.toContain(data.buckle.id)
    expect(idsOf(await queryFinds(app.db, { dateOnToYear: 2000 }))).toEqual([data.coin.id])
  })

  it('searches the Find note, the Site name and the Landowner name, case-insensitively', async () => {
    expect(idsOf(await queryFinds(app.db, { search: 'LEAD' }))).toEqual([data.button.id])
    expect(idsOf(await queryFinds(app.db, { search: 'farm' }))).toEqual([data.button.id, data.coin.id])
    expect(idsOf(await queryFinds(app.db, { search: 'brown' }))).toEqual([data.button.id, data.coin.id])
    expect(await queryFinds(app.db, { search: 'no such thing' })).toEqual([])
  })

  it('searches the Item fields too, and returns the Find rather than the Item', async () => {
    expect(idsOf(await queryFinds(app.db, { search: 'clothing' }))).toEqual([data.button.id])
    expect(idsOf(await queryFinds(app.db, { search: 'bronze' }))).toEqual([data.buckle.id])
    expect(idsOf(await queryFinds(app.db, { search: '1901' }))).toEqual([data.coin.id])
  })

  it('needs every word of a multi-word search to appear somewhere on the Find', async () => {
    expect(idsOf(await queryFinds(app.db, { search: 'button lead' }))).toEqual([data.button.id])
    // One word from the Find and one from its Site: both are on the same record.
    expect(idsOf(await queryFinds(app.db, { search: 'button farm' }))).toEqual([data.button.id])
    // Words that sit on two different Finds match neither of them.
    expect(await queryFinds(app.db, { search: 'bronze 1901' })).toEqual([])
  })

  it('lets the words of a search come from different places on the same Find', async () => {
    // A Site name and an Item field on one Find. Reading the Item half as a gate
    // of its own is what made a search for a place name return nothing at all.
    expect(idsOf(await queryFinds(app.db, { search: 'river bronze' }))).toEqual([data.buckle.id])
    expect(idsOf(await queryFinds(app.db, { search: 'brown lead' }))).toEqual([data.button.id])
    // Still one Find: a Site word and an Item word belonging to another Find match
    // neither of them.
    expect(await queryFinds(app.db, { search: 'farm bronze' })).toEqual([])
  })

  it('combines an Item-side predicate with a Find-side one', async () => {
    expect(idsOf(await queryFinds(app.db, { preciousMetals: 'silver', siteIds: [data.river.id] }))).toEqual([])
    expect(idsOf(await queryFinds(app.db, { search: 'silver', siteIds: [data.farm.id] }))).toEqual([data.coin.id])
    // The metal is in the Item and the word is in the Site name. Both halves have
    // to be satisfied, and neither one gets to veto the other.
    expect(idsOf(await queryFinds(app.db, { preciousMetals: 'silver', search: 'farm' }))).toEqual([data.coin.id])
    expect(idsOf(await queryFinds(app.db, { hideMisses: true, preciousMetals: 'any' }))).toEqual([
      data.button.id,
      data.buckle.id,
      data.coin.id,
    ])
  })
})

describe('filter: counting, describing and reading Items for a page', () => {
  let app: TestSetup
  let repos: Repositories
  let data: Awaited<ReturnType<typeof fixture>>
  let seq = 300

  beforeEach(async () => {
    app = makeRepos(`filter-count-${(seq += 1)}`)
    repos = app.repos
    data = await fixture(repos)
  })

  afterEach(async () => {
    app.close()
    await deleteDatabase(app.db.name)
  })

  it('counts exactly what the list would show, whatever the page cap says', async () => {
    expect(await countFinds(app.db, {})).toBe(4)
    expect(await countFinds(app.db, {})).toBe((await queryFinds(app.db, {})).length)
    expect(await countFinds(app.db, { siteIds: [data.farm.id], limit: 1 })).toBe(2)
    expect(await countFinds(app.db, { search: 'brown' })).toBe(2)
    expect(await countFinds(app.db, { categories: [''] })).toBe(1)
  })

  it('does not treat a page cap, a blank search or "any metal" as a filter', async () => {
    expect(isEmptyFilter({ limit: 10 })).toBe(true)
    expect(isEmptyFilter({ search: '   ' })).toBe(true)
    expect(isEmptyFilter({ preciousMetals: 'any' })).toBe(true)
    expect(isEmptyFilter({ hideMisses: false })).toBe(true)
    expect(isEmptyFilter({ siteIds: [] })).toBe(false)
  })

  it('says what it filtered, in the order the header reads it', async () => {
    expect(describeFilter({})).toBe('all finds')
    expect(describeFilter({ siteIds: ['x'] })).toBe('1 site(s)')
    expect(describeFilter({ siteIds: [''] })).toBe('no site')
    expect(describeFilter({ categories: ['', 'coin'] })).toBe('miss/coin')
    expect(describeFilter({ search: '  lead  ' })).toBe('"lead"')
    expect(describeFilter({ dateOnToYear: 1901 })).toBe('date on ?–1901')
    expect(describeFilter({ fromMs: Date.UTC(2026, 0, 5) })).toBe('found 2026-01-05–?')
    expect(describeFilter({ hideMisses: true, needsDetailOnly: true })).toBe('hides misses · needs detail')
    const everything = describeFilter({
      siteIds: [''],
      sessionIds: ['s1', 's2'],
      categories: ['', 'coin'],
      preciousMetals: 'silver',
      dateOnFromYear: 1900,
      fromMs: Date.UTC(2026, 0, 5),
      hideMisses: true,
      needsDetailOnly: true,
      search: 'lead',
    })
    expect(everything).toBe('no site · 2 session(s) · miss/coin · silver · date on 1900–? · found 2026-01-05–? · hides misses · needs detail · "lead"')
  })

  it('reads a page of Finds and their Items in one pass, oldest Item first', async () => {
    app.setNow(T0 + DAY)
    const later = await repos.items.create(data.button.id, { categoryId: 'button', subType: 'second' })

    const byFind = await itemsForFinds(app.db, [data.button.id, data.coin.id, data.miss.id])
    expect([...byFind.keys()].sort()).toEqual([data.button.id, data.coin.id].sort())
    const buttons = byFind.get(data.button.id) ?? []
    expect(buttons).toHaveLength(2)
    expect(buttons[buttons.length - 1].id).toBe(later.id)

    // A binned Find's Items went into the Bin with it, so there is nothing to show.
    expect((await itemsForFinds(app.db, [data.binned.id])).size).toBe(0)
    expect((await itemsForFinds(app.db, [])).size).toBe(0)
  })
})
