/**
 * The Leaflet half of the Field map (step 02 build items 1, 2, 3, 4, 6, 12).
 *
 * This is the only file in `src/map` that touches Leaflet's DOM, and it is
 * deliberately thin: it owns a map instance, a canvas Pin layer, the user's dot
 * and accuracy circle, and the move-Pin ghost, and it decides nothing about
 * records. Every rule with a number in it lives in a module that has a test
 * (`followMode`, `pinModel`, `pinStyle`, `tilePolicy`, `viewStore`,
 * `basemaps`), because none of them can be checked by reading this file.
 *
 * There is no Leaflet popup here. The card a Pin opens is rendered by the screen
 * as a panel over the map, for two reasons: a Find's note is user text and must
 * not be interpolated into an HTML string, and a Leaflet popup cannot hold a
 * 56 px tap target, which R-MODE-3 requires.
 */
import {
  circle,
  circleMarker,
  layerGroup,
  map as createLeafletMap,
  marker,
  type Circle,
  type CircleMarker,
  type LatLngTuple,
  type Map as LeafletMap,
  type Marker,
} from 'leaflet'
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, type Basemap } from './basemaps'
import { movePinIcon, pinStyle, userLocationIcon } from './pinIcon'
import { createBasemapLayer, type BasemapLayer, type TileFailureEvent } from './tiles'
import type { PinDescriptor } from './pinModel'
import type { MapView } from './viewStore'

export interface FieldMapHandlers {
  /** The user moved the map with their finger. Build item 6: this ends follow mode. */
  onUserPan: () => void
  /** The map has settled somewhere, after a pan or a zoom. */
  onViewChanged: (view: MapView) => void
  /** A Pin was tapped. */
  onPinTap: (findId: string) => void
  /** The bare map was tapped, which is how a position gets chosen by hand. */
  onMapTap: (lat: number, lon: number) => void
  /** Tiles that gave up, for the Diagnostics count. */
  onTileMissing?: (event: TileFailureEvent) => void
}

export interface FieldMapOptions {
  /** Where to open. Null means the caller will pan to the first fix. */
  view: MapView | null
  basemap: Basemap
  handlers: FieldMapHandlers
}

export function createFieldMap(container: HTMLElement, options: FieldMapOptions) {
  const { handlers } = options
  const start = options.view ?? { lat: 0, lon: 0, zoom: MAP_MIN_ZOOM }

  const map: LeafletMap = createLeafletMap(container, {
    center: [start.lat, start.lon] as LatLngTuple,
    zoom: start.zoom,
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    // Build item 1: the map must not wrap into a second copy of the world. A field
    // map that can be dragged east forever is a map that loses the user.
    worldCopyJump: false,
    // Build item 1: canvas from the start. PRD §11's ceiling is 5,000 Pins, and
    // 5,000 SVG paths in the overlay pane is what makes a phone map stutter.
    preferCanvas: true,
    zoomControl: true,
    attributionControl: true,
    // A finger-sized hit area for the zoom buttons, R-MODE-3.
    zoomSnap: 1,
    fadeAnimation: false,
  })

  let basemapLayer: BasemapLayer | null = null
  const pinsLayer = layerGroup().addTo(map)
  const pins = new Map<string, CircleMarker>()
  let userDot: Marker | null = null
  let accuracyRing: Circle | null = null
  let ghost: Marker | null = null

  /** True while this file is the one moving the map, so a pan is not read as a drag. */
  let programmatic = false

  function setBasemap(basemap: Basemap): void {
    if (basemapLayer) {
      map.removeLayer(basemapLayer)
      basemapLayer = null
    }
    basemapLayer = createBasemapLayer(basemap, { onTileMissing: handlers.onTileMissing })
    basemapLayer.addTo(map)
  }
  setBasemap(options.basemap)

  // `dragstart` only ever fires from a real pointer drag, so it needs no guard:
  // a pan this file asked for cannot end follow mode by accident.
  map.on('dragstart', () => handlers.onUserPan())
  map.on('moveend', () => {
    if (programmatic) {
      programmatic = false
      return
    }
    handlers.onViewChanged(currentView())
  })
  map.on('click', (event) => {
    if (ghost === null) return
    handlers.onMapTap(event.latlng.lat, event.latlng.lng)
  })

  function currentView(): MapView {
    const center = map.getCenter()
    return { lat: center.lat, lon: center.lng, zoom: map.getZoom() }
  }

  return {
    /** Exposed for the screen's own fit-to-Pins and recenter actions. */
    map,

    get view(): MapView {
      return currentView()
    },

    get missingTiles(): number {
      return basemapLayer?.missingCount ?? 0
    },

    setBasemap,

    /** Moves the map without it counting as the user dragging it. */
    panTo(lat: number, lon: number): void {
      if (map.getCenter().equals([lat, lon] as LatLngTuple, 0.000001)) return
      programmatic = true
      map.panTo([lat, lon] as LatLngTuple, { animate: true, duration: 0.5 })
    },

    setView(lat: number, lon: number, zoom: number): void {
      programmatic = true
      map.setView([lat, lon] as LatLngTuple, zoom, { animate: false })
    },

    fitTo(points: readonly { lat: number; lon: number }[], maxZoom = 17): void {
      if (points.length === 0) return
      if (points.length === 1) {
        this.setView(points[0].lat, points[0].lon, Math.max(maxZoom, MAP_MIN_ZOOM))
        return
      }
      const lats = points.map((point) => point.lat)
      const lons = points.map((point) => point.lon)
      programmatic = true
      map.fitBounds(
        [
          [Math.min(...lats), Math.min(...lons)],
          [Math.max(...lats), Math.max(...lons)],
        ] as LatLngTuple[],
        { maxZoom, animate: false },
      )
    },

    /**
     * Draws the Pins. Diffs by id rather than clearing the layer: on a phone a
     * live query re-runs on every write, and rebuilding 5,000 markers to change
     * one of them is the difference between a map that feels instant and one
     * that does not.
     */
    setPins(descriptors: readonly PinDescriptor[]): void {
      const seen = new Set<string>()
      for (const pin of descriptors) {
        seen.add(pin.id)
        const style = pinStyle({ categoryId: pin.categoryId, placed: pin.placed, selected: pin.selected })
        const existing = pins.get(pin.id)
        if (existing) {
          existing.setLatLng([pin.lat, pin.lon] as LatLngTuple)
          existing.setStyle(style)
          continue
        }
        const created = circleMarker([pin.lat, pin.lon] as LatLngTuple, { ...style, pane: 'overlayPane' })
        created.on('click', () => handlers.onPinTap(pin.id))
        created.addTo(pinsLayer)
        pins.set(pin.id, created)
      }
      for (const [id, layer] of pins) {
        if (seen.has(id)) continue
        pinsLayer.removeLayer(layer)
        pins.delete(id)
      }
    },

    /** The blue dot, its accuracy circle, and the heading wedge inside the dot. */
    setUser(position: { lat: number; lon: number } | null, accuracyM: number, headingDeg: number, showHeading: boolean, stale: boolean): void {
      if (position === null) {
        if (userDot) {
          map.removeLayer(userDot)
          userDot = null
        }
        if (accuracyRing) {
          map.removeLayer(accuracyRing)
          accuracyRing = null
        }
        return
      }
      const at = [position.lat, position.lon] as LatLngTuple
      if (!userDot) {
        userDot = marker(at, {
          icon: userLocationIcon(headingDeg, showHeading, stale),
          interactive: false,
          zIndexOffset: 1000,
          keyboard: false,
        })
        userDot.addTo(map)
      } else {
        userDot.setLatLng(at)
        userDot.setIcon(userLocationIcon(headingDeg, showHeading, stale))
      }
      // R-MAP-6: the accuracy circle is only drawn when the device gave an
      // accuracy. A ring of radius 0 would be an invisible claim of perfect fix.
      if (accuracyM > 0) {
        if (!accuracyRing) {
          accuracyRing = circle(at, {
            radius: accuracyM,
            color: '#1d4ed8',
            weight: 1,
            fillColor: '#1d4ed8',
            fillOpacity: stale ? 0.06 : 0.12,
            interactive: false,
          })
          accuracyRing.addTo(map)
        } else {
          accuracyRing.setLatLng(at)
          accuracyRing.setRadius(accuracyM)
          accuracyRing.setStyle({ fillOpacity: stale ? 0.06 : 0.12 })
        }
      } else if (accuracyRing) {
        map.removeLayer(accuracyRing)
        accuracyRing = null
      }
    },

    /**
     * Move Pin mode (build item 12). The ghost stays at the Pin's current
     * position while the user pans, so the Pin they are moving is visible the
     * whole time; the next tap on the bare map is the new position.
     */
    beginMovePin(lat: number, lon: number): void {
      this.endMovePin()
      ghost = marker([lat, lon] as LatLngTuple, {
        icon: movePinIcon(),
        interactive: false,
        zIndexOffset: 1100,
        keyboard: false,
      })
      ghost.addTo(map)
      map.getContainer().classList.add('df-map-moving')
    },

    endMovePin(): void {
      if (ghost) {
        map.removeLayer(ghost)
        ghost = null
      }
      map.getContainer().classList.remove('df-map-moving')
    },

    get movingPin(): boolean {
      return ghost !== null
    },

    /** Keeps the map the right size when the on-screen keyboard or a rotation changes it. */
    resize(): void {
      map.invalidateSize({ animate: false })
    },

    destroy(): void {
      pins.clear()
      map.remove()
    },
  }
}

export type FieldMap = ReturnType<typeof createFieldMap>
