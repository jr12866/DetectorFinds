/**
 * Tile failure policy, the arithmetic half (step 02 build item 3, R-MAP-11).
 *
 * `tiles.ts` cannot be imported under `environment: 'node'` because Leaflet
 * itself touches `window` while it loads, so the two decisions that matter -
 * whether to ask for a tile at all, and whether a failed tile gets its one
 * retry - live here where [rule 3](../../../docs/build/README.md) can put them
 * under test.
 */

/**
 * 256x256 grey tile with a hatch and a dashed frame, as a data URI so it costs
 * no request and cannot itself fail to load. R-MAP-11: a missing tile is grey
 * with a mark on it, never a white hole.
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
export const RETRY_FLAG = 'dfTileRetried'

/**
 * How long to wait before the one retry. Short enough to be over before the
 * user pans away, long enough that a flaky phone connection has changed state.
 */
export const RETRY_DELAY_MS = 400

/**
 * Offline means do not ask at all. Leaflet would otherwise queue a request for
 * every visible tile, each of which fails on its own and each of which the
 * phone pays for in battery.
 *
 * `undefined` is what a browser without `navigator.onLine` reports; not knowing
 * is not the same as being offline, so the request is made and fails normally.
 */
export function shouldSkipTileRequest(online: boolean | undefined): boolean {
  return online === false
}

/** What to do with a tile that just failed, given whether it has failed before. */
export type TileFailureAction = 'retry' | 'report'

/**
 * Exactly one retry per tile. A 404 from USGS is permanent, and a retry storm on
 * a phone network is how the app burns data and battery in a field; but a tile
 * lost to a moment of dropped signal is worth one more ask. Offline overrides
 * the retry, because then the second attempt is guaranteed to fail too.
 */
export function tileFailureAction(alreadyRetried: boolean, online: boolean | undefined): TileFailureAction {
  if (alreadyRetried) return 'report'
  if (shouldSkipTileRequest(online)) return 'report'
  return 'retry'
}
