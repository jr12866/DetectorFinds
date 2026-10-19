import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryFinds } from './filter'
import { deleteDatabase } from './schema'
import { seedDatabase, smallSeed } from './seed'
import { makeRepos, T0, type TestSetup } from './repos/testHelpers'
import { META_KEYS } from './repos/meta'
import { LIVE } from './types'
import {
  BENCHMARK_SEARCH_TERM,
  benchmarkCases,
  benchmarkReportText,
  parseBenchmarkReport,
  readBenchmarkReport,
  runBenchmarks,
  saveBenchmarkReport,
  type BenchmarkReport,
} from './benchmark'

/**
 * The benchmark is how step 01's acceptance criteria get measured on a phone, so
 * a benchmark that quietly measures the wrong thing makes every number on the
 * phone gate a lie. These tests are not about speed — a laptop is not a Pixel —
 * they are about whether each case reads what the criterion says it reads, and
 * whether the numbers survive being written down and read back.
 */

let seq = 0
let app: TestSetup | null = null

beforeEach(() => {
  seq += 1
  app = makeRepos(`benchmark-${seq}`)
})

afterEach(async () => {
  app?.close()
  await deleteDatabase(`benchmark-${seq}`)
})

function db() {
  if (!app) throw new Error('no database open')
  return app.db
}

function repos() {
  if (!app) throw new Error('no repositories open')
  return app.repos
}

async function seedSmall() {
  return seedDatabase(db(), smallSeed(), { now: T0 })
}

/**
 * Two Sites with a known number of live Finds each. Written by hand rather than
 * read off the seeder, because the seeder spreads Finds randomly and a tie would
 * make "which Site did it pick?" a coin flip.
 */
async function twoSites(busy = 3, quiet = 1) {
  const first = await repos().sites.create({ name: 'Busy field' })
  const second = await repos().sites.create({ name: 'Quiet field' })
  for (let i = 0; i < busy; i += 1) await repos().finds.create({ foundAt: T0 + i, siteId: first.id })
  for (let i = 0; i < quiet; i += 1) await repos().finds.create({ foundAt: T0 + 100 + i, siteId: second.id })
  return { first, second }
}

describe('benchmark cases', () => {
  it('filters the busiest Site, so the timing is not flattered by an empty one', async () => {
    const { first } = await twoSites(3, 1)

    const cases = await benchmarkCases(db())
    expect(cases[0].filter.siteIds).toEqual([first.id])
    expect(cases[0].ceilingMs).toBe(100)
  })

  it('ignores binned Finds when choosing the Site', async () => {
    const { first, second } = await twoSites(3, 1)
    for (const find of await repos().finds.bySite(first.id)) {
      await repos().finds.softDelete(find.id)
    }

    const cases = await benchmarkCases(db())
    expect(cases[0].filter.siteIds).toEqual([second.id])
  })

  it('does not pick the unassigned bucket just because it is the biggest', async () => {
    for (let i = 0; i < 5; i += 1) await repos().finds.create({ foundAt: T0 + i })
    const { first } = await twoSites(2, 1)

    const cases = await benchmarkCases(db())
    expect(cases[0].filter.siteIds).toEqual([first.id])
  })

  it('uses the real Date Found span, not a made-up one', async () => {
    await seedSmall()
    const fromMs = (await db().finds.orderBy('foundAt').first())?.foundAt as number
    const toMs = (await db().finds.orderBy('foundAt').last())?.foundAt as number
    expect(toMs).toBeGreaterThan(fromMs)

    const [, range] = await benchmarkCases(db())
    expect(range.filter.fromMs).toBe(fromMs)
    expect(range.filter.toMs).toBe(toMs)
    expect(range.filter.categories).toEqual(['coin'])
    expect(range.filter.preciousMetals).toBe('silver')
  })

  it('searches for a term the seeded data actually contains', async () => {
    await seedSmall()
    const [, , search] = await benchmarkCases(db())
    expect(search.filter.search).toBe(BENCHMARK_SEARCH_TERM)

    const rows = await queryFinds(db(), search.filter)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('still resolves the three cases against an empty database', async () => {
    const cases = await benchmarkCases(db())
    expect(cases.map((one) => one.id)).toEqual(['site', 'category-metals', 'search'])
    expect(cases.map((one) => one.ceilingMs)).toEqual([100, 100, 300])
  })
})

describe('runBenchmarks', () => {
  it('runs the three named queries and writes down what each one measured', async () => {
    await seedSmall()
    const report = await runBenchmarks(db(), { at: T0 })

    expect(report.at).toBe(T0)
    expect(report.results).toHaveLength(3)
    for (const result of report.results) {
      expect(result.ms).toBeGreaterThanOrEqual(0)
      expect(result.filterText).not.toBe('')
      expect(result.withinCeiling).toBe(result.ms <= result.ceilingMs)
    }
    expect(report.results[0].filterText).toContain('1 site(s)')
    expect(report.withinCeilings).toBe(report.results.every((result) => result.withinCeiling))
  })

  it('reports the live row counts the numbers were measured against', async () => {
    await seedSmall()
    const binned = (await repos().finds.list(1))[0]
    await repos().finds.softDelete(binned.id)

    const report = await runBenchmarks(db(), { at: T0 })
    const liveFinds = await db().finds.where('deletedAt').equals(LIVE).count()
    expect(report.rows.finds).toBe(liveFinds)
    expect(report.rows.items).toBeGreaterThan(0)
    expect(report.rows.photos).toBeGreaterThan(0)
  })

  it('the search case reads Items, so its timing means something', async () => {
    await seedSmall()
    const report = await runBenchmarks(db(), { at: T0 })
    const search = report.results.find((result) => result.id === 'search')
    expect(search?.rows).toBeGreaterThan(0)
    expect(search?.ceilingMs).toBe(300)
  })

  it('reports progress before each case, so a slow phone shows which one it is on', async () => {
    await seedSmall()
    const seen: string[] = []
    await runBenchmarks(db(), { at: T0, onProgress: (label) => seen.push(label) })
    expect(seen).toHaveLength(3)
    expect(seen[0]).toBe('filter by site')
  })

  it('an empty database still produces a readable report', async () => {
    const report = await runBenchmarks(db(), { at: T0 })
    expect(report.rows).toEqual({ finds: 0, items: 0, photos: 0 })
    expect(report.results.every((result) => result.rows === 0)).toBe(true)
    expect(report.withinCeilings).toBe(true)
  })
})

describe('stored benchmark reports', () => {
  it('round-trips through meta, which is how criterion 4 compares two runs', async () => {
    await seedSmall()
    const report = await runBenchmarks(db(), { at: T0 })
    await saveBenchmarkReport(repos().meta, report)

    expect(await repos().meta.get(META_KEYS.lastBenchmarkAt)).toBe(new Date(T0).toISOString())
    const stored = await readBenchmarkReport(repos().meta)
    expect(stored).not.toBeNull()
    expect(stored?.at).toBe(report.at)
    expect(stored?.rows).toEqual(report.rows)
    expect(stored?.results.map((result) => [result.id, result.ms, result.rows, result.ceilingMs])).toEqual(
      report.results.map((result) => [result.id, result.ms, result.rows, result.ceilingMs]),
    )
    expect(stored?.withinCeilings).toBe(report.withinCeilings)
  })

  it('a payload that is not JSON reads as no previous run rather than throwing', async () => {
    await repos().meta.set(META_KEYS.lastBenchmark, 'not json at all')
    expect(await readBenchmarkReport(repos().meta)).toBeNull()
  })

  it('a payload with no usable results reads as no previous run', () => {
    expect(parseBenchmarkReport('{"at":1,"results":[]}')).toBeNull()
    expect(parseBenchmarkReport('{"results":[{"label":"x","ms":1,"ceilingMs":100}]}')).toBeNull()
    expect(parseBenchmarkReport('{"at":1,"results":[{"label":"x","ms":"fast","ceilingMs":100}]}')).toBeNull()
    expect(parseBenchmarkReport('[]')).toBeNull()
  })

  it('re-derives pass and fail from the timings rather than trusting the stored flag', () => {
    const parsed = parseBenchmarkReport(
      JSON.stringify({
        at: T0,
        ms: 900,
        rows: { finds: 5000, items: 12000, photos: 15000 },
        results: [
          { id: 'site', label: 'filter by site', filter: {}, filterText: '1 site(s)', ms: 500, rows: 200, ceilingMs: 100, withinCeiling: true },
        ],
      }),
    )
    expect(parsed?.results[0].withinCeiling).toBe(false)
    expect(parsed?.withinCeilings).toBe(false)
  })
})

describe('benchmarkReportText', () => {
  function report(over: boolean): BenchmarkReport {
    return {
      at: T0,
      ms: 42,
      rows: { finds: 5000, items: 12000, photos: 15000 },
      results: [
        {
          id: 'site',
          label: 'filter by site',
          filter: { siteIds: ['s1'] },
          filterText: '1 site(s)',
          ceilingMs: 100,
          ms: over ? 240 : 40,
          rows: 200,
          withinCeiling: !over,
        },
      ],
      withinCeilings: !over,
    }
  }

  it('names the query, the filter, the time, the ceiling and the row count', () => {
    const text = benchmarkReportText(report(false))
    expect(text).toContain('filter by site')
    expect(text).toContain('1 site(s)')
    expect(text).toContain('40.0 ms')
    expect(text).toContain('ceiling 100 ms')
    expect(text).toContain('200 finds')
    expect(text).toContain('finds=5000 items=12000 photos=15000')
    expect(text).toContain('all timings within their ceilings')
  })

  it('says OVER when a timing misses, so a screenshot cannot be misread', () => {
    const text = benchmarkReportText(report(true))
    expect(text).toContain('OVER')
    expect(text).toContain('AT LEAST ONE TIMING OVER ITS CEILING')
  })
})
