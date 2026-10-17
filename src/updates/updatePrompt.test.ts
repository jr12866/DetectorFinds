import { describe, expect, it } from 'vitest'

import { updateToast } from './updatePrompt'

describe('updateToast', () => {
  it('offers a refresh when nothing is in progress', () => {
    const toast = updateToast({ needRefresh: true, offlineReady: false, blocked: false })
    expect(toast).toEqual({
      title: 'New version available',
      body: 'Refresh to update the app.',
      actionLabel: 'Refresh',
    })
  })

  it('shows nothing at all in the middle of a Session (R-UPDATE-2)', () => {
    expect(updateToast({ needRefresh: true, offlineReady: false, blocked: true })).toBeNull()
    expect(updateToast({ needRefresh: true, offlineReady: true, blocked: true })).toBeNull()
  })

  it('announces when the app is stored for offline use', () => {
    const toast = updateToast({ needRefresh: false, offlineReady: true, blocked: false })
    expect(toast).toEqual({
      title: 'Ready to use offline',
      body: 'The app is stored on this phone.',
      actionLabel: null,
    })
  })

  it('a new version outranks the offline message', () => {
    const toast = updateToast({ needRefresh: true, offlineReady: true, blocked: false })
    expect(toast?.actionLabel).toBe('Refresh')
  })

  it('shows nothing when there is nothing to say', () => {
    expect(updateToast({ needRefresh: false, offlineReady: false, blocked: false })).toBeNull()
    expect(updateToast({ needRefresh: false, offlineReady: false, blocked: true })).toBeNull()
  })
})
