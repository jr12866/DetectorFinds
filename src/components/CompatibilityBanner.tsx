import { compatibilityBanner } from '../platform/compatBanner'
import { describePlatform, readServiceWorkerSupport } from '../platform/platform'

/** One-line warning for iOS, desktop and browsers that cannot work offline. */
export function CompatibilityBanner() {
  const report = describePlatform(
    navigator.userAgent,
    navigator.maxTouchPoints,
    readServiceWorkerSupport(navigator),
  )
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  const banner = compatibilityBanner(report, standalone)
  if (!banner) return null
  return (
    <p className={banner.tone === 'bad' ? 'banner bad' : 'banner'} role="status">
      {banner.text}
    </p>
  )
}
