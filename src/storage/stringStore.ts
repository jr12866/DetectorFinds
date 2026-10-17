/**
 * The smallest stand-in for localStorage. Anything that has to survive a refresh
 * before step 01 puts a real database under the app goes through this, so the
 * rules can be tested with a Map.
 */
export interface StringStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** localStorage, guarded so blocked or missing storage never crashes a screen. */
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
