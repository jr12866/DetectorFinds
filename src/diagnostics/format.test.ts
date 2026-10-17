import { describe, expect, it } from 'vitest'

import { formatBytes, formatDateTime, rowsToText } from './format'
import type { DiagnosticRow } from './format'

describe('formatBytes', () => {
  it('shows small values in bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('steps up through the units', () => {
    expect(formatBytes(1024)).toBe('1.00 KB')
    expect(formatBytes(4_200_000)).toBe('4.01 MB')
    expect(formatBytes(120_000_000_000)).toBe('112 GB')
    expect(formatBytes(3_300_000_000_000)).toBe('3.00 TB')
  })

  it('drops the decimals once the number is big, and stops at TB', () => {
    expect(formatBytes(150_000_000)).toBe('143 MB')
    expect(formatBytes(1024 ** 5)).toBe('1024 TB')
  })

  it('says unknown rather than a made-up number', () => {
    expect(formatBytes(null)).toBe('unknown')
    expect(formatBytes(undefined)).toBe('unknown')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('unknown')
  })
})

describe('formatDateTime', () => {
  it('renders a readable local stamp', () => {
    expect(formatDateTime('2026-10-17T12:00:00.000Z')).toMatch('Oct')
  })

  it('says unknown for a missing or broken value', () => {
    expect(formatDateTime(null)).toBe('unknown')
    expect(formatDateTime(undefined)).toBe('unknown')
    expect(formatDateTime('')).toBe('unknown')
    expect(formatDateTime('not a date')).toBe('unknown')
  })
})

describe('rowsToText', () => {
  const rows: DiagnosticRow[] = [
    { id: 'a', label: 'App version', value: '0.1.0', status: 'info' },
    {
      id: 'b',
      label: 'Persistent storage',
      value: 'not granted',
      status: 'warn',
      note: 'request it before logging anything',
    },
  ]

  it('is one line per row, for pasting into a bug report', () => {
    expect(rowsToText(rows)).toBe(
      'App version: 0.1.0\nPersistent storage: not granted  (request it before logging anything)',
    )
  })

  it('is empty when there is nothing to report', () => {
    expect(rowsToText([])).toBe('')
  })
})
