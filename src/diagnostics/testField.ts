/**
 * The Diagnostics screen's "type something, refresh, is it still there?" field
 * (R-FIRST-4). Step 00 keeps the value in localStorage; step 01 moves the real
 * durability check to IndexedDB behind the repository layer.
 */

export interface StringStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

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

/** localStorage, guarded so a blocked or missing storage never crashes the screen. */
export function browserStringStore(): StringStore {
  try {
    const store = window.localStorage
    return {
      getItem: (key) => store.getItem(key),
      setItem: (key, value) => store.setItem(key, value),
      removeItem: (key) => store.removeItem(key),
    }
  } catch {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }
  }
}
