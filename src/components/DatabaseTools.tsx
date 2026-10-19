import { useCallback, useEffect, useRef, useState } from 'react'
import {
  benchmarkReportText,
  readBenchmarkReport,
  runBenchmarks,
  saveBenchmarkReport,
  type BenchmarkReport,
} from '../db/benchmark'
import { getRepositories } from '../db/repos'
import { META_KEYS } from '../db/repos/meta'
import { DB_NAME, readSchemaVersion } from '../db/schema'
import {
  FULL_SEED,
  PHOTO_BUDGET_BYTES,
  clearAllData,
  countRows,
  fullSeedAtPhotoBytes,
  seedDatabase,
  smallSeed,
  storageReport,
  type SeedCounts,
  type SeedPlan,
  type SeedReport,
} from '../db/seed'
import { SCALE_CEILING } from '../db/types'
import { formatBytes } from '../diagnostics/format'

/**
 * Seed, clear and benchmark the database from Diagnostics (build item 8).
 *
 * Step 01's acceptance criteria are all timed on a real phone: seed the PRD §11
 * ceiling in under 60 s, filter by Site under 100 ms, search under 300 ms, and
 * "times are logged in Diagnostics, not eyeballed". That fixes the design of this
 * card. It cannot sit behind `import.meta.env.DEV`, because the build a phone
 * runs is the deployed one; and it has to print numbers as text, because the
 * only way a number gets off a phone is by being copied or read out.
 *
 * The destructive half is deliberately awkward to reach: seeding clears first
 * rather than adding on top, because a benchmark over a dataset that is two seeds
 * deep measures nothing, and a phone that already holds real finds should not
 * lose them to a stray tap.
 */

type Busy = 'idle' | 'sample' | 'full' | 'clear' | 'benchmark'

interface Stage {
  label: string
  done: number
  total: number
}

export interface DatabaseToolsProps {
  /** Lets the screen re-read the storage estimate once the data has changed. */
  onChanged?: () => void
  /**
   * Plain text of the last benchmark run, so the raw dump carries the numbers.
   * Called with '' when there is nothing to report. Must be stable across
   * renders — a `setState` function is.
   */
  onReportText?: (text: string) => void
}

/** The order the counts read in: the things a person thinks about first. */
const STORE_ORDER = [
  'finds',
  'items',
  'photos',
  'photoBlobs',
  'sites',
  'landowners',
  'permissions',
  'sessions',
  'trackPoints',
  'detectors',
  'presets',
] as const

function countsText(counts: SeedCounts): string {
  return STORE_ORDER.map((store) => `${store}=${counts[store] ?? 0}`).join(' ')
}

/**
 * Bounds for the photo size dial, in kilobytes stored per photo. PRD §11 quotes
 * ~40 KB as the typical photo and ~150 KB as the worst case, and a phone has to
 * be able to reach both without a rebuild; below ~10 KB the thumbnail stops being
 * a photograph, because the fixture image the seeder pads has a size of its own.
 */
const MIN_PHOTO_KB = 10
const MAX_PHOTO_KB = 200
const DEFAULT_PHOTO_KB = Math.round((FULL_SEED.photoBlobBytes + FULL_SEED.photoThumbBytes) / 1000)

/** Whatever is in the dial, turned into a byte count the seeder can honour. */
function photoBytesFrom(text: string): number {
  const parsed = Number(text)
  const kb = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : DEFAULT_PHOTO_KB
  return Math.min(MAX_PHOTO_KB, Math.max(MIN_PHOTO_KB, kb)) * 1000
}

/**
 * The seed result as text, including the storage it implies. Every photo gets a
 * real JPEG, so the measured figure is the database's own; the PRD's 150 KB
 * average is printed next to it because that is the size the app is designed
 * against and the dial is what gets the two to meet.
 */
function seedText(label: string, plan: SeedPlan, report: SeedReport): string {
  const slowest = report.stages.slice(0, 3).map((stage) => `${stage.store} ${stage.rows} rows in ${stage.ms} ms`)
  const storage = storageReport(plan, report.photoBytes)
  const budget = formatBytes(PHOTO_BUDGET_BYTES)
  return [
    `${label}: ${countsText(report.counts)} in ${report.ms} ms`,
    `slowest stores: ${slowest.join(', ')}`,
    `${report.counts.photoBlobs ?? 0} JPEGs at ${formatBytes(
      plan.photoBlobBytes,
    )} plus ${formatBytes(plan.photoThumbBytes)} thumbnails: ${formatBytes(report.photoBytes)} written`,
    `${plan.photos.toLocaleString()} photos at the PRD's 150 KB average would be ${formatBytes(storage.atPrdAverage)}`,
    storage.withinBudget ? `image bytes are within the ${budget} photo budget` : `image bytes are OVER the ${budget} photo budget`,
  ].join('\n')
}

export function DatabaseTools({ onChanged, onReportText }: DatabaseToolsProps) {
  const repos = getRepositories()
  const [counts, setCounts] = useState<SeedCounts | null>(null)
  const [schemaVersion, setSchemaVersion] = useState<number | null>(null)
  const [busy, setBusy] = useState<Busy>('idle')
  const [stage, setStage] = useState<Stage | null>(null)
  const [seed, setSeed] = useState<{ label: string; plan: SeedPlan; report: SeedReport } | null>(null)
  const [report, setReport] = useState<BenchmarkReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  /**
   * Photo size for the full seed, kept as typed so the field does not fight the
   * keyboard. It is clamped when the seed starts, and the printed result says
   * which sizes were really used.
   */
  const [photoKb, setPhotoKb] = useState(String(DEFAULT_PHOTO_KB))

  // Kept in a ref so the mount effect below runs once whatever the parent passes.
  const reportTextRef = useRef(onReportText)
  useEffect(() => {
    reportTextRef.current = onReportText
  })

  const refresh = useCallback(async () => {
    const [rows, version] = await Promise.all([countRows(repos.db), readSchemaVersion(DB_NAME)])
    setCounts(rows)
    setSchemaVersion(version)
  }, [repos])

  useEffect(() => {
    let alive = true
    void refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    // The last run is read back out of the database, so the numbers survive a
    // reload and criterion 4 (re-run after an airplane-mode restart and compare)
    // has something to compare against.
    void readBenchmarkReport(repos.meta).then((stored) => {
      if (!alive || !stored) return
      setReport(stored)
      reportTextRef.current?.(benchmarkReportText(stored))
    })
    return () => {
      alive = false
    }
  }, [refresh, repos])

  const totalRows = counts ? STORE_ORDER.reduce((sum, store) => sum + (counts[store] ?? 0), 0) : 0

  async function seedData(kind: 'sample' | 'full') {
    const plan = kind === 'full' ? fullSeedAtPhotoBytes(photoBytesFrom(photoKb)) : smallSeed()
    const label = kind === 'full' ? `full ceiling (${SCALE_CEILING.finds.toLocaleString()} finds)` : 'sample data'
    setError(null)
    setSeed(null)
    setConfirmClear(false)
    setBusy(kind)
    try {
      await clearAllData(repos.db)
      const startedAt = Date.now()
      const result = await seedDatabase(repos.db, plan, {
        onProgress: (next) => setStage({ label: next.store, done: next.done, total: next.total }),
      })
      setSeed({ label, plan, report: result })
      await repos.meta.set(META_KEYS.lastSeedAt, new Date(startedAt).toISOString())
      await refresh()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('idle')
      setStage(null)
    }
  }

  async function benchmark() {
    setError(null)
    setBusy('benchmark')
    try {
      const result = await runBenchmarks(repos.db, {
        onProgress: (label) => setStage({ label, done: 0, total: 0 }),
      })
      setReport(result)
      await saveBenchmarkReport(repos.meta, result)
      reportTextRef.current?.(benchmarkReportText(result))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('idle')
      setStage(null)
    }
  }

  /** Two taps: the first only asks. Clearing throws away every find on the phone. */
  async function clear() {
    if (!confirmClear) {
      setError(null)
      setConfirmClear(true)
      return
    }
    setError(null)
    setConfirmClear(false)
    setBusy('clear')
    try {
      await clearAllData(repos.db)
      setSeed(null)
      setReport(null)
      reportTextRef.current?.('')
      await refresh()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('idle')
    }
  }

  const running = busy !== 'idle'

  return (
    <section className="card">
      <h3>Database</h3>
      <p className="muted">
        Step 01 is measured, not judged: seed the PRD §11 ceiling here, run the three named queries,
        and write the numbers down. Seeding clears the database first, so a benchmark never reads a
        dataset that is two seeds deep.
      </p>

      {counts ? (
        <p className="muted">
          {schemaVersion === null ? '' : `schema v${schemaVersion} · `}
          {countsText(counts)}
        </p>
      ) : (
        <p className="muted">Reading the database&hellip;</p>
      )}

      <p className="muted">
        <label>
          Photo size for the full seed, KB each{' '}
          <input
            type="number"
            min={MIN_PHOTO_KB}
            max={MAX_PHOTO_KB}
            step={5}
            value={photoKb}
            onChange={(event) => setPhotoKb(event.target.value)}
            disabled={running}
          />
        </label>{' '}
        {formatBytes(photoBytesFrom(photoKb))} each is{' '}
        {formatBytes(photoBytesFrom(photoKb) * SCALE_CEILING.photos)} of images across the ceiling. PRD &sect;11 quotes 40 KB as the
        typical photo and 150 KB as the worst case; the smaller the number, the faster the seed.
      </p>

      <div className="field-row">
        <button className="btn" type="button" disabled={running || totalRows > 0} onClick={() => void seedData('sample')}>
          Seed sample
        </button>
        <button className="btn primary" type="button" disabled={running || totalRows > 0} onClick={() => void seedData('full')}>
          Seed full ceiling
        </button>
        <button className="btn" type="button" disabled={running} onClick={() => void benchmark()}>
          Run benchmarks
        </button>
        <button
          className="btn"
          type="button"
          disabled={running || totalRows === 0}
          aria-pressed={confirmClear}
          onClick={() => void clear()}
        >
          {confirmClear ? 'Clear all data — are you sure?' : 'Clear all data'}
        </button>
      </div>

      {totalRows > 0 && !running ? (
        <p className="muted">
          The database already holds rows, so seeding is disabled: a timing measured over mixed data
          is not a timing. Clear first, then seed.
        </p>
      ) : null}

      {stage ? (
        <p className="muted" role="status">
          {stage.total > 0 ? `${stage.label} ${stage.done.toLocaleString()} / ${stage.total.toLocaleString()}` : stage.label}
        </p>
      ) : null}

      {error ? <p className="banner bad">Database tool failed: {error}</p> : null}

      {seed ? (
        <pre className="raw-diagnostics" aria-label="Seed result">
          {seedText(seed.label, seed.plan, seed.report)}
        </pre>
      ) : null}

      {report ? (
        <table className="diagnostic-table">
          <thead>
            <tr>
              <th scope="col">Query</th>
              <th scope="col">Time</th>
              <th scope="col">Ceiling</th>
              <th scope="col">Finds</th>
            </tr>
          </thead>
          <tbody>
            {report.results.map((result) => (
              <tr key={result.id}>
                <th scope="row">
                  {result.label}
                  <div className="muted">{result.filterText}</div>
                </th>
                <td className="value">
                  <span className={`status-${result.withinCeiling ? 'ok' : 'bad'}`}>{result.ms.toFixed(1)} ms</span>
                </td>
                <td>{result.ceilingMs} ms</td>
                <td>{result.rows.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No benchmark run recorded on this phone yet.</p>
      )}
    </section>
  )
}
