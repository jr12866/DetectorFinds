import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { T0, makeRepos, type TestSetup } from './testHelpers'
import { META_KEYS } from './meta'

describe('meta repository', () => {
  let app: TestSetup

  beforeEach(async () => {
    app = makeRepos(`meta-${Math.random()}`)
  })

  it('reads back what it wrote', async () => {
    await app.repos.meta.set(META_KEYS.durabilityProbe, 'still here')

    expect(await app.repos.meta.get(META_KEYS.durabilityProbe)).toBe('still here')
  })

  it('says nothing about a key that was never written', async () => {
    expect(await app.repos.meta.get(META_KEYS.lastExportAt)).toBeUndefined()
  })

  it('overwrites a key rather than keeping a history', async () => {
    await app.repos.meta.set(META_KEYS.lastExportAt, String(T0))
    app.setNow(T0 + 60_000)
    await app.repos.meta.set(META_KEYS.lastExportAt, String(T0 + 60_000))

    expect((await app.repos.meta.all()).length).toBe(1)
    expect(await app.repos.meta.get(META_KEYS.lastExportAt)).toBe(String(T0 + 60_000))
  })

  it('stamps each write with the clock it was given', async () => {
    await app.repos.meta.set(META_KEYS.tourSeen, 'yes')

    const [row] = await app.repos.meta.all()
    expect(row).toEqual({ key: META_KEYS.tourSeen, value: 'yes', updatedAt: T0 })
  })

  it('removes a key', async () => {
    await app.repos.meta.set(META_KEYS.tourSeen, 'yes')
    await app.repos.meta.remove(META_KEYS.tourSeen)

    expect(await app.repos.meta.get(META_KEYS.tourSeen)).toBeUndefined()
    expect(await app.repos.meta.all()).toEqual([])
  })

  it('lists the whole table in key order, for Diagnostics', async () => {
    await app.repos.meta.set(META_KEYS.tourSeen, 'yes')
    await app.repos.meta.set(META_KEYS.lastSeedAt, String(T0))

    expect((await app.repos.meta.all()).map((row) => row.key)).toEqual([
      META_KEYS.lastSeedAt,
      META_KEYS.tourSeen,
    ])
  })

  it('prints the table as plain text a user can read out over the phone', async () => {
    await app.repos.meta.set(META_KEYS.lastSeedAt, String(T0))
    await app.repos.meta.set(META_KEYS.tourSeen, 'yes')

    expect(await app.repos.meta.asText()).toBe(`${META_KEYS.lastSeedAt} = ${T0}\n${META_KEYS.tourSeen} = yes`)
  })

  it('survives closing and reopening the database, which is the whole point', async () => {
    await app.repos.meta.set(META_KEYS.durabilityProbe, 'probe-1')
    const name = app.db.name
    await app.close()

    const again = makeRepos(name)
    expect(await again.repos.meta.get(META_KEYS.durabilityProbe)).toBe('probe-1')
    await again.close()
  })
})
