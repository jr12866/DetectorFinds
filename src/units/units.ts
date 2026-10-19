/**
 * Units (ADR-0006, R-UNIT-1..5).
 *
 * The rule this module exists to enforce: storage is SI, display is imperial,
 * and the conversion happens here and nowhere else. No component in the app is
 * allowed to multiply by 0.0254 — if it does, the same value can drift by a
 * different rounding in two places and the CSV round-trip stops matching.
 *
 * Every `parse*` accepts what a human actually types on a phone in a field, and
 * returns null rather than NaN when the text is not a number, because "not
 * recorded" is a state the app has to be able to represent.
 */

export const IN_TO_M = 0.0254
export const OZ_TO_G = 28.349523125
export const FT_TO_M = 0.3048
export const YD_TO_M = 0.9144
export const MI_TO_M = 1609.344
export const ACRE_TO_SQM = 4046.8564224
export const MM_TO_M = 0.001

export function inchesToM(inches: number): number {
  return inches * IN_TO_M
}

export function mToInches(m: number): number {
  return m / IN_TO_M
}

export function inchesToMm(inches: number): number {
  return inches * 25.4
}

export function mmToInches(mm: number): number {
  return mm / 25.4
}

export function mmToM(mm: number): number {
  return mm * MM_TO_M
}

export function mToMm(m: number): number {
  return m / MM_TO_M
}

export function ozToG(oz: number): number {
  return oz * OZ_TO_G
}

export function gToOz(g: number): number {
  return g / OZ_TO_G
}

export function ftToM(ft: number): number {
  return ft * FT_TO_M
}

export function mToFt(m: number): number {
  return m / FT_TO_M
}

export function ydToM(yd: number): number {
  return yd * YD_TO_M
}

export function mToYd(m: number): number {
  return m / YD_TO_M
}

export function miToM(mi: number): number {
  return mi * MI_TO_M
}

export function mToMi(m: number): number {
  return m / MI_TO_M
}

export function acresToSqM(acres: number): number {
  return acres * ACRE_TO_SQM
}

export function sqMToAcres(sqm: number): number {
  return sqm / ACRE_TO_SQM
}

export function cToF(c: number): number {
  return c * 1.8 + 32
}

export function fToC(f: number): number {
  return (f - 32) / 1.8
}

/**
 * Rounds for display and drops trailing zeros, so a value the user typed as `6`
 * comes back as `6` and not `6.0`.
 */
export function roundText(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return ''
  const fixed = value.toFixed(decimals)
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
}

/** The unit word the user typed, lowercased, with quote marks removed. */
export type UnitWord = string

interface TypedNumber {
  value: number
  unit: UnitWord
}

/** A number at the start of the string, then anything else. */
const LEADING_NUMBER = /^(-?(?:\d+(?:[.,]\d+)?|\.\d+))\s*(.*)$/

/** A number once any comma spelling has been resolved. */
const PLAIN_NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/

/**
 * A feet mark, in whichever shape the phone keyboard offered it. Any of these
 * means the text mixes feet and inches, which no field in the app accepts.
 */
const FEET_MARK = /['′’]/

/**
 * `1,234.5` is one thousand two hundred thirty four and a half; `6,5` is six
 * and a half, because a European-style decimal comma is what a person reaches
 * for when the decimal point is far away on a phone keyboard. `1,2,3` is
 * neither and stays as it is, which means it is rejected.
 */
function normaliseCommas(text: string): string {
  if (!text.includes(',')) return text
  // Thousands separators, with or without a decimal point after them.
  if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) return text.replace(/,/g, '')
  // A decimal comma, only when there is nothing but digits either side of it.
  if (/^-?\d+,\d+$/.test(text)) return text.replace(',', '.')
  return text
}

/**
 * The tolerant number reader behind every parse below.
 *
 * Accepts `6`, ` 6 `, `6"`, `6in`, `6 in`, `6.5`, `.5`, `1,234.5`.
 * Rejects `1'6"` on purpose: mixing feet and inches in one field is how a depth
 * gets recorded as 18 inches when it was really 1 foot 6 (PRD §16 — depth is
 * inches only), so the app asks for inches and nothing else.
 */
function readTypedNumber(text: string): TypedNumber | null {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (trimmed === '' || FEET_MARK.test(trimmed)) return null

  const match = LEADING_NUMBER.exec(trimmed)
  if (!match) return null

  const normalised = normaliseCommas(match[1])
  if (!PLAIN_NUMBER.test(normalised)) return null
  const value = Number(normalised)
  if (!Number.isFinite(value)) return null

  const unit = match[2].replace(/["″]/g, '').trim().toLowerCase()
  return { value, unit }
}

/**
 * Reads a number where the unit is already fixed by context — the CSV column is
 * called `depth_in`, so the cell should contain a number and nothing else.
 *
 * Deliberately strict. `6.5.5`, `1e5` and `1,2,3` are broken numbers rather than
 * numbers with units, and reading them as 6.5, 1 and 1 would put junk into the
 * database, so they are refused. A cell with a unit attached is refused here
 * too; the tolerant readers are the field parsers below, because in a form the
 * unit is the only thing telling the app what the person meant.
 */
export function parseHumanNumber(text: string): number | null {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (trimmed === '') return null

  const normalised = normaliseCommas(trimmed)
  if (!PLAIN_NUMBER.test(normalised)) return null
  const value = Number(normalised)
  return Number.isFinite(value) ? value : null
}

/**
 * The units each field accepts. An unrecognised unit is a refusal rather than a
 * guess: `6 cm` in a depth box is a 4× error if the app quietly reads it as
 * inches, and a wrong depth in a landowner report is worse than no depth.
 */
const INCH_UNITS = new Set(['', 'in', 'inch', 'inches', 'in.', 'ins'])
const OUNCE_UNITS = new Set(['', 'oz', 'ounce', 'ounces', 'ozs'])
const GRAM_UNITS = new Set(['g', 'gm', 'gms', 'gram', 'grams'])
const ACRE_UNITS = new Set(['', 'ac', 'acre', 'acres'])

/** Depth in metres, from what the user typed in inches. Null means not recorded. */
export function parseDepthM(text: string): number | null {
  const parsed = readTypedNumber(text)
  if (!parsed || !INCH_UNITS.has(parsed.unit) || parsed.value < 0) return null
  return inchesToM(parsed.value)
}

/** Weight in grams, from what the user typed. Ounces unless the text says grams. */
export function parseWeightG(text: string): number | null {
  const parsed = readTypedNumber(text)
  if (!parsed || parsed.value < 0) return null
  if (GRAM_UNITS.has(parsed.unit)) return parsed.value
  if (OUNCE_UNITS.has(parsed.unit)) return ozToG(parsed.value)
  return null
}

/** A dimension in millimetres, from what the user typed in inches. */
export function parseDimensionMm(text: string): number | null {
  const parsed = readTypedNumber(text)
  if (!parsed || !INCH_UNITS.has(parsed.unit) || parsed.value < 0) return null
  return inchesToMm(parsed.value)
}

/** Area in square metres, from acres. */
export function parseAreaSqM(text: string): number | null {
  const parsed = readTypedNumber(text)
  if (!parsed || !ACRE_UNITS.has(parsed.unit) || parsed.value < 0) return null
  return acresToSqM(parsed.value)
}

/** A year on a coin. Four digits only, so "18" is not silently read as 18 AD. */
export function parseYear(text: string): number | null {
  const trimmed = String(text ?? '').trim()
  if (!/^\d{4}$/.test(trimmed)) return null
  const year = Number(trimmed)
  return year >= 1 && year <= 2100 ? year : null
}

/** Depth for display: inches, to the tenth of an inch at worst. */
export function formatDepthInches(depthM: number): string {
  if (!depthM) return ''
  return roundText(mToInches(depthM), 1)
}

/** Weight for display: both ounces and grams (R-UNIT-1). */
export function formatWeight(g: number): { oz: string; g: string } {
  if (!g) return { oz: '', g: '' }
  return { oz: roundText(gToOz(g), 2), g: roundText(g, g >= 10 ? 0 : 1) }
}

/** Dimensions for display: inches. */
export function formatDimensionInches(mm: number): string {
  if (!mm) return ''
  return roundText(mmToInches(mm), 2)
}

/** One line like `1.13" x 0.87"` for a coin, empty when nothing was measured. */
export function formatDimensions(lengthMm: number, widthMm: number, thicknessMm: number): string {
  const parts = [lengthMm, widthMm, thicknessMm]
    .map((mm) => formatDimensionInches(mm))
    .filter((part) => part !== '')
  return parts.join('" x ') + (parts.length ? '"' : '')
}

/** Area for display: acres. */
export function formatAreaAcres(sqm: number): string {
  if (!sqm) return ''
  return roundText(sqMToAcres(sqm), 2)
}

/**
 * Distance for display. Feet below a mile, miles above it, and no false
 * precision: a 40 m pin-to-pin distance is "131 ft", not "131.2336 ft".
 */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return ''
  if (m >= MI_TO_M) return `${roundText(mToMi(m), 2)} mi`
  const ft = mToFt(m)
  return `${roundText(ft, ft < 10 ? 1 : 0)} ft`
}

/** Distance in the feet-and-yards spelling a walker expects. */
export function formatDistanceYards(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return ''
  if (m >= MI_TO_M) return `${roundText(mToMi(m), 2)} mi`
  const yd = mToYd(m)
  return `${roundText(yd, yd < 10 ? 1 : 0)} yd`
}

/**
 * The two directions of one number for the CSV: the writer formats, the reader
 * parses, and the round-trip test in units.test.ts is what keeps them honest.
 * Blank means "not recorded", which is why zero is written as blank too.
 */
export function csvNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value === 0) return ''
  return roundText(value, decimals)
}
