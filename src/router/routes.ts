import type { RouteMatch } from './hashRouter'
import { matchFirst } from './hashRouter'

export interface NavItem {
  path: string
  label: string
  /** Inline SVG path data, drawn in a 24x24 box. */
  icon: string
}

/**
 * The five tabs the shell ships with (step 00). Every one of them is a
 * placeholder until its own step arrives; the labels are the final ones.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/map',
    label: 'Map',
    icon: 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z',
  },
  {
    path: '/finds',
    label: 'Finds',
    icon: 'M4 4h16v4H4V4Zm0 6h16v4H4v-4Zm0 6h10v4H4v-4Z',
  },
  {
    path: '/sessions',
    label: 'Sessions',
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm1 9.4 4 2.3-1 1.7-4.9-2.9V7h2v5.4Z',
  },
  {
    path: '/sites',
    label: 'Sites',
    icon: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm7 2v10l4 2V10l-4-2Z',
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-1-6h2l.4 2.6 2.1.9 2-1.5 1.4 1.4-1.5 2 .9 2.1L20 11v2l-2.6.4-.9 2.1 1.5 2-1.4 1.4-2-1.5-2.1.9L12 21h-2l-.4-2.6-2.1-.9-2 1.5L4 17.6l1.5-2-.9-2.1L2 13v-2l2.6-.4.9-2.1L4 6.4 5.4 5l2 1.5 2.1-.9L11 2Z',
  },
]

/**
 * Ordered most specific first: `/settings/diagnostics` has to be tried before
 * `/settings`, and `/finds/:id` before `/finds`.
 */
export const ROUTE_PATTERNS: readonly string[] = [
  '/',
  '/map',
  '/finds/:id',
  '/finds',
  '/sessions/:id',
  '/sessions',
  '/sites/:id',
  '/sites',
  '/settings/diagnostics',
  '/settings',
]

export function matchAppRoute(path: string): RouteMatch | null {
  return matchFirst(ROUTE_PATTERNS, path)
}

/** Which tab should look pressed for a given path. */
export function activeNavPath(path: string): string {
  if (path === '/' || path === '/map') return '/map'
  for (const item of NAV_ITEMS) {
    if (item.path !== '/map' && (path === item.path || path.startsWith(`${item.path}/`))) {
      return item.path
    }
  }
  return ''
}
