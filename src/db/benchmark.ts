import { describeFilter, queryFinds, type FindFilter } from './filter'
import { META_KEYS, type MetaRepository } from './repos/meta'
import type { AppDatabase } from './schema'
import { LIVE, UNASSIGNED } from './types'

/**
 * The three timings step 01's acceptance criteria name.
 *
 * The criteria are specific — filter by Site under 100 ms, date range +
 * Category + silver under 100 ms, substring search under 300 ms — so the cases
 * live here rather than in the screen, and the ceilings travel with them. A
 * number on a phone is only a number unless the thing it measured is written
 * down beside it, which is what `filterText` and `rows` are for.
 *
 * The cases are resolved against the data that is actually loaded: the busiest
 * Site, and the real Date Found span. A benchmark that filters an empty Site
 * reports a flattering zero, and that is the failure mode this whole module is
 * here to avoid.
 */

/**
 * The search term. Chosen from the seeder's own vocabulary so it is not a word
 * the data happens not to contain: `lead` is a Material, a tag and part of an
 * Item note, so it reads every Item row and matches a realistic slice of them.
 * The cost is the scan, not the match, so the term matters only in that it must
 * not be one that short-circuits.
 */
export const BENCHMARK_SEARCH_TERM = 'lead'

/** The Category the second case filters on. Step 07 owns the real list. */
export const BENCHMARK_CATEGORY_ID = 'coin'

export interface BenchmarkCase {
  id: string
  label: string
  filter: FindFilter
  /** The ceiling from `docs/build/01-data-layer.md`, in ms. */
  ceilingMs: number
}

export interface BenchmarkResult extends BenchmarkCase {
  /** What the filter resolved to, so the number can be reproduced by hand. */
  filterText: string
  ms: number
  /** Finds the query returned. Zero rows means the number is meaningless. */
  rows: number
  withinCeiling: boolean
}

export interface BenchmarkReport {
  /** When the run started, in ms since the epoch. */
  at: number
  /** Wall time for the whole run, including resolving the cases. */
  ms: number
  /** Live row counts the numbers were measured against. */
  rows: { finds: number; items: number; photos: number }
  results: BenchmarkResult[]
  withinCeilings: boolean
}

export interface BenchmarkOptions {
  /** Stamp for the report. Defaults to the system clock; tests pin it. */
  at?: number
  /** Called before each case, so a slow phone can show which one it is on. */
  onProgress?: (label: string) => void
}

/** performance.now() where the platform has it, so a wall-clock jump cannot move a timing. */
function monotonic(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
}

/**
 * The Site holding the most live Finds. Unassigned Finds are skipped: filtering
 * "no Site" is a real query, but it is not the one the criterion means.
 */
async function busiestSiteId(db: AppDatabase): Promise<string> {
  const counts = new Map<string, number>()
  const finds = await db.finds.where('deletedAt').equals(LIVE).toArray()
  for (const find of finds) {
    if (find.siteId === UNASSIGNED) continue
    counts.set(find.siteId, (counts.get(find.siteId) ?? 0) + 1)
  }
  let best = UNASSIGNED
  let bestCount = -1
  for (const [siteId, count] of counts) {
    if (count > bestCount) {
      best = siteId
      bestCount = count
    }
  }
  return best
}

/**
 * The Date Found span the data actually covers. `orderBy` walks the index, so the
 * two ends cost a seek each rather than a scan. Binned Finds are included: the
 * range is a property of the dataset, and the query under test has to be able to
 * reach every row anyway.
 */
async function foundAtSpan(db: AppDatabase): Promise<{ fromMs: number; toMs: number }> {
  const [first, last] = await Promise.all([db.finds.orderBy('foundAt').first(), db.finds.orderBy('foundAt').last()])
  return { fromMs: first?.foundAt ?? 0, toMs: last?.foundAt ?? 0 }
}

/** The three named queries, resolved against whatever is in the database now. */
export async function benchmarkCases(db: AppDatabase): Promise<BenchmarkCase[]> {
  const siteId = await busiestSiteId(db)
  const { fromMs, toMs } = await foundAtSpan(db)
  return [
    {
      id: 'site',
      label: 'filter by site',
      ceilingMs: 100,
      filter: { siteIds: [siteId] },
    },
    {
      id: 'category-metals',
      label: 'date range + category + silver',
      ceilingMs: 100,
      filter: { fromMs, toMs, categories: [BENCHMARK_CATEGORY_ID], preciousMetals: 'silver' },
    },
    {
      id: 'search',
      label: `substring search ("${BENCHMARK_SEARCH_TERM}")`,
      ceilingMs: 300,
      filter: { search: BENCHMARK_SEARCH_TERM },
    },
  ]
}

/**
 * Runs the cases one after another. Deliberately not in parallel: two queries in
 * flight against one IndexedDB connection report each other's waiting time, and
 * on a phone that is the only measurement that matters.
 */
export async function runBenchmarks(db: AppDatabase, options: BenchmarkOptions = {}): Promise<BenchmarkReport> {
  const began = monotonic()
  const cases = await benchmarkCases(db)

  const results: BenchmarkResult[] = []
  for (const one of cases) {
    options.onProgress?.(one.label)
    const mark = monotonic()
    const rows = await queryFinds(db, one.filter)
    const ms = monotonic() - mark
    results.push({
      ...one,
      filterText: describeFilter(one.filter),
      ms,
      rows: rows.length,
      withinCeiling: ms <= one.ceilingMs,
    })
  }

  const [finds, items, photos] = await Promise.all([
    db.finds.where('deletedAt').equals(LIVE).count(),
    db.items.where('deletedAt').equals(LIVE).count(),
    db.photos.where('deletedAt').equals(LIVE).count(),
  ])

  return {
    at: options.at ?? Date.now(),
    ms: monotonic() - began,
    rows: { finds, items, photos },
    results,
    withinCeilings: results.every((result) => result.withinCeiling),
  }
}

/**
 * Stores the run so the numbers survive a reload. Criterion 4 asks for the
 * timings to be re-run after an airplane-mode restart and compared, and a
 * comparison needs the first run to still be there.
 */
export async function saveBenchmarkReport(meta: MetaRepository, report: BenchmarkReport): Promise<void> {
  await meta.set(META_KEYS.lastBenchmark, JSON.stringify(report))
  await meta.set(META_KEYS.lastBenchmarkAt, new Date(report.at).toISOString())
}

function number(value: unknown, otherwise = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : otherwise
}

/**
 * Reads the stored run back. Forgiving on purpose: a report written by an older
 * build, or truncated by a quota error, reads as "no previous run" rather than
 * throwing at the one screen whose job is to explain what went wrong.
 */
export function parseBenchmarkReport(raw: string | undefined | null): BenchmarkReport | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const v = value as { at?: unknown; ms?: unknown; rows?: unknown; results?: unknown }
  if (typeof v.at !== 'number') return null
  if (!Array.isArray(v.results)) return null

  const results: BenchmarkResult[] = []
  for (const entry of v.results as Record<string, unknown>[]) {
    if (typeof entry?.label !== 'string') continue
    if (typeof entry.ms !== 'number' || !Number.isFinite(entry.ms)) continue
    if (typeof entry.ceilingMs !== 'number' || !Number.isFinite(entry.ceilingMs)) continue
    const { ms, ceilingMs } = entry
    results.push({
      id: typeof entry.id === 'string' ? entry.id : '',
      label: entry.label,
      // The filter itself only exists so a human can re-run the query by hand,
      // so a report that lost it is still worth reading.
      filter: (entry.filter as FindFilter) ?? {},
      ceilingMs,
      filterText: typeof entry.filterText === 'string' ? entry.filterText : '',
      ms,
      rows: number(entry.rows),
      withinCeiling: ms <= ceilingMs,
    })
  }
  if (results.length === 0) return null

  const rows = (typeof v.rows === 'object' && v.rows !== null ? v.rows : {}) as Record<string, unknown>
  return {
    at: v.at,
    ms: number(v.ms),
    rows: { finds: number(rows.finds), items: number(rows.items), photos: number(rows.photos) },
    results,
    withinCeilings: results.every((result) => result.withinCeiling),
  }
}

export async function readBenchmarkReport(meta: MetaRepository): Promise<BenchmarkReport | null> {
  return parseBenchmarkReport(await meta.get(META_KEYS.lastBenchmark))
}

/**
 * Plain text, because the numbers have to leave the phone. The Diagnostics dump
 * is what a user reads out over the phone or pastes into an issue.
 */
export function benchmarkReportText(report: BenchmarkReport): string {
  const lines = [
    `benchmark ${new Date(report.at).toISOString()}  (${report.ms.toFixed(0)} ms total)`,
    `live rows: finds=${report.rows.finds} items=${report.rows.items} photos=${report.rows.photos}`,
  ]
  for (const result of report.results) {
    lines.push(
      `${result.label} [${result.filterText}]: ${result.ms.toFixed(1)} ms -> ${result.rows} finds, ceiling ${result.ceilingMs} ms, ${
        result.withinCeiling ? 'ok' : 'OVER'
      }`,
    )
  }
  lines.push(report.withinCeilings ? 'all timings within their ceilings' : 'AT LEAST ONE TIMING OVER ITS CEILING')
  return lines.join('\n')
}
