/**
 * The parts drawn on top of the Field map (step 02 build items 2, 4, 6, 7, 8,
 * 11, 13). Presentational only: every number here arrives already decided by a
 * tested module, so nothing in this file can be wrong about a record.
 *
 * R-MODE-3 (Field mode): tap targets at least 56 px, body text never below
 * 16 px. The controls are big because they are used with gloves in a field, and
 * the card is a panel rather than a Leaflet popup for the same reason.
 */
import { BASEMAPS, type BasemapId } from '../map/basemaps'
import { followLabel, type FollowMode } from '../map/followMode'
import type { PopupCard } from '../map/popupCard'
import type { PendingPin } from '../map/pinWrites'
import { accuracyText, fixAgeText, scatterText } from '../map/readouts'
import type { GpsState } from '../gps/position'
import { hrefFor } from '../router/hashRouter'

export function BasemapSwitcher({ current, onChoose }: { current: BasemapId; onChoose: (id: BasemapId) => void }) {
  return (
    <div className="df-basemaps" role="group" aria-label="Basemap">
      {BASEMAPS.map((basemap) => (
        <button
          key={basemap.id}
          type="button"
          className="df-basemap"
          aria-pressed={basemap.id === current}
          onClick={() => onChoose(basemap.id)}
        >
          {basemap.label}
        </button>
      ))}
    </div>
  )
}

/**
 * R-GPS-1, R-GPS-2: the accuracy figure and the fix age are on screen whenever
 * the map is open, and a fix that has gone stale says so in the same place
 * rather than in a toast the user will miss.
 */
export function StatusStrip({
  gps,
  follow,
  pinsShown,
  unplottable,
  missingTiles,
  flash,
}: {
  gps: GpsState
  follow: FollowMode
  pinsShown: number
  unplottable: number
  missingTiles: number
  flash: string
}) {
  const statusClass = gps.status === 'ok' ? 'status-ok' : gps.status === 'idle' || gps.status === 'requesting' ? 'status-info' : 'status-bad'
  const accuracy = gps.position ? accuracyText(gps.position.accuracyM) : ''
  return (
    <div className="df-status" role="status" aria-live="polite">
      {flash && <span className="df-status-item df-status-flash">{flash}</span>}
      <span className={`df-status-item ${statusClass}`}>
        {gps.status === 'ok' ? 'GPS' : gps.status}
        {accuracy && <span className="df-status-figure">{accuracy}</span>}
        {gps.position && <span className="df-status-figure">{fixAgeText(gps.ageMs)}</span>}
      </span>
      {gps.position && gps.samples > 0 && (
        <span className="df-status-item">
          {gps.samples} fixes
          {scatterText(gps.scatterM) && <span className="df-status-figure">{scatterText(gps.scatterM)}</span>}
        </span>
      )}
      <span className="df-status-item">
        {pinsShown} Pins
        {unplottable > 0 && <span className="df-status-figure status-warn">{unplottable} no position</span>}
      </span>
      <span className="df-status-item">{followLabel(follow, gps.position !== null)}</span>
      {missingTiles > 0 && <span className="df-status-item status-warn">{missingTiles} tiles missing</span>}
      {gps.message && gps.status !== 'ok' && <span className="df-status-item status-bad">{gps.message}</span>}
    </div>
  )
}

export function MapControls({
  canLog,
  onLogFind,
  placing,
  onAddPinByHand,
  onRecenter,
  recenterEnabled,
  headingOn,
  onToggleHeading,
  compassAsk,
}: {
  canLog: boolean
  onLogFind: () => void
  placing: boolean
  onAddPinByHand: () => void
  onRecenter: () => void
  recenterEnabled: boolean
  headingOn: boolean
  onToggleHeading: () => void
  compassAsk: boolean
}) {
  return (
    <div className="df-controls">
      <button type="button" className="btn primary df-control" onClick={onLogFind} disabled={!canLog}>
        Log find
      </button>
      <button type="button" className="btn df-control" onClick={onAddPinByHand} aria-pressed={placing}>
        {placing ? 'Tap the map' : 'Add pin by hand'}
      </button>
      <button type="button" className="btn df-control" onClick={onRecenter} disabled={!recenterEnabled}>
        Recenter
      </button>
      <button type="button" className="btn df-control" onClick={onToggleHeading} aria-pressed={headingOn}>
        {headingOn ? (compassAsk ? 'Heading: tap to allow' : 'Heading on') : 'Heading'}
      </button>
    </div>
  )
}

/**
 * The card a Pin opens (R-MAP-2). Until step 03 there is no Find editor, so the
 * card's own fields are the record, and Open goes to the raw-fields screen.
 */
export function PinCard({
  card,
  photoUrl,
  moving,
  onMove,
  onCancelMove,
  onClose,
}: {
  card: PopupCard
  photoUrl: string | null
  moving: boolean
  onMove: () => void
  onCancelMove: () => void
  onClose: () => void
}) {
  return (
    <div className="df-card" role="dialog" aria-label="Find">
      {photoUrl ? <img className="df-card-thumb" src={photoUrl} alt="" /> : <div className="df-card-thumb df-card-thumb-empty" aria-hidden="true" />}
      <div className="df-card-body">
        <strong className="df-card-title">{card.title}</strong>
        <span className="df-card-line">
          {card.categoryLabel} &middot; {card.dayOn}
        </span>
        <span className="df-card-line">{card.siteName}</span>
        <span className="df-card-line">
          {card.distanceLabel && <span>{card.distanceLabel} from you</span>}
          {card.accuracyLabel && <span className="df-card-figure">{card.accuracyLabel}</span>}
          <span className="muted">{card.positionSourceLabel}</span>
        </span>
        <span className="df-card-coords">{card.coordLabel}</span>
        <div className="df-card-actions">
          <a className="btn primary" href={hrefFor(card.openPath)}>
            Open
          </a>
          {moving ? (
            <button type="button" className="btn" onClick={onCancelMove}>
              Cancel move
            </button>
          ) : (
            <button type="button" className="btn" onClick={onMove}>
              Move pin
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        {moving && <p className="df-card-hint">Tap where the Pin should go.</p>}
      </div>
    </div>
  )
}

/**
 * R-GPS-3: the confirmation sheet. It shows the mean, the scatter and the
 * accuracy the user is being asked to accept, and the advice that came with them
 * (R-GPS-2: an offer to wait, never a block).
 */
export function LogPinSheet({
  pin,
  advice,
  onConfirm,
  onCancel,
}: {
  pin: PendingPin
  advice: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="df-sheet" role="dialog" aria-label="Log this position">
      <h2>{pin.source === 'hand' ? 'Pin placed by hand' : 'Log find here'}</h2>
      <p className="df-card-coords">{pin.lat.toFixed(6)}, {pin.lon.toFixed(6)}</p>
      <dl className="df-sheet-facts">
        <div>
          <dt>Accuracy</dt>
          <dd>{pin.source === 'hand' ? 'not claimed' : accuracyText(pin.accuracyM) || 'not reported'}</dd>
        </div>
        <div>
          <dt>Spread</dt>
          <dd>{pin.source === 'hand' ? 'n/a' : scatterText(pin.scatterM) || 'one fix only'}</dd>
        </div>
        <div>
          <dt>Fixes averaged</dt>
          <dd>{pin.source === 'hand' ? '0' : String(pin.samples)}</dd>
        </div>
        <div>
          <dt>Altitude</dt>
          <dd>{pin.altitudeM > 0 ? `${Math.round(pin.altitudeM)} m` : 'not reported'}</dd>
        </div>
      </dl>
      {advice && <p className="status-warn">{advice}</p>}
      <div className="df-card-actions">
        <button type="button" className="btn primary" onClick={onConfirm}>
          Log here
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
