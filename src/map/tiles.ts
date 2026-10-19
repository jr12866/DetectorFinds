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

/**
 * 256x256 grey tile with a hatch and a dashed frame, as a data URI so it costs
 * no request and cannot itself fail to load.
 */
export const NO_TILE_IMAGE =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<rect width="256" height="256" fill="#d8d8d2"/>
<g stroke="#c2c2ba" stroke-width="6">
<path d="M-64 64 L64 -64 M-64 192 L192 -64 M-64 320 L320 -64 M64 320 L320 64 M192 320 L320 192"/>
</g>
<rect x="10" y="10" width="236" height="236" fill="none" stroke="#9b9b92" stroke-width="3" stroke-dasharray="14 10"/>
<text x="128" y="136" font-family="system-ui, sans-serif" font-size="26" fill="#6f6f66" text-anchor="middle">no tile</text>
</svg>`,
  )

/** Marks a tile as already retried, so a tile is never asked for twice. */
const RETRY_FLAG = 'dfTileRetried'

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
 * (R-MAP-10): above it Leaflet re-renders the level-16 tile instead of asking
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
      // appears at the corners when the view is rotated by the heading toggle.
      keepBuffer: 3,
      attribution: basemap.attribution,
    } satisfies TileLayerOptions)
    this.on('tileerror', (event: TileErrorEvent) => {
      this.missing += 1
      const tile = event.tile
      tile.classList.add('df-tile-missing')
      if (!tile.hasAttribute(RETRY_FLAG)) {
        // One retry, and only for a tile that has not already been retried.
        tile.setAttribute(RETRY_FLAG, '1')
        const url = this.getTileUrl(event.coords)
        window.setTimeout(() => {
          if (typeof navigator === 'undefined' || navigator.onLine !== false) tile.setAttribute('src', url)
        }, 400)
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
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
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
