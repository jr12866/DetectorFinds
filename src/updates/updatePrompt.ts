/**
 * The rules behind the update toast (R-UPDATE-1, R-UPDATE-2). Kept apart from
 * the component so the "never refresh mid-Session" rule is testable.
 */

export interface UpdateToast {
  title: string
  body: string
  /** null means there is nothing for the user to press yet. */
  actionLabel: string | null
}

export interface UpdateToastInput {
  needRefresh: boolean
  offlineReady: boolean
  /** A Session or Track is open, so a reload would lose work. */
  blocked: boolean
}

export function updateToast(input: UpdateToastInput): UpdateToast | null {
  if (input.needRefresh) {
    // R-UPDATE-2: nothing is offered while a Session or Track is open. The offer
    // is left pending, so it appears by itself once the Session closes.
    if (input.blocked) return null
    return {
      title: 'New version available',
      body: 'Refresh to update the app.',
      actionLabel: 'Refresh',
    }
  }
  if (input.offlineReady) {
    return {
      title: 'Ready to use offline',
      body: 'The app is stored on this phone.',
      actionLabel: null,
    }
  }
  return null
}
