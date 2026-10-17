import { BottomNav } from './components/BottomNav'
import { CompatibilityBanner } from './components/CompatibilityBanner'
import { PersistencePrompt } from './components/PersistencePrompt'
import { UpdatePrompt } from './components/UpdatePrompt'
import { hrefFor } from './router/hashRouter'
import { matchAppRoute } from './router/routes'
import { useHashPath } from './router/useHashPath'
import { DiagnosticsScreen } from './screens/DiagnosticsScreen'
import { FindDetailScreen, FindsScreen } from './screens/FindsScreen'
import { MapScreen } from './screens/MapScreen'
import { SessionDetailScreen, SessionsScreen } from './screens/SessionsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SiteDetailScreen, SitesScreen } from './screens/SitesScreen'

/**
 * The step-00 shell: a header, one routed screen, five tabs. Nothing here is a
 * real feature screen yet - the point is that it installs, starts instantly,
 * and works in airplane mode before step 01 puts any data under it.
 */
export function App() {
  const path = useHashPath()
  const match = matchAppRoute(path)

  return (
    <div className="app">
      <header className="app-header">
        <h1>DetectorFinds</h1>
        <span className="version">v{__APP_VERSION__}</span>
      </header>

      <main className="app-main">
        <CompatibilityBanner />
        <PersistencePrompt />
        <Screen path={path} match={match} />
      </main>

      <BottomNav path={path} />
      <UpdatePrompt />
    </div>
  )
}

interface ScreenProps {
  path: string
  match: ReturnType<typeof matchAppRoute>
}

function Screen({ path, match }: ScreenProps) {
  if (!match) return <NotFound path={path} />

  switch (match.path) {
    case '/':
    case '/map':
      return <MapScreen />
    case '/finds':
      return <FindsScreen />
    case '/finds/:id':
      return <FindDetailScreen id={match.params.id ?? ''} />
    case '/sessions':
      return <SessionsScreen />
    case '/sessions/:id':
      return <SessionDetailScreen id={match.params.id ?? ''} />
    case '/sites':
      return <SitesScreen />
    case '/sites/:id':
      return <SiteDetailScreen id={match.params.id ?? ''} />
    case '/settings/diagnostics':
      return <DiagnosticsScreen />
    case '/settings':
      return <SettingsScreen />
    default:
      return <NotFound path={path} />
  }
}

/**
 * A hash path that is not in the table. Deep links are the reason for hash
 * routing, so an unknown one gets a way home rather than a blank screen.
 */
function NotFound({ path }: { path: string }) {
  return (
    <section className="card">
      <h2>Nothing at {path}</h2>
      <p className="muted">
        That address is not part of this build. It may belong to a step that has not been built
        yet.
      </p>
      <a className="btn primary" href={hrefFor('/map')}>
        Go to the map
      </a>
    </section>
  )
}
