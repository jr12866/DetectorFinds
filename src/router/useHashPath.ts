import { useEffect, useState } from 'react'
import { pathFromHash } from './hashRouter'

/** Current hash path, kept in step with back/forward and manual edits. */
export function useHashPath(): string {
  const [path, setPath] = useState(() => pathFromHash(window.location.hash))
  useEffect(() => {
    const sync = () => setPath(pathFromHash(window.location.hash))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return path
}
