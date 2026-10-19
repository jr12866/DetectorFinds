import { getRepositories, type Repositories } from './repos'

/**
 * The work that has to happen every time the app opens (build item 6).
 *
 * The Bin promises 30 days and then eviction, but nothing in the app asks for
 * that on its own: a phone opened once a week would otherwise hold binned rows
 * for months, and the Bin screen would show entries that should already have
 * gone. So the purge runs here, at startup, rather than waiting for a screen
 * that may never be opened.
 *
 * It is called after the first paint, not before it. The purge is a write
 * transaction across up to twelve stores, and nothing on the start screen is
 * waiting for its result.
 *
 * A failure is returned, never thrown. A purge that fails because the database
 * is busy leaves the Bin a day over its retention; a startup that throws because
 * of it leaves the app closed, which is the worse of the two.
 */
export async function runStartupMaintenance(
  repos: Repositories = getRepositories(),
): Promise<{ purged: number; error: string | null }> {
  try {
    return { purged: await repos.bin.purgeOlderThan(), error: null }
  } catch (err) {
    return { purged: 0, error: err instanceof Error ? err.message : String(err) }
  }
}
