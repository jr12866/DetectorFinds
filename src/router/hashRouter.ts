/**
 * Hash routing.
 *
 * GitHub Pages cannot rewrite an unknown path back to `index.html`, and a
 * service-worker navigation fallback only helps once the worker is installed.
 * A hash path survives a hard reload of a deep link on a fresh install, which is
 * what makes `/#/finds/<id>` shareable and reloadable.
 */

/** Everything after the `#`, normalised to start with `/` and carry no query. */
export function pathFromHash(hash: string): string {
  let path = hash.startsWith('#') ? hash.slice(1) : hash
  const query = path.indexOf('?')
  if (query >= 0) path = path.slice(0, query)
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path
}

/** `#/map` — the form used in `href` attributes. */
export function hrefFor(path: string): string {
  return `#${path}`
}

export function navigate(path: string): void {
  const target = hrefFor(path)
  if (window.location.hash === target) return
  window.location.hash = target
}

export interface RouteMatch {
  path: string
  params: Record<string, string>
}

/**
 * Matches `/finds/:id` style patterns. A trailing `*` swallows the rest of the
 * path. Returns `null` when the pattern does not match.
 */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter((part) => part !== '')
  const pathParts = path.split('/').filter((part) => part !== '')
  const params: Record<string, string> = {}

  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i]
    if (expected === '*') return params
    if (i >= pathParts.length) return null
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeSafe(pathParts[i])
      continue
    }
    if (expected !== pathParts[i]) return null
  }
  if (patternParts.length !== pathParts.length) return null
  return params
}

/** First match wins, so more specific patterns go first in the table. */
export function matchFirst(
  patterns: readonly string[],
  path: string,
): RouteMatch | null {
  for (const pattern of patterns) {
    const params = matchRoute(pattern, path)
    if (params !== null) return { path: pattern, params }
  }
  return null
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
