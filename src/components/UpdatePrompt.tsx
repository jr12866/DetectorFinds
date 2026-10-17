import { useRegisterSW } from 'virtual:pwa-register/react'
import { updateToast } from '../updates/updatePrompt'
import { useSessionFlags } from '../session/useSessionFlags'

/**
 * "New version available - Refresh" (R-UPDATE-1), never offered in the middle
 * of a Session or a Track (R-UPDATE-2).
 */
export function UpdatePrompt() {
  // The hook hands back React state pairs, so dismissing means clearing them.
  // A later offer sets them true again and the toast returns on its own.
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()
  const flags = useSessionFlags()

  const toast = updateToast({
    needRefresh,
    offlineReady,
    blocked: flags.sessionOpen || flags.trackActive,
  })
  if (!toast) return null

  return (
    <div className="toast" role="status" aria-live="polite">
      <strong>{toast.title}</strong>
      <p className="toast-body">{toast.body}</p>
      <div className="toast-actions">
        {toast.actionLabel ? (
          <button className="btn primary" type="button" onClick={() => void updateServiceWorker()}>
            {toast.actionLabel}
          </button>
        ) : null}
        <button
          className="btn"
          type="button"
          onClick={() => {
            setNeedRefresh(false)
            setOfflineReady(false)
          }}
        >
          Later
        </button>
      </div>
    </div>
  )
}
