import { useFind, useItemsOfFind, useSites } from '../db/liveQueries'
import { hrefFor } from '../router/hashRouter'
import { coordText, dayText } from '../map/readouts'
import { Placeholder } from './Placeholder'

export function FindsScreen() {
  return (
    <Placeholder
      title="Finds"
      step="Step 03 brings this screen"
      text="Every Find you have logged, newest first, with the ones still needing detail at the top."
      coming={[
        'The 15-second field log: position, timestamp, one photo',
        'Needs Detail queue for finds enriched at home',
        'Filters, search and per-Site counts in step 08',
      ]}
    />
  )
}

/**
 * The Find's raw fields (step 02 build item 11).
 *
 * This is not the Find screen — step 03 is. But the Field map's Open button has
 * to land somewhere that says something true about the record, and a readout of
 * the stored fields is the smallest honest thing that does that. Everything here
 * is read through a live query, so a Pin moved on the map is reflected the moment
 * the map writes it.
 */
export function FindDetailScreen({ id }: { id: string }) {
  const find = useFind(id)
  const items = useItemsOfFind(id)
  const sites = useSites()

  if (find === undefined) {
    return (
      <section className="card">
        <h2>Find</h2>
        <p className="muted">
          {id} is either still being read, or it is no longer in the database — a Find destroyed from the Bin leaves
          nothing behind to show.
        </p>
        <p>
          <a className="btn" href={hrefFor('/map')}>
            Back to the map
          </a>
        </p>
      </section>
    )
  }

  const site = sites?.find((entry) => entry.id === find.siteId)
  const rows: [string, string][] = [
    ['Note', find.note.trim() || '—'],
    ['Category', find.categoryId || 'Miss'],
    ['Date On', dayText(find.foundAt) || '—'],
    ['Site', site?.name ?? 'No Site'],
    ['Session', find.sessionId || 'No Session'],
    ['Position', coordText(find.lat, find.lon)],
    ['Position source', find.positionSource === 'hand' ? 'Placed by hand' : find.positionSource],
    ['Accuracy', find.accuracyM > 0 ? `${find.accuracyM.toFixed(1)} m` : 'not claimed'],
    ['Altitude', find.altitudeM > 0 ? `${Math.round(find.altitudeM)} m` : 'not reported'],
    ['Items', String(find.itemCount)],
    ['Photos', String(find.photoCount)],
    ['Needs detail', find.needsDetail ? 'yes' : 'no'],
    ['Logged at', new Date(find.createdAt).toISOString()],
    ['Last changed', new Date(find.updatedAt).toISOString()],
    ['In the Bin', find.deletedAt ? `yes, since ${new Date(find.deletedAt).toISOString()}` : 'no'],
  ]

  return (
    <section className="card">
      <h2>{find.note.trim() || (find.itemCount === 0 ? 'Miss' : 'Find')}</h2>
      <p className="muted">
        Raw fields. Step 03 replaces this screen with the editor: photos, Items, depth, and the rest of the record.
      </p>
      <table className="diagnostic-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td className="value">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Items</h3>
      {items === undefined ? (
        <p className="muted">Reading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No Items against this Find.</p>
      ) : (
        <table className="diagnostic-table">
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <th>{item.note.trim() || item.categoryId || 'Item'}</th>
                <td className="value">
                  {item.categoryId || 'uncategorised'}
                  {item.dateOnYear ? ` · ${item.dateOnYear}` : ''}
                  {item.depthM ? ` · ${item.depthM.toFixed(2)} m` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p>
        <a className="btn" href={hrefFor('/map')}>
          Back to the map
        </a>
      </p>
    </section>
  )
}
