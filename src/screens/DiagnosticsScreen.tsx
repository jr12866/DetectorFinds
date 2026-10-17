import { useCallback, useEffect, useRef, useState } from 'react'
import {
  collectDiagnostics,
  readBrowserSources,
  shouldRecheckServiceWorker,
} from '../diagnostics/capabilities'
import type { DiagnosticSources } from '../diagnostics/capabilities'
import { rowsToText } from '../diagnostics/format'
import { browserStringStore, createTestField } from '../diagnostics/testField'
import { setSessionOpen, setTrackActive } from '../session/sessionFlags'
import { useSessionFlags } from '../session/useSessionFlags'

const testField = createTestField(browserStringStore())

/**
 * R-FIRST-4: the screen that says whether this phone can actually be trusted
 * with the data. Everything green here means step 01 can start.
 */
export function DiagnosticsScreen() {
  const flags = useSessionFlags()
  const [sources, setSources] = useState<DiagnosticSources | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState(() => testField.read())
  const [saved, setSaved] = useState(() => testField.read())
  const recheckedRef = useRef(false)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      setSources(await readBrowserSources())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * On a first install the service worker registers after the first paint, so the
   * opening read can say "not installed" about an app that is actually fine. Wait
   * once for the registration to settle, then read again (R-FIRST-4).
   */
  useEffect(() => {
    if (recheckedRef.current) return
    if (!sources || !shouldRecheckServiceWorker(sources)) return
    recheckedRef.current = true
    const container = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
    if (!container) return
    void container.ready
      .then(() => refresh())
      .catch(() => {})
  }, [sources, refresh])

  const rows = sources
    ? collectDiagnostics({
        ...sources,
        sessionOpen: flags.sessionOpen,
        trackActive: flags.trackActive,
      })
    : []
  const dump = rowsToText(rows)

  async function requestPersistence() {
    setNotice(null)
    try {
      const granted = await navigator.storage.persist()
      setNotice(
        granted
          ? 'Persistent storage granted. The browser will not evict this app under pressure.'
          : 'The browser would not grant persistent storage. Free up space and try again.',
      )
    } catch {
      setNotice('This browser cannot ask for persistent storage.')
    }
    await refresh()
  }

  async function copyDump() {
    setNotice(null)
    try {
      await navigator.clipboard.writeText(`${dump}\n\nUser agent: ${sources?.userAgent ?? 'unknown'}`)
      setNotice('Diagnostics copied.')
    } catch {
      setNotice('Could not copy. Select the text below instead.')
    }
  }

  return (
    <>
      <section className="card">
        <h2>Diagnostics</h2>
        <p className="muted">Checks the phone can store finds, find satellites and work with no signal.</p>
        <div className="field-row">
          <button className="btn primary" type="button" onClick={() => void refresh()}>
            Re-check
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void requestPersistence()}
            disabled={!sources?.storagePersistRequestSupported || sources.storagePersisted === true}
          >
            Request persistent storage
          </button>
        </div>
        {notice ? <p className="muted">{notice}</p> : null}
        {error ? (
          <p className="banner bad">Could not read this device: {error}</p>
        ) : null}
      </section>

      <section className="card">
        <h3>Test the Session guard</h3>
        <p className="muted">
          R-UPDATE-2: an update is never applied while a Session is open. Step 05 owns the real
          flag; until then, flip it here and watch the update toast.
        </p>
        <div className="field-row">
          <button
            className="btn"
            type="button"
            aria-pressed={flags.sessionOpen}
            onClick={() => setSessionOpen(!flags.sessionOpen)}
          >
            {flags.sessionOpen ? 'Close simulated Session' : 'Simulate open Session'}
          </button>
          <button
            className="btn"
            type="button"
            aria-pressed={flags.trackActive}
            disabled={!flags.sessionOpen}
            onClick={() => setTrackActive(!flags.trackActive)}
          >
            {flags.trackActive ? 'Stop simulated Track' : 'Simulate active Track'}
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Does it survive a refresh?</h3>
        <p className="muted">
          Type something, save it, reload this page. If it is still here, the app can keep your
          data on this phone. Step 01 moves this check into the database.
        </p>
        <div className="field-row">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Any text"
            aria-label="Test value"
          />
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              testField.write(draft)
              setSaved(draft)
              setNotice(saved ? 'Saved. Reload the page to check it is still here.' : 'Saved.')
            }}
          >
            Save
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              testField.clear()
              setDraft('')
              setSaved('')
            }}
          >
            Clear
          </button>
        </div>
        <p className="muted">{saved ? `Stored value: ${saved}` : 'Nothing stored.'}</p>
      </section>

      <section className="card">
        <h3>Capabilities</h3>
        {sources ? (
          <table className="diagnostic-table">
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td className="value">
                    <span className={`status-${row.status}`}>{row.value}</span>
                    {row.note ? <div className="muted">{row.note}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Reading this device&hellip;</p>
        )}
      </section>

      <section className="card">
        <h3>Raw dump</h3>
        <div className="field-row">
          <button className="btn" type="button" onClick={() => void copyDump()}>
            Copy
          </button>
        </div>
        <textarea className="raw-diagnostics" readOnly value={dump} aria-label="Diagnostics text" />
      </section>
    </>
  )
}
