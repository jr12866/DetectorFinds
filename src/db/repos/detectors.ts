import type { AppDatabase } from '../schema'
import { newId } from '../ids'
import { LIVE, type Detector, type DetectorPreset } from '../types'
import { clockFrom, tombstone, type RepoOptions } from './common'

/**
 * Detectors and their Settings Presets (PRD §7, R-DETECTOR-1/2).
 *
 * A Session stores the preset's name as well as its id, because R-DETECTOR-2
 * deliberately does not snapshot the settings: if the preset is edited later, the
 * Session still says what it said at the time.
 */
export function createDetectorsRepository(db: AppDatabase, options: RepoOptions = {}) {
  const clock = clockFrom(options)

  return {
    async create(
      input: Partial<Omit<Detector, 'createdAt' | 'updatedAt' | 'deletedAt'>> & { make: string; model: string },
    ): Promise<Detector> {
      const at = clock()
      const detector: Detector = {
        id: input.id ?? newId(),
        make: input.make,
        model: input.model,
        nickname: input.nickname ?? '',
        coil: input.coil ?? '',
        notes: input.notes ?? '',
        createdAt: at,
        updatedAt: at,
        deletedAt: LIVE,
      }
      await db.detectors.put(detector)
      return detector
    },

    get(id: string): Promise<Detector | undefined> {
      return db.detectors.get(id)
    },

    async update(id: string, patch: Partial<Omit<Detector, 'id' | 'createdAt'>>): Promise<Detector | undefined> {
      const existing = await db.detectors.get(id)
      if (!existing) return undefined
      const merged: Detector = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: clock() }
      await db.detectors.put(merged)
      return merged
    },

    allLive(): Promise<Detector[]> {
      return db.detectors.where('deletedAt').equals(LIVE).toArray().then((rows) =>
        rows.sort((a, b) => `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`)),
      )
    },

    /** R-DETECTOR-1: the picker the Session sheet shows. */
    label(detector: Detector): string {
      const name = `${detector.make} ${detector.model}`.trim()
      return detector.nickname ? `${detector.nickname} (${name})` : name
    },

    /**
     * Soft delete only. A Detector is referenced by Sessions, and R-EDIT-3 does
     * not apply here because a Session naming a retired detector is history, not a
     * dangling reference — the Session keeps the name it was given.
     */
    async softDelete(id: string): Promise<void> {
      const existing = await db.detectors.get(id)
      if (!existing) return
      await db.detectors.put({ ...existing, deletedAt: clock(), updatedAt: clock() })
    },

    async restore(id: string): Promise<void> {
      const existing = await db.detectors.get(id)
      if (!existing) return
      await db.detectors.put({ ...existing, deletedAt: LIVE, updatedAt: clock() })
    },

    async purge(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.detectors, db.presets, db.tombstones, async () => {
        const presetIds = await db.presets.where('detectorId').equals(id).primaryKeys()
        await db.presets.bulkDelete(presetIds)
        await db.detectors.delete(id)
        await db.tombstones.bulkPut([
          tombstone('detectors', id, at),
          ...presetIds.map((presetId) => tombstone('presets', presetId, at)),
        ])
      })
    },

    // --- Settings Presets (R-DETECTOR-2: free text, no schema for the settings) ---

    async createPreset(
      input: Partial<Omit<DetectorPreset, 'createdAt' | 'updatedAt' | 'deletedAt'>> & {
        detectorId: string
        name: string
      },
    ): Promise<DetectorPreset> {
      const at = clock()
      const preset: DetectorPreset = {
        id: input.id ?? newId(),
        detectorId: input.detectorId,
        name: input.name,
        settingsText: input.settingsText ?? '',
        createdAt: at,
        updatedAt: at,
        deletedAt: LIVE,
      }
      await db.presets.put(preset)
      return preset
    },

    getPreset(id: string): Promise<DetectorPreset | undefined> {
      return db.presets.get(id)
    },

    async updatePreset(
      id: string,
      patch: Partial<Omit<DetectorPreset, 'id' | 'createdAt'>>,
    ): Promise<DetectorPreset | undefined> {
      const existing = await db.presets.get(id)
      if (!existing) return undefined
      const merged: DetectorPreset = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: clock() }
      await db.presets.put(merged)
      return merged
    },

    presetsFor(detectorId: string): Promise<DetectorPreset[]> {
      return db.presets
        .where('detectorId')
        .equals(detectorId)
        .filter((preset) => preset.deletedAt === LIVE)
        .toArray()
        .then((rows) => rows.sort((a, b) => a.name.localeCompare(b.name)))
    },

    allPresetsLive(): Promise<DetectorPreset[]> {
      return db.presets.where('deletedAt').equals(LIVE).toArray()
    },

    async deletePreset(id: string): Promise<void> {
      const existing = await db.presets.get(id)
      if (!existing) return
      await db.presets.put({ ...existing, deletedAt: clock(), updatedAt: clock() })
    },

    async restorePreset(id: string): Promise<void> {
      const existing = await db.presets.get(id)
      if (!existing) return
      await db.presets.put({ ...existing, deletedAt: LIVE, updatedAt: clock() })
    },

    async purgePreset(id: string): Promise<void> {
      const at = clock()
      await db.transaction('rw', db.presets, db.tombstones, async () => {
        await db.presets.delete(id)
        await db.tombstones.put(tombstone('presets', id, at))
      })
    },
  }
}

export type DetectorsRepository = ReturnType<typeof createDetectorsRepository>
