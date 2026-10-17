export type DiagnosticStatus = 'ok' | 'warn' | 'bad' | 'info'

export interface DiagnosticRow {
  id: string
  label: string
  value: string
  status: DiagnosticStatus
  note?: string
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return 'unknown'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unit]}`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'unknown'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** One line per row, for the copy-to-clipboard block. */
export function rowsToText(rows: readonly DiagnosticRow[]): string {
  return rows
    .map((row) => {
      const note = row.note ? `  (${row.note})` : ''
      return `${row.label}: ${row.value}${note}`
    })
    .join('\n')
}
