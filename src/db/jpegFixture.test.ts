import { describe, expect, it } from 'vitest'
import { jpegAtSize, JPEG_HEIGHT_PX, JPEG_MIN_BYTES, JPEG_WIDTH_PX } from './jpegFixture'

/**
 * Every seeded photograph is the one checked-in JPEG padded with comment
 * segments, so the padding is the part that can rot. Too much of it, or in the
 * wrong place, and the store is full of bytes a decoder refuses to draw - which
 * is exactly the failure a storage estimate would not notice.
 */
describe('jpegFixture', () => {
  const sizes = [JPEG_MIN_BYTES, JPEG_MIN_BYTES + 1, 5_000, 40_000, 150_000, 200_000, 300_000]

  it('builds exactly the number of bytes asked for', () => {
    for (const size of sizes) {
      expect(jpegAtSize(size, 7).length, `${size} bytes`).toBe(size)
    }
  })

  it('keeps SOI, EOI and a marker segment between them', () => {
    for (const size of sizes) {
      const bytes = jpegAtSize(size, 11)
      expect(bytes[0]).toBe(0xff)
      expect(bytes[1]).toBe(0xd8)
      // The first thing after SOI has to be a marker segment, and here it is the
      // comment the padding is made of. Padding after the scan data instead would
      // leave a file that is a JPEG only to whatever is generous enough to read it.
      expect(bytes[2]).toBe(0xff)
      expect(bytes[3]).toBe(0xfe)
      expect(bytes[bytes.length - 2]).toBe(0xff)
      expect(bytes[bytes.length - 1]).toBe(0xd9)
    }
  })

  it('makes each photo its own bytes at the same size', () => {
    const one = jpegAtSize(40_000, 1)
    const two = jpegAtSize(40_000, 2)
    expect(one.length).toBe(two.length)
    expect(one).not.toEqual(two)
  })

  it('declares the dimensions of the photograph it contains', () => {
    // SOF0 carries the height then the width, big-endian, after its length field.
    const bytes = jpegAtSize(JPEG_MIN_BYTES, 3)
    const sof = indexOfMarker(bytes, 0xc0)
    expect(sof).toBeGreaterThan(0)
    expect(uint16(bytes, sof + 5)).toBe(JPEG_HEIGHT_PX)
    expect(uint16(bytes, sof + 7)).toBe(JPEG_WIDTH_PX)
  })

  it('refuses to make a JPEG smaller than the photograph inside it', () => {
    expect(() => jpegAtSize(JPEG_MIN_BYTES - 1, 1)).toThrow(/smaller|needs/)
  })
})

function indexOfMarker(bytes: Uint8Array, marker: number): number {
  for (let at = 2; at < bytes.length - 1; at += 1) {
    if (bytes[at] === 0xff && bytes[at + 1] === marker) return at
  }
  return -1
}

function uint16(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 8) | bytes[at + 1]
}
