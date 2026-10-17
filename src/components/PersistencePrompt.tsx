import { usePersistence } from '../storage/usePersistence'

/**
 * R-FIRST-3: the first-run request for permanent storage, in words a person on a
 * hillside can act on. One card, two buttons, no jargon, and it only appears
 * once - the rules for that live in shouldOfferPersistence.
 */
export function PersistencePrompt() {
  const status = usePersistence()
  if (!status.offer) return null

  return (
    <section className="banner" role="region" aria-label="Permanent storage">
      <p className="banner-title">Let DetectorFinds keep your finds</p>
      <p className="banner-body">
        A phone deletes app data when storage gets tight. Allow this app to keep its database
        and photos for good, so a find logged today is still here next season.
      </p>
      {status.refused && (
        <p className="banner-note">
          The phone did not allow it this time. Settings, then Diagnostics, can ask again.
        </p>
      )}
      <div className="banner-actions">
        <button type="button" className="btn primary" onClick={() => void status.request()}>
          Allow
        </button>
        <button type="button" className="btn" onClick={status.dismiss}>
          Not now
        </button>
      </div>
    </section>
  )
}
