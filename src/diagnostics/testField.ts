import type { StringStore } from '../storage/stringStore'

export type { StringStore }

/**
 * The Diagnostics screen's "type something, refresh, is it still there?" field
 * (R-FIRST-4). Step 00 keeps the value in localStorage; step 01 moves the real
 * durability check to IndexedDB behind the repository layer.
 */

export const TEST_VALUE_KEY = 'detectorfinds.diagnostics.testValue'

export interface TestField {
  read(): string
  write(value: string): void
  clear(): void
}

export function createTestField(store: StringStore): TestField {
  return {
    read: () => store.getItem(TEST_VALUE_KEY) ?? '',
    write: (value: string) => {
      if (value === '') store.removeItem(TEST_VALUE_KEY)
      else store.setItem(TEST_VALUE_KEY, value)
    },
    clear: () => store.removeItem(TEST_VALUE_KEY),
  }
}
