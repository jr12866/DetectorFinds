/**
 * Compass (docs/build/02 acceptance: the blue dot points the way you are facing).
 *
 * Android Chrome reports true-north heading on `deviceorientationabsolute`.
 * iOS only reports `deviceorientation` with `webkitCompassHeading`, and it
 * refuses to send anything until the user taps a button, so the caller has to
 * be able to ask.
 */
import { useEffect, useState } from 'react'
import { gpsFeed } from './position'

interface OrientationWithHeading extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

/** iOS needs a tap before it will stream the compass. Other platforms say false. */
export function compassNeedsPermission(): boolean {
  if (typeof DeviceOrientationEvent === 'undefined') return false
  return typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function'
}

export async function requestCompassPermission(): Promise<boolean> {
  const evt = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }
  if (typeof evt.requestPermission !== 'function') return true
  try {
    return (await evt.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Pull a true-north heading out of whatever the platform sent. */
export function headingFromEvent(event: OrientationWithHeading | null): number | null {
  if (!event) return null
  if (typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)) {
    // iOS gives the heading already clockwise from north, which is what we want.
    return ((event.webkitCompassHeading % 360) + 360) % 360
  }
  if (event.alpha !== null && typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    // alpha is anticlockwise from north, so flip it. Only trustworthy on the
    // absolute event, which is why the caller only passes that one here.
    return ((360 - event.alpha) % 360 + 360) % 360
  }
  return null
}

export function useCompass(active: boolean): void {
  useEffect(() => {
    if (!active || typeof window === 'undefined' || !('addEventListener' in window)) return
    const handler = (event: DeviceOrientationEvent) => {
      const heading = headingFromEvent(event as OrientationWithHeading)
      if (heading !== null) gpsFeed.setHeading(heading)
    }
    const absolute = 'ondeviceorientationabsolute' in window
    const type = absolute ? 'deviceorientationabsolute' : 'deviceorientation'
    window.addEventListener(type, handler as EventListener, { passive: true })
    return () => window.removeEventListener(type, handler as EventListener)
  }, [active])
}

/** True when the compass needs a user tap before it will report. */
export function useCompassPermissionGate(active: boolean): { needed: boolean; granted: boolean; ask: () => Promise<void> } {
  const [granted, setGranted] = useState(!compassNeedsPermission())
  useEffect(() => {
    if (active && !granted) void requestCompassPermission().then(setGranted)
  }, [active, granted])
  return {
    needed: compassNeedsPermission() && !granted,
    granted,
    ask: async () => {
      setGranted(await requestCompassPermission())
    },
  }
}
