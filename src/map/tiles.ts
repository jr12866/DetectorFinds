/**
 * Tile loading and tile failure (step 02 build item 3, R-MAP-11).
 *
 * Offline tile failure is the normal case for this app, not an error case. So:
 *
 * - A failed tile becomes a grey tile with a visible mark, never a white hole.
 *   Leaflet's `errorTileUrl` does that, and the mark is baked into the image so
 *   it survives a canvas draw.
 * - Exactly one retry, and only for the first failure of a tile. A 404 from
 *   USGS is permanent, and a retry storm on a phone network is how the app
 *   burns data and battery in a field.
 * - When `navigator.onLine` is false, no request is made at all: the tile is
 *   drawn as missing straight away.
 */
import { TileLayer, type Coords, type DoneCallback, type TileErrorEvent, type TileLayerOptions } from 'leaflet'
import type { Basemap } from './basemaps'
import { NO_TILE_IMAGE, RETRY_DELAY_MS, RETRY_FLAG, shouldSkipTileRequest, tileFailureAction } from './tilePolicy'

/** The failure policy lives in tilePolicy.ts, where it has a test. */
export * from './tilePolicy'

export interface TileFailureEvent {
  url: string
  z: number
  x: number
  y: number
}

export interface BasemapLayerOptions {
  /** Called once per tile that ends up missing, for the Diagnostics screen. */
  onTileMissing?: (event: TileFailureEvent) => void
}

/**
 * A TileLayer that draws USGS tiles and survives them being missing.
 *
 * `maxNativeZoom` keeps the map usable past the zoom USGS actually serves
 * (R-MAP-11): above it Leaflet re-renders the level-16 tile instead of asking
 * for tiles that return an error image.
 */
export class BasemapLayer extends TileLayer {
  private missing = 0

  constructor(basemap: Basemap, options: BasemapLayerOptions = {}) {
    super(basemap.url, {
      maxNativeZoom: basemap.maxNativeZoom,
      maxZoom: basemap.maxZoom,
      minZoom: 0,
      errorTileUrl: NO_TILE_IMAGE,
      // Tiles around the viewport are kept, which also hides the gap that
      // appears at the corners while the map is being panned.
      keepBuffer: 3,
      attribution: basemap.attribution,
    } satisfies TileLayerOptions)
    this.on('tileerror', (event: TileErrorEvent) => {
      this.missing += 1
      const tile = event.tile
      tile.classList.add('df-tile-missing')
      const alreadyRetried = tile.hasAttribute(RETRY_FLAG)
      if (tileFailureAction(alreadyRetried, typeof navigator === 'undefined' ? undefined : navigator.onLine) === 'retry') {
        // One retry, and only for a tile that has not already been retried.
        tile.setAttribute(RETRY_FLAG, '1')
        const url = this.getTileUrl(event.coords)
        window.setTimeout(() => {
          if (typeof navigator === 'undefined' || navigator.onLine !== false) tile.setAttribute('src', url)
        }, RETRY_DELAY_MS)
      } else {
        options.onTileMissing?.({
          url: this.getTileUrl(event.coords),
          z: event.coords.z,
          x: event.coords.x,
          y: event.coords.y,
        })
      }
    })
  }

  /**
   * Offline: hand back a tile that is already missing. Leaflet would otherwise
   * queue a request for every visible tile, each of which fails on its own.
   */
  override createTile(coords: Coords, done: DoneCallback): HTMLElement {
    if (shouldSkipTileRequest(typeof navigator === 'undefined' ? undefined : navigator.onLine)) {
      const offline = document.createElement('div')
      offline.className = 'leaflet-tile leaflet-tile-loaded df-tile-missing'
      offline.setAttribute('role', 'presentation')
      offline.style.backgroundImage = `url("${NO_TILE_IMAGE}")`
      window.setTimeout(() => done(undefined, offline), 0)
      return offline
    }
    return super.createTile(coords, done)
  }

  /** How many tiles have gone missing since this layer was created. */
  get missingCount(): number {
    return this.missing
  }
}

/**
 * Build the layer for a Basemap. Kept separate from the map hook so step 10 can
 * swap in a layer that reads from Cache Storage without touching the map.
 */
export function createBasemapLayer(basemap: Basemap, options: BasemapLayerOptions = {}): BasemapLayer {
  return new BasemapLayer(basemap, options)
}
