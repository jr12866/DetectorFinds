/**
 * The Field map's two remembered settings (step 02 build items 2 and 14).
 *
 * Which Basemap is in use, and where the map was last looking. Both live in
 * `meta` (R-MAP-4, build item 14), both are read through `useLiveQuery` so a
 * change made on one screen shows up on another without either asking, and both
 * read as "not yet known" separately from "not set" - the difference between a
 * map that is about to move and a map that has nowhere to move to.
 */
import { useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getRepositories } from '../db/repos'
import { META_KEYS } from '../db/repos/meta'
import { basemapById, type Basemap, type BasemapId } from './basemaps'
import { bootViewFor, createViewStore, type MapView } from './viewStore'

export interface MapSettings {
  basemap: Basemap
  chooseBasemap: (id: BasemapId) => void
  /** `undefined` while reading, and never null once read: see `bootViewFor`. */
  bootView: MapView | undefined
  saveView: (view: MapView) => void
  saveLastPosition: (lat: number, lon: number) => void
}

export function useMapSettings(siteId: string): MapSettings {
  const { meta } = getRepositories()
  const store = useMemo(() => createViewStore(meta), [meta])

  const storedBasemap = useLiveQuery(() => meta.get(META_KEYS.mapBasemap), [])
  // One querier for all three view keys, so the map is never built from a
  // half-read set: Site view, last view anywhere, last known position.
  const bootView = useLiveQuery(
    async () => bootViewFor(await store.viewFor(siteId), await store.lastView(), await store.lastPosition()),
    [siteId],
  )

  const chooseBasemap = useCallback(
    (id: BasemapId) => {
      void meta.set(META_KEYS.mapBasemap, id)
    },
    [meta],
  )

  const saveView = useCallback((view: MapView) => void store.save(siteId, view), [store, siteId])
  const saveLastPosition = useCallback((lat: number, lon: number) => void store.saveLastPosition(lat, lon), [store])

  return {
    // `undefined` means still reading, and an unknown id falls back to Imagery,
    // so a cold map always has a background to draw while the stored value lands.
    basemap: basemapById(storedBasemap ?? undefined),
    chooseBasemap,
    bootView,
    saveView,
    saveLastPosition,
  }
}
