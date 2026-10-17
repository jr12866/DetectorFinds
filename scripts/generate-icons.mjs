/*
 * Generates the app icons from scratch instead of checking in binaries.
 *
 * Deliberately dependency-free: it writes PNGs by hand (zlib deflate + CRC32)
 * and draws the shape with a signed-distance function, supersampled 3x. A
 * throwaway build tool, not app code - `npm run icons` regenerates
 * public/icons/ whenever the shape changes.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const NAVY = [15, 30, 43] // theme-color, also the app header
const GOLD = [240, 166, 60] // the pin

/* ---------------------------------- PNG ---------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(bytes) {
  let c = 0xff_ff_ff_ff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xff_ff_ff_ff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const name = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, crc])
}

/** RGBA8, non-interlaced, no filtering (filter byte 0 on every scanline). */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour + alpha
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------ the artwork ------------------------------ */

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r
}

/**
 * Signed distance to a convex polygon, winding-agnostic: nearest edge distance,
 * with the sign taken from the point-in-convex test.
 */
function sdPolygon(px, py, verts, winding) {
  let nearest = Number.POSITIVE_INFINITY
  let inside = true
  for (let i = 0; i < verts.length; i++) {
    const [ax, ay] = verts[i]
    const [bx, by] = verts[(i + 1) % verts.length]
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
    if (cross * winding < 0) inside = false
    const ex = bx - ax
    const ey = by - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey)))
    nearest = Math.min(nearest, Math.hypot(px - (ax + t * ex), py - (ay + t * ey)))
  }
  return inside ? -nearest : nearest
}

/** Positive for counter-clockwise winding in y-down coordinates. */
function orientation(verts) {
  let sum = 0
  for (let i = 0; i < verts.length; i++) {
    const [ax, ay] = verts[i]
    const [bx, by] = verts[(i + 1) % verts.length]
    sum += ax * by - bx * ay
  }
  return sum >= 0 ? 1 : -1
}

/**
 * Map pin: a circle with a triangular tail and a round hole, drawn in a
 * [-1, 1] box with y pointing down. The tail base sits inside the circle, so
 * the union reads as one silhouette with the usual pin waist.
 */
const TAIL = [
  [-0.33, 0.14],
  [0.33, 0.14],
  [0, 0.68],
]
const TAIL_WINDING = orientation(TAIL)

function pinDistance(px, py) {
  const body = sdCircle(px, py, 0, -0.12, 0.44)
  const tail = sdPolygon(px, py, TAIL, TAIL_WINDING)
  const union = Math.min(body, tail)
  return Math.max(union, -sdCircle(px, py, 0, -0.12, 0.19))
}

/**
 * @param size output edge in pixels
 * @param scale how big to draw the pin, as a fraction of its natural size
 * @param cornerRadius 0 for a full-bleed square (maskable), otherwise the
 *   rounded-corner radius; outside the corner the pixel stays transparent.
 */
function render(size, { scale, cornerRadius }) {
  const samples = 3
  // The plate is measured in the 0..1 image box, the pin in its own scaled box,
  // so each needs its own "one pixel wide" step for the antialiasing band.
  const plateStep = 1 / size
  const pinStep = 2 / (size * scale)
  const corner = cornerRadius / size
  const rgba = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const fx = (x + (sx + 0.5) / samples) / size
          const fy = (y + (sy + 0.5) / samples) / size

          // Rounded-rect plate; a full-bleed square when cornerRadius is 0.
          let plate = 1
          if (cornerRadius > 0) {
            const dx = Math.abs(fx - 0.5) - (0.5 - corner)
            const dy = Math.abs(fy - 0.5) - (0.5 - corner)
            const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - corner
            plate = Math.max(0, Math.min(1, 0.5 - outside / plateStep))
            if (plate <= 0) continue
          }

          const px = ((fx - 0.5) * 2) / scale
          const py = ((fy - 0.5) * 2) / scale
          const pin = Math.max(0, Math.min(1, 0.5 - pinDistance(px, py) / pinStep))

          r += plate * (NAVY[0] + (GOLD[0] - NAVY[0]) * pin)
          g += plate * (NAVY[1] + (GOLD[1] - NAVY[1]) * pin)
          b += plate * (NAVY[2] + (GOLD[2] - NAVY[2]) * pin)
          a += plate
        }
      }
      const n = samples * samples
      const alpha = a / n
      const out = (y * size + x) * 4
      rgba[out] = alpha > 0 ? Math.round(r / n / alpha) : 0
      rgba[out + 1] = alpha > 0 ? Math.round(g / n / alpha) : 0
      rgba[out + 2] = alpha > 0 ? Math.round(b / n / alpha) : 0
      rgba[out + 3] = Math.round(alpha * 255)
    }
  }
  return rgba
}

mkdirSync(OUT_DIR, { recursive: true })

const write = (file, size, options) => {
  const png = encodePng(size, size, render(size, options))
  writeFileSync(join(OUT_DIR, file), png)
  console.log(`${file}  ${size}x${size}  ${png.length} bytes`)
}

// Rounded navy plate with a gold pin; the corner radius scales with the icon.
write('icon-512.png', 512, { scale: 1, cornerRadius: 112 })
write('icon-192.png', 192, { scale: 1, cornerRadius: 42 })

// Maskable: full-bleed, pin shrunk to sit inside the 80% safe zone.
write('maskable-icon-512.png', 512, { scale: 0.62, cornerRadius: 0 })
