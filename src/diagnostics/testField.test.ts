import { describe, expect, it } from 'vitest'

import { createTestField, TEST_VALUE_KEY, type StringStore } from './testField'

/** A stand-in for localStorage, so the durability rule is testable without a browser. */
function memoryStore(): StringStore & { dump(): Record<string, string> } {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    dump: () => Object.fromEntries(data),
  }
}

describe('createTestField', () => {
  it('reads empty when nothing has been saved', () => {
    expect(createTestField(memoryStore()).read()).toBe('')
  })

  it('keeps what was written under the documented key', () => {
    const store = memoryStore()
    createTestField(store).write('civil war token')
    expect(store.dump()).toEqual({ [TEST_VALUE_KEY]: 'civil war token' })
    expect(createTestField(store).read()).toBe('civil war token')
  })

  it('survives a simulated refresh, which is the whole point of the field', () => {
    const store = memoryStore()
    createTestField(store).write('before the reload')
    expect(createTestField(store).read()).toBe('before the reload')
  })

  it('clears the stored key, not just the text', () => {
    const store = memoryStore()
    const field = createTestField(store)
    field.write('something')
    field.clear()
    expect(store.dump()).toEqual({})
    expect(field.read()).toBe('')
  })

  it('writing an empty string clears it too, so an empty value never lingers', () => {
    const store = memoryStore()
    const field = createTestField(store)
    field.write('something')
    field.write('')
    expect(store.dump()).toEqual({})
  })

  it('uses one key so two screens see the same value', () => {
    expect(TEST_VALUE_KEY).toBe('detectorfinds.diagnostics.testValue')
  })
})
