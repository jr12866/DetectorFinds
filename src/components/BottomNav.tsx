import { activeNavPath, NAV_ITEMS } from '../router/routes'
import { hrefFor } from '../router/hashRouter'

/** Five tabs, each a 56 px tap target (R-MODE-3). */
export function BottomNav({ path }: { path: string }) {
  const active = activeNavPath(path)
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const current = item.path === active
        return (
          <a
            key={item.path}
            href={hrefFor(item.path)}
            aria-current={current ? 'page' : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d={item.icon} />
            </svg>
            <span>{item.label}</span>
          </a>
        )
      })}
    </nav>
  )
}
