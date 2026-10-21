import { describe, expect, it } from 'vitest'
import {
  NO_TILE_IMAGE,
  RETRY_DELAY_MS,
  RETRY_FLAG,
  shouldSkipTileRequest,
  tileFailureAction,
} from './tilePolicy'

/**
 * R-MAP-11: offline tile failure is the normal case for this app, not an error
 * case. The two rules that keep a phone usable in a field - never ask for a tile
 * you already know will fail, and never ask twice - are here.
 */
/** The data URI decoded, because the assertions below are about the drawing. */
const SVG = decodeURIComponent(NO_TILE_IMAGE.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''))

describe('the no-tile image', () => {
  it('is inline, so a missing tile cannot fail to be replaced by another missing tile', () => {
    expect(NO_TILE_IMAGE.startsWith('data:image/svg+xml')).toBe(true)
    expect(NO_TILE_IMAGE).not.toContain('http://')
    expect(NO_TILE_IMAGE).not.toContain('https://')
  })

  it('is grey with a mark on it, never a white hole', () => {
    expect(SVG).toContain('no tile')
    expect(SVG).toContain('#d8d8d2')
    // A dashed frame, so a grid of missing tiles still reads as a grid.
    expect(SVG).toContain('stroke-dasharray')
  })

  it('is a complete 256x256 svg', () => {
    expect(SVG).toContain('width="256"')
    expect(SVG).toContain('height="256"')
    expect(SVG).toContain('</svg>')
  })
})

describe('shouldSkipTileRequest', () => {
  it('asks for nothing at all when the phone says it is offline', () => {
    expect(shouldSkipTileRequest(false)).toBe(true)
  })

  it('asks as normal when online', () => {
    expect(shouldSkipTileRequest(true)).toBe(false)
  })

  it('asks when the browser cannot say, because not knowing is not being offline', () => {
    expect(shouldSkipTileRequest(undefined)).toBe(false)
  })
})

describe('tileFailureAction', () => {
  it('retries a failed tile exactly once', () => {
    expect(tileFailureAction(false, true)).toBe('retry')
    expect(tileFailureAction(true, true)).toBe('report')
  })

  it('does not retry while offline, because the second attempt is guaranteed to fail', () => {
    expect(tileFailureAction(false, false)).toBe('report')
    expect(tileFailureAction(true, false)).toBe('report')
  })

  it('reports a tile that has used its retry, which is what the Diagnostics count wants', () => {
    expect(tileFailureAction(true, undefined)).toBe('report')
  })

  it('waits long enough for a moment of dropped signal to pass, but not past a pan', () => {
    expect(RETRY_DELAY_MS).toBeGreaterThanOrEqual(200)
    expect(RETRY_DELAY_MS).toBeLessThanOrEqual(1_000)
  })

  it('marks the tile it retried with a name that cannot collide with Leaflet', () => {
    expect(RETRY_FLAG).toMatch(/^df[A-Z]/)
    expect(RETRY_FLAG).not.toContain('-')
  })
})
