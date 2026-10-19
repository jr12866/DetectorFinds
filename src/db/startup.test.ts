import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from './schema'
import { DAY, T0, makeRepos, type TestSetup } from './repos/testHelpers'
import { runStartupMaintenance } from './startup'
import type { Repositories } from './repos'

/**
 * Build item 6 says the Bin's expiry is a mechanism, not a screen, and a
 * mechanism nobody calls is a promise nobody keeps. These tests pin the two
 * things the startup call is for: that an entry past its retention is gone
 * before the user opens anything, and that a purge which fails does not take the
 * app down with it.
 */
describe('startup maintenance', () => {
  let seq = 0
  let app: TestSetup

  beforeEach(() => {
    app = makeRepos(`startup-${(seq += 1)}`)
  })

  afterEach(async () => {
    await app.close()
    await deleteDatabase(app.db.name)
  })

  it('destroys a Bin entry that has run out its retention', async () => {
    const { finds, bin } = app.repos
    const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
    await finds.softDelete(find.id)
    app.setNow(T0 + 31 * DAY)

    const result = await runStartupMaintenance(app.repos)

    expect(result.error).toBeNull()
    expect(result.purged).toBe(1)
    expect(await finds.get(find.id)).toBeUndefined()
    expect(await bin.count()).toBe(0)
    // Destroyed, not hidden: the tombstone is what a sync would carry.
    expect(await app.db.tombstones.count()).toBe(1)
  })

  it('leaves an entry that is still inside the retention period', async () => {
    const { finds, bin } = app.repos
    const find = await finds.create({ lat: 39, lon: -98, foundAt: T0 })
    await finds.softDelete(find.id)
    app.setNow(T0 + 29 * DAY)

    const result = await runStartupMaintenance(app.repos)

    expect(result.error).toBeNull()
    expect(result.purged).toBe(0)
    expect((await finds.get(find.id))?.deletedAt).toBe(T0)
    expect(await bin.count()).toBe(1)
  })

  it('reports a failed purge instead of throwing it at the app', async () => {
    const busy: Repositories = {
      ...app.repos,
      bin: {
        ...app.repos.bin,
        purgeOlderThan: () => Promise.reject(new Error('database is busy')),
      },
    }

    const result = await runStartupMaintenance(busy)

    expect(result.purged).toBe(0)
    expect(result.error).toBe('database is busy')
  })
})
