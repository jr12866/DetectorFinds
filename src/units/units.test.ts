import { describe, expect, it } from 'vitest'

import {
  ACRE_TO_SQM,
  FT_TO_M,
  IN_TO_M,
  MI_TO_M,
  OZ_TO_G,
  YD_TO_M,
  acresToSqM,
  cToF,
  csvNumber,
  fToC,
  ftToM,
  formatAreaAcres,
  formatDepthInches,
  formatDimensionInches,
  formatDimensions,
  formatDistance,
  formatDistanceYards,
  formatWeight,
  gToOz,
  inchesToM,
  inchesToMm,
  mToInches,
  mToMi,
  mToFt,
  mToMm,
  mToYd,
  miToM,
  mmToInches,
  mmToM,
  ozToG,
  parseAreaSqM,
  parseDepthM,
  parseDimensionMm,
  parseHumanNumber,
  parseWeightG,
  parseYear,
  roundText,
  sqMToAcres,
  ydToM,
} from './units'

describe('conversion constants', () => {
  it('uses the exact international definitions, not measured approximations', () => {
    expect(IN_TO_M).toBe(0.0254)
    expect(FT_TO_M).toBe(0.3048)
    expect(YD_TO_M).toBe(0.9144)
    expect(MI_TO_M).toBe(1609.344)
    expect(ACRE_TO_SQM).toBe(4046.8564224)
    expect(OZ_TO_G).toBe(28.349523125)
  })
})

describe('conversions round trip', () => {
  it('handles length', () => {
    expect(inchesToM(6)).toBeCloseTo(0.1524, 10)
    expect(mToInches(inchesToM(6.5))).toBeCloseTo(6.5, 10)
    expect(inchesToMm(1)).toBe(25.4)
    expect(mmToInches(25.4)).toBeCloseTo(1, 10)
    expect(mmToM(1000)).toBeCloseTo(1, 10)
    expect(mToMm(1)).toBeCloseTo(1000, 10)
    expect(ftToM(1)).toBeCloseTo(0.3048, 10)
    expect(mToFt(0.3048)).toBeCloseTo(1, 10)
    expect(ydToM(100)).toBeCloseTo(91.44, 10)
    expect(mToYd(91.44)).toBeCloseTo(100, 10)
    expect(miToM(1)).toBeCloseTo(1609.344, 6)
    expect(mToMi(1609.344)).toBeCloseTo(1, 10)
  })

  it('handles area', () => {
    expect(acresToSqM(1)).toBeCloseTo(4046.8564224, 6)
    expect(sqMToAcres(4046.8564224)).toBeCloseTo(1, 8)
  })

  it('handles weight', () => {
    expect(ozToG(1)).toBeCloseTo(28.349523125, 6)
    expect(gToOz(28.349523125)).toBeCloseTo(1, 8)
  })

  it('handles temperature', () => {
    expect(cToF(0)).toBe(32)
    expect(cToF(100)).toBe(212)
    expect(fToC(32)).toBe(0)
    expect(fToC(72)).toBeCloseTo(22.222, 3)
  })
})

describe('roundText', () => {
  it('drops trailing zeros so a typed 6 comes back as 6', () => {
    expect(roundText(6, 1)).toBe('6')
    expect(roundText(6.5, 1)).toBe('6.5')
    expect(roundText(0.0776, 2)).toBe('0.08')
    expect(roundText(100, 2)).toBe('100')
    expect(roundText(100.5, 2)).toBe('100.5')
  })

  it('returns empty for a value that is not a number', () => {
    expect(roundText(NaN, 2)).toBe('')
    expect(roundText(Infinity, 2)).toBe('')
  })
})

describe('parseHumanNumber, the strict reader used by the CSV reader', () => {
  it('accepts a plain number', () => {
    expect(parseHumanNumber('6')).toBe(6)
    expect(parseHumanNumber('6.5')).toBe(6.5)
    expect(parseHumanNumber('  6  ')).toBe(6)
    expect(parseHumanNumber('.5')).toBe(0.5)
    expect(parseHumanNumber('-2.25')).toBe(-2.25)
  })

  it('understands both comma spellings but not a comma mess', () => {
    expect(parseHumanNumber('1,234.5')).toBe(1234.5)
    expect(parseHumanNumber('6,5')).toBe(6.5)
    expect(parseHumanNumber('1,2,3')).toBeNull()
  })

  it('refuses a malformed number instead of reading the digits it likes', () => {
    // Reading these as 6.5, 1 and 1 would put junk straight into the database.
    // A failed CSV row is counted against the import refusal threshold instead.
    expect(parseHumanNumber('6.5.5')).toBeNull()
    expect(parseHumanNumber('1e5')).toBeNull()
    expect(parseHumanNumber('NaN')).toBeNull()
    expect(parseHumanNumber('')).toBeNull()
    expect(parseHumanNumber('   ')).toBeNull()
    expect(parseHumanNumber('shallow')).toBeNull()
  })

  it('leaves units to the field parsers, which check what the unit is', () => {
    // The CSV column already declares the unit (depth_in), so a unit inside the
    // cell means the file is not our schema. parseDepthM is the tolerant one.
    expect(parseHumanNumber('6"')).toBeNull()
    expect(parseHumanNumber('18″')).toBeNull()
    expect(parseHumanNumber('6in')).toBeNull()
    expect(parseHumanNumber('6 in')).toBeNull()
  })

  it('refuses a feet-and-inches spelling on purpose', () => {
    // Depth is inches only (PRD §16). Reading 1'6" as 1.6 or as 18 is how a
    // hole gets recorded at the wrong depth, so the app will not guess.
    expect(parseHumanNumber(`1'6"`)).toBeNull()
    expect(parseHumanNumber("6'")).toBeNull()
    expect(parseHumanNumber('6′')).toBeNull()
    expect(parseDepthM(`1'6"`)).toBeNull()
    expect(parseDepthM('6′')).toBeNull()
  })
})

describe('depth, typed in inches and stored in metres', () => {
  it('accepts the ways a depth gets written', () => {
    expect(parseDepthM('6')).toBeCloseTo(0.1524, 10)
    expect(parseDepthM('6"')).toBeCloseTo(0.1524, 10)
    expect(parseDepthM('6 in')).toBeCloseTo(0.1524, 10)
    expect(parseDepthM('6 inches')).toBeCloseTo(0.1524, 10)
    expect(parseDepthM('6.5')).toBeCloseTo(0.1651, 10)
  })

  it('refuses blank, negative and anything with a unit it does not know', () => {
    expect(parseDepthM('')).toBeNull()
    expect(parseDepthM('shallow')).toBeNull()
    expect(parseDepthM('-6')).toBeNull()
    expect(parseDepthM('6 deep')).toBeNull()
    // 6 cm read as 6 inches is a 4x error, so an unknown unit is a refusal.
    expect(parseDepthM('6 cm')).toBeNull()
    expect(parseDepthM('6 7')).toBeNull()
  })

  it('shows depth in inches', () => {
    expect(formatDepthInches(0.1524)).toBe('6')
    expect(formatDepthInches(0.1651)).toBe('6.5')
    expect(formatDepthInches(0)).toBe('')
  })

  it('round trips a depth through the CSV number form', () => {
    // R-UNIT-4: the exported file must read back into the same stored value.
    for (const typed of ['6', '6.5', '12', '22', '0.5', '1.5', '3.25']) {
      const stored = parseDepthM(typed)
      expect(stored).not.toBeNull()
      const written = csvNumber(mToInches(stored as number), 2)
      expect(parseDepthM(written)).toBeCloseTo(stored as number, 8)
    }
  })
})

describe('weight, typed in ounces and stored in grams', () => {
  it('treats a bare number as ounces, because that is what a scale reads here', () => {
    expect(parseWeightG('0.5')).toBeCloseTo(14.1747615625, 6)
    expect(parseWeightG('0.5 oz')).toBeCloseTo(14.1747615625, 6)
    expect(parseWeightG('0.5 ounces')).toBeCloseTo(14.1747615625, 6)
  })

  it('treats an explicit g as grams', () => {
    expect(parseWeightG('14 g')).toBeCloseTo(14, 10)
    expect(parseWeightG('14 grams')).toBeCloseTo(14, 10)
  })

  it('refuses a unit it does not know', () => {
    expect(parseWeightG('14 lb')).toBeNull()
    expect(parseWeightG('heavy')).toBeNull()
  })

  it('shows ounces and grams together (R-UNIT-1)', () => {
    expect(formatWeight(2.2)).toEqual({ oz: '0.08', g: '2.2' })
    expect(formatWeight(28.349523125)).toEqual({ oz: '1', g: '28' })
    expect(formatWeight(0)).toEqual({ oz: '', g: '' })
  })

  it('round trips a weight typed in ounces', () => {
    for (const typed of ['0.5', '1', '12.25', '0.06']) {
      const stored = parseWeightG(typed)
      expect(stored).not.toBeNull()
      expect(formatWeight(stored as number).oz).toBe(typed)
    }
  })
})

describe('dimensions, typed in inches and stored in millimetres', () => {
  it('converts without rounding to whole millimetres, which would break the round trip', () => {
    expect(parseDimensionMm('1')).toBeCloseTo(25.4, 10)
    expect(parseDimensionMm('0.75')).toBeCloseTo(19.05, 10)
    expect(parseDimensionMm('1.13"')).toBeCloseTo(28.702, 6)
  })

  it('shows inches', () => {
    expect(formatDimensionInches(25.4)).toBe('1')
    expect(formatDimensionInches(0)).toBe('')
    expect(formatDimensions(25.4, 38.1, 0)).toBe('1" x 1.5"')
    expect(formatDimensions(25.4, 0, 0)).toBe('1"')
    expect(formatDimensions(0, 0, 0)).toBe('')
  })

  it('round trips a dimension typed in inches', () => {
    for (const typed of ['1', '0.75', '12.5', '1.13']) {
      const stored = parseDimensionMm(typed)
      expect(stored).not.toBeNull()
      expect(formatDimensionInches(stored as number)).toBe(typed)
    }
  })
})

describe('area, typed in acres and stored in square metres', () => {
  it('converts and shows acres', () => {
    expect(parseAreaSqM('1')).toBeCloseTo(4046.8564224, 4)
    expect(parseAreaSqM('0.5 acres')).toBeCloseTo(2023.4282112, 4)
    expect(parseAreaSqM('1 ha')).toBeNull()
    expect(formatAreaAcres(4046.8564224)).toBe('1')
    expect(formatAreaAcres(0)).toBe('')
  })

  it('round trips an area typed in acres', () => {
    for (const typed of ['1', '2.5', '40']) {
      const stored = parseAreaSqM(typed)
      expect(stored).not.toBeNull()
      expect(formatAreaAcres(stored as number)).toBe(typed)
    }
  })
})

describe('parseYear, for Date On', () => {
  it('wants four digits, so 18 is not read as 18 AD', () => {
    expect(parseYear('1892')).toBe(1892)
    expect(parseYear(' 1892 ')).toBe(1892)
    expect(parseYear('18')).toBeNull()
    expect(parseYear('1892-1895')).toBeNull()
    expect(parseYear('c. 1890')).toBeNull()
    expect(parseYear('0000')).toBeNull()
    expect(parseYear('2101')).toBeNull()
  })
})

describe('distance for display', () => {
  it('uses feet below a mile and miles above it, with no false precision', () => {
    expect(formatDistance(10)).toBe('33 ft')
    expect(formatDistance(3)).toBe('9.8 ft')
    expect(formatDistance(2000)).toBe('1.24 mi')
    expect(formatDistance(0)).toBe('')
    expect(formatDistance(-5)).toBe('')
    expect(formatDistanceYards(100)).toBe('109 yd')
  })
})

describe('csvNumber, the writer side of the round trip', () => {
  it('writes plain fixed-point numbers and blank for not recorded', () => {
    expect(csvNumber(0.1524, 4)).toBe('0.1524')
    expect(csvNumber(6, 2)).toBe('6')
    expect(csvNumber(1 / 3, 6)).toBe('0.333333')
    expect(csvNumber(1234567.891, 2)).toBe('1234567.89')
    expect(csvNumber(0, 2)).toBe('')
    expect(csvNumber(NaN, 2)).toBe('')
  })
})
