import { hrefFor } from '../router/hashRouter'
import { Placeholder } from './Placeholder'

export function SettingsScreen() {
  return (
    <>
      <a className="list-link" href={hrefFor('/settings/diagnostics')}>
        <span>
          <strong>Diagnostics</strong>
          <div className="muted">Storage, GPS, offline and permissions on this phone</div>
        </span>
        <span className="chevron" aria-hidden="true">
          &#8250;
        </span>
      </a>

      <Placeholder
        title="Settings"
        step="Steps 06, 09 and 11 fill this in"
        text="Everything you can change about how the app behaves."
        coming={[
          'Start screen, Field and Home modes, large text (step 09)',
          'Cached Areas and basemap choice (step 10)',
          'Export, import, CSV and GPX (step 11)',
          'Units are fixed: imperial on screen, SI in the database',
        ]}
      />
    </>
  )
}
