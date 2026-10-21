/**
 * The Field map (step 02).
 *
 * This file owns state and wiring and nothing else. Every decision it applies -
 * which Pins get drawn, how a Pin is styled, when the map pans, what a card
 * says, what gets written to a Find - lives in a module under `src/map` with a
 * test next to it, because none of those decisions can be checked by reading
 * this file, and only some of them can be checked on a phone.
 *
 * Two things it deliberately does not do yet:
 *
 * - It has no Site chooser, so every Pin is logged against the unassigned Site
 *   and the per-Site view key is the unassigned one. Step 06 owns Sites.
 * - It has no Find editor, so "Open" goes to the raw-fields screen. Step 03
 *   owns the editor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getRepositories } from '../db/repos'
import { useFinds, usePhotosOfOwner, useSites } from '../db/liveQueries'
import { gpsFeed } from '../gps/position'
import { useGpsState } from '../gps/useGpsState'
import { useCompass, useCompassPermissionGate } from '../gps/compass'
import { BasemapSwitcher, LogPinSheet, MapControls, PinCard, StatusStrip } from '../components/MapOverlays'
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM } from '../map/basemaps'
import {
  decideOnFix,
  initialFollowMode,
  modeAfterDrag,
  modeAfterRecenter,
  recenterIsUseful,
  type FollowMode,
} from '../map/followMode'
import { createFieldMap, type FieldMap } from '../map/fieldMap'
import { pinDescriptors, unplottableCount } from '../map/pinModel'
import { popupCardFor } from '../map/popupCard'
import { movePinPatch, pendingGpsPin, pendingHandPin, pinInputFor, type PendingPin } from '../map/pinWrites'
import { averagingAdvice } from '../map/readouts'
import { useMapSettings } from '../map/useMapSettings'
import { FALLBACK_VIEW } from '../map/viewStore'

/** How long a message about a write stays on screen. */
const FLASH_MS = 6_000

/** How often the last-known position is written to `meta` (build item 14). */
const POSITION_SAVE_MS = 30_000

/** What the map is waiting for the next tap on it to mean. */
type TapMode = { kind: 'idle' } | { kind: 'placing' } | { kind: 'moving'; findId: string }

export function MapScreen() {
  const { finds: findsRepo, photos: photosRepo } = getRepositories()

  // Step 02 has no Site or Session chooser, so the map works against the
  // unassigned buckets (GLOSSARY: Site, Session). Steps 05 and 06 replace this.
  const siteId = ''
  const sessionId = ''

  const gps = useGpsState()
  const finds = useFinds({})
  const sites = useSites()
  const settings = useMapSettings(siteId)

  const [follow, setFollow] = useState<FollowMode>(initialFollowMode)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tapMode, setTapMode] = useState<TapMode>({ kind: 'idle' })
  const [sheet, setSheet] = useState<PendingPin | null>(null)
  const [headingOn, setHeadingOn] = useState(false)
  const [flash, setFlash] = useState('')
  const [missingTiles, setMissingTiles] = useState(0)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<FieldMap | null>(null)
  const tapModeRef = useRef<TapMode>(tapMode)
  tapModeRef.current = tapMode
  const latestPositionRef = useRef(gps.position)
  latestPositionRef.current = gps.position
  const flashTimerRef = useRef(0)
  const lastPositionSavedRef = useRef(0)
  /** True once the map has moved for any reason other than the stored view. */
  const interactedRef = useRef(false)
  const appliedStoredViewRef = useRef(false)
  const appliedBasemapIdRef = useRef('')

  useCompass(headingOn)
  const compass = useCompassPermissionGate(headingOn)

  const say = useCallback((message: string) => {
    // One timer, restarted: two writes in a row should show the second message
    // for its full time, not have it cleared by the first message's timer.
    window.clearTimeout(flashTimerRef.current)
    setFlash(message)
    if (message) flashTimerRef.current = window.setTimeout(() => setFlash(''), FLASH_MS)
  }, [])

  // -------------------------------------------------------------- the map ----

  const handleMapTap = useCallback(
    (lat: number, lon: number) => {
      const mode = tapModeRef.current
      if (mode.kind === 'moving') {
        const fm = mapRef.current
        fm?.endMovePin()
        setTapMode({ kind: 'idle' })
        void findsRepo.setPosition(mode.findId, movePinPatch(lat, lon)).then((updated) => {
          if (!updated) say('That Find has gone away, so the Pin did not move.')
          else say(`Pin moved to ${updated.lat.toFixed(6)}, ${updated.lon.toFixed(6)}.`)
        })
        return
      }
      if (mode.kind === 'placing') {
        setTapMode({ kind: 'idle' })
        const pin = pendingHandPin(lat, lon)
        if (!pin) {
          say('That is not a position the map can use.')
          return
        }
        setSheet(pin)
      }
    },
    [findsRepo, say],
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const fieldMap = createFieldMap(containerRef.current, {
      // Built straight away, on the fallback view if the stored one has not been
      // read yet: a grey rectangle while a database read finishes reads as a
      // broken app, and the map is the one thing this screen has to show.
      view: settings.bootView ?? FALLBACK_VIEW,
      basemap: settings.basemap,
      handlers: {
        onUserPan: () => {
          interactedRef.current = true
          setFollow((mode) => modeAfterDrag(mode))
        },
        onViewChanged: (view) => settings.saveView(view),
        onPinTap: (findId) => setSelectedId(findId),
        onMapTap: handleMapTap,
        onTileMissing: () => setMissingTiles((count) => count + 1),
      },
    })
    mapRef.current = fieldMap
    appliedBasemapIdRef.current = settings.basemap.id

    const container = containerRef.current
    const observer = new ResizeObserver(() => fieldMap.resize())
    observer.observe(container)

    return () => {
      observer.disconnect()
      // Build item 14: the position the app last saw is the one the next cold
      // open starts from, so it is written when the map closes rather than on
      // every fix - a write per second would be the most expensive thing the app did.
      const last = latestPositionRef.current
      if (last) settings.saveLastPosition(last.lat, last.lon)
      fieldMap.destroy()
      mapRef.current = null
    }
    // Created once, on mount. Everything else is applied by the effects below,
    // and the cleanup only wants the values at unmount, so the settings and
    // handlers this was built with are deliberately not deps.
  }, [])

  // The stored view usually lands after the map has already been built. Applying
  // it once, and only while the user has not touched the map, is what makes the
  // remembered view the one they meet without ever moving the map under a finger.
  useEffect(() => {
    const fieldMap = mapRef.current
    const view = settings.bootView
    if (!fieldMap || appliedStoredViewRef.current || view === undefined) return
    appliedStoredViewRef.current = true
    if (interactedRef.current) return
    fieldMap.setView(view.lat, view.lon, view.zoom)
  }, [settings.bootView])

  // Pins: a live query re-runs on every write, so the layer is diffed by id
  // rather than rebuilt (see `fieldMap.setPins`).
  const pins = useMemo(() => pinDescriptors(finds ?? [], selectedId), [finds, selectedId])
  useEffect(() => {
    mapRef.current?.setPins(pins)
  }, [pins])

  // The user's dot. The heading is read from the feed on the same tick as the
  // position, which is what keeps the dot and its wedge pointing the same way.
  useEffect(() => {
    mapRef.current?.setUser(
      gps.position,
      gps.position?.accuracyM ?? 0,
      gpsFeed.getHeading() ?? 0,
      headingOn,
      gps.stale,
    )
  }, [gps, headingOn])

  // Build item 6: follow mode. The dot always moves; the map only moves while the
  // mode says so, and only once the fix has moved further than the threshold.
  useEffect(() => {
    const fieldMap = mapRef.current
    if (!fieldMap) return
    const decision = decideOnFix(follow, fieldMap.view, gps.position)
    if (!decision.panTo) return
    interactedRef.current = true
    fieldMap.panTo(decision.panTo.lat, decision.panTo.lon)
  }, [gps.position, follow])

  // Build item 2: the Basemap, and only the Basemap, is swapped when it changes.
  // The layer the map was built with is not torn down and rebuilt again on mount.
  useEffect(() => {
    const fieldMap = mapRef.current
    if (!fieldMap || appliedBasemapIdRef.current === settings.basemap.id) return
    appliedBasemapIdRef.current = settings.basemap.id
    fieldMap.setBasemap(settings.basemap)
  }, [settings.basemap])

  // Remembering where the map was looking is a per-Site thing (build item 14),
  // and so is the position the next cold open should start from. That is written
  // at most every half minute rather than on every fix: a write per second would
  // be the most expensive thing the app does, for a figure the next fix replaces.
  useEffect(() => {
    const position = gps.position
    if (!position) return
    const now = Date.now()
    if (now - lastPositionSavedRef.current < POSITION_SAVE_MS) return
    lastPositionSavedRef.current = now
    settings.saveLastPosition(position.lat, position.lon)
  }, [gps.position, settings.saveLastPosition])

  // ------------------------------------------------------------- the card ----

  const selectedFind = useMemo(() => (selectedId ? finds?.find((find) => find.id === selectedId) : undefined), [finds, selectedId])
  const findPhotos = usePhotosOfOwner(selectedId ?? undefined)
  const photoId = findPhotos?.[0]?.id ?? null
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!photoId) {
      setPhotoUrl(null)
      return
    }
    let url: string | null = null
    let cancelled = false
    void photosRepo.objectUrl(photoId, 'thumb').then((created) => {
      if (cancelled || !created) return
      url = created
      setPhotoUrl(created)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [photoId, photosRepo])

  const card = useMemo(() => {
    if (!selectedFind) return null
    const site = sites?.find((entry) => entry.id === selectedFind.siteId)
    return popupCardFor(selectedFind, {
      siteName: site?.name ?? '',
      from: gps.position,
      photoId,
    })
  }, [selectedFind, sites, gps.position, photoId])

  // A Find that goes to the Bin while its card is open takes the card with it,
  // because a card about a record that is not there is a card about nothing.
  useEffect(() => {
    if (selectedId && finds && !finds.some((find) => find.id === selectedId)) {
      setSelectedId(null)
      setTapMode({ kind: 'idle' })
      mapRef.current?.endMovePin()
    }
  }, [finds, selectedId])

  // ------------------------------------------------------------- the flows ---

  const offered = pendingGpsPin(gps)

  function logFindHere() {
    if (!sheet) return
    const pin = sheet
    setSheet(null)
    void findsRepo.create(pinInputFor(pin, { siteId, sessionId, foundAt: Date.now() })).then((created) => {
      setSelectedId(created.id)
      mapRef.current?.panTo(created.lat, created.lon)
      say(`Find logged at ${created.lat.toFixed(6)}, ${created.lon.toFixed(6)}.`)
    })
  }

  function addPinByHand() {
    setTapMode((mode) => (mode.kind === 'placing' ? { kind: 'idle' } : { kind: 'placing' }))
    setSelectedId(null)
  }

  function startMovePin() {
    if (!selectedFind) return
    setTapMode({ kind: 'moving', findId: selectedFind.id })
    mapRef.current?.beginMovePin(selectedFind.lat, selectedFind.lon)
  }

  function cancelTapMode() {
    setTapMode({ kind: 'idle' })
    mapRef.current?.endMovePin()
  }

  function recenter() {
    if (!gps.position) return
    setFollow((mode) => modeAfterRecenter(mode))
    mapRef.current?.panTo(gps.position.lat, gps.position.lon)
  }

  function toggleHeading() {
    if (headingOn) {
      setHeadingOn(false)
      return
    }
    setHeadingOn(true)
    // iOS only hands over the compass from inside the tap, so the request is made
    // here rather than left to the hook's effect.
    void compass.ask()
  }

  // ---------------------------------------------------------------- render ---

  const advice = sheet
    ? sheet.source === 'hand'
      ? 'A hand-placed Pin claims no accuracy, and the map cannot tell how far from the truth it is.'
      : averagingAdvice(sheet.samples, sheet.scatterM, gps.position?.speedMps ?? 0)
    : ''

  return (
    <section className="df-map-screen">
      <div className="df-map-wrap">
        <div ref={containerRef} className="df-map" aria-label="Field map" />
        <BasemapSwitcher current={settings.basemap.id} onChoose={settings.chooseBasemap} />
        <StatusStrip
          gps={gps}
          follow={follow}
          pinsShown={pins.length}
          unplottable={unplottableCount(finds ?? [])}
          missingTiles={missingTiles}
          flash={flash}
        />
        <MapControls
          canLog={offered !== null}
          onLogFind={() => setSheet(offered)}
          placing={tapMode.kind === 'placing'}
          onAddPinByHand={addPinByHand}
          onRecenter={recenter}
          recenterEnabled={recenterIsUseful(follow, mapRef.current?.view ?? null, gps.position)}
          headingOn={headingOn}
          onToggleHeading={toggleHeading}
          compassAsk={headingOn && compass.needed}
        />
        {card && (
          <PinCard
            card={card}
            photoUrl={photoUrl}
            moving={tapMode.kind === 'moving' && tapMode.findId === card.findId}
            onMove={startMovePin}
            onCancelMove={cancelTapMode}
            onClose={() => {
              setSelectedId(null)
              cancelTapMode()
            }}
          />
        )}
        {sheet && <LogPinSheet pin={sheet} advice={advice} onConfirm={logFindHere} onCancel={() => setSheet(null)} />}
        {(tapMode.kind === 'placing' || gps.status === 'denied' || (gps.position !== null && gps.stale)) && (
          <div className="df-hints">
            {tapMode.kind === 'placing' && <p className="df-hint">Tap the map where the Find was.</p>}
            {gps.status === 'denied' && (
              <p className="df-hint df-hint-bad">
                Location is switched off for this app. The map still shows every Pin; Log find needs a fix, or use Add
                pin by hand.
              </p>
            )}
            {gps.position !== null && gps.stale && (
              // R-GPS-2: a stale fix blocks the save, so the reason sits next to
              // the disabled button rather than only in the status strip.
              <p className="df-hint df-hint-warn">
                The last fix is {Math.round(gps.ageMs / 1000)} s old, so Log find is waiting for a fresher one. Add pin
                by hand works either way.
              </p>
            )}
          </div>
        )}
      </div>
      <p className="muted df-map-note">
        Zoom {MAP_MIN_ZOOM}–{MAP_MAX_ZOOM}. Pins are drawn from live data; a Find with no position is listed above rather
        than drawn in the sea.
      </p>
    </section>
  )
}
