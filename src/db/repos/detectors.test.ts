import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { T0, makeRepos, type TestSetup } from './testHelpers'

describe('detectors repository', () => {
  let app: TestSetup

  beforeEach(async () => {
    app = makeRepos(`detectors-${Math.random()}`)
  })

  it('creates a detector with blank optional fields', async () => {
    const detector = await app.repos.detectors.create({ make: 'Minelab', model: 'Manticore' })

    expect(detector.id).toBeTruthy()
    expect(detector.nickname).toBe('')
    expect(detector.coil).toBe('')
    expect(detector.notes).toBe('')
    expect(detector.deletedAt).toBe(0)
    expect(detector.createdAt).toBe(T0)
    expect(detector.updatedAt).toBe(T0)
  })

  it('round-trips every field', async () => {
    const created = await app.repos.detectors.create({
      make: 'Nokta',
      model: 'Makro Krom',
      nickname: 'Krom',
      coil: '11" DD',
      notes: 'Run it in Park mode on golf courses.',
    })

    const found = await app.repos.detectors.get(created.id)
    expect(found).toEqual(created)
  })

  it('lists live detectors and hides binned ones', async () => {
    const a = await app.repos.detectors.create({ make: 'Minelab', model: 'Equinox 900' })
    const b = await app.repos.detectors.create({ make: 'Garrett', model: 'AT Pro' })
    await app.repos.detectors.softDelete(b.id)

    const live = await app.repos.detectors.allLive()
    expect(live.map((d) => d.id)).toEqual([a.id])
  })

  it('soft deletes a detector without blocking, because a Session naming it is history', async () => {
    const detector = await app.repos.detectors.create({ make: 'Minelab', model: 'Manticore' })
    await app.repos.sessions.create({
      date: '2026-01-15',
      detectorId: detector.id,
      detectorPresetName: 'All Ground',
    })

    await app.repos.detectors.softDelete(detector.id)

    // get() is deliberately raw, the same as sessions.get(): the Bin needs to be
    // able to read a binned row in order to restore it. allLive() is the gate.
    const binned = await app.repos.detectors.get(detector.id)
    expect(binned?.deletedAt).toBe(T0)
    expect((await app.repos.detectors.allLive()).length).toBe(0)
  })

  it('restores a binned detector', async () => {
    const detector = await app.repos.detectors.create({ make: 'Nokta', model: 'Simplex Lite' })
    await app.repos.detectors.softDelete(detector.id)
    await app.repos.detectors.restore(detector.id)

    expect((await app.repos.detectors.allLive()).map((d) => d.id)).toEqual([detector.id])
  })

  it('adds a Settings Preset against its detector', async () => {
    const detector = await app.repos.detectors.create({ make: 'Minelab', model: 'Manticore' })
    const preset = await app.repos.detectors.createPreset({
      detectorId: detector.id,
      name: 'All Ground',
      settingsText: 'Disc 0-18, Notch iron, All Metal, Volume 12',
    })

    expect(preset.detectorId).toBe(detector.id)
    expect(preset.deletedAt).toBe(0)

    const presets = await app.repos.detectors.presetsFor(detector.id)
    expect(presets.map((p) => p.id)).toEqual([preset.id])
  })

  it('soft deletes a preset and hides it from its detector', async () => {
    const detector = await app.repos.detectors.create({ make: 'Minelab', model: 'Manticore' })
    const keep = await app.repos.detectors.createPreset({ detectorId: detector.id, name: 'Park', settingsText: 'Disc 0-12' })
    const drop = await app.repos.detectors.createPreset({ detectorId: detector.id, name: 'Field', settingsText: 'Disc 0-20' })
    await app.repos.detectors.deletePreset(drop.id)

    expect((await app.repos.detectors.presetsFor(detector.id)).map((p) => p.id)).toEqual([keep.id])
  })

  it('purging a detector also purges its presets and writes tombstones for both', async () => {
    const detector = await app.repos.detectors.create({ make: 'Minelab', model: 'Manticore' })
    const preset = await app.repos.detectors.createPreset({ detectorId: detector.id, name: 'All Ground', settingsText: 'x' })
    await app.repos.detectors.softDelete(detector.id)
    await app.repos.detectors.purge(detector.id)

    expect(await app.db.detectors.get(detector.id)).toBeUndefined()
    expect(await app.db.presets.get(preset.id)).toBeUndefined()

    const dead = await app.db.tombstones.toArray()
    expect(dead.map((t) => `${t.store}:${t.id}`).sort()).toEqual(
      [`detectors:${detector.id}`, `presets:${preset.id}`].sort(),
    )
  })

  it('purging a preset leaves its detector alone', async () => {
    const detector = await app.repos.detectors.create({ make: 'Nokta', model: 'Krom' })
    const preset = await app.repos.detectors.createPreset({ detectorId: detector.id, name: 'Beach', settingsText: 'x' })
    await app.repos.detectors.deletePreset(preset.id)
    await app.repos.detectors.purgePreset(preset.id)

    expect(await app.db.detectors.get(detector.id)).toBeTruthy()
    expect(await app.db.presets.get(preset.id)).toBeUndefined()
  })

  it('restores a binned preset', async () => {
    const detector = await app.repos.detectors.create({ make: 'Nokta', model: 'Krom' })
    const preset = await app.repos.detectors.createPreset({ detectorId: detector.id, name: 'Beach', settingsText: 'x' })
    await app.repos.detectors.deletePreset(preset.id)
    await app.repos.detectors.restorePreset(preset.id)

    expect((await app.repos.detectors.presetsFor(detector.id)).map((p) => p.id)).toEqual([preset.id])
  })
})
