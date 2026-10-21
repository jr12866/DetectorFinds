import { useEffect, useState } from 'react'
import { gpsFeed, type GpsState } from './position'

/**
 * The live GPS state for one open screen (step 02 build item 4, R-GPS-1).
 *
 * `retain` is reference counted, so the watch is alive exactly while a screen
 * holds it: the Field map opens, `watchPosition` starts; the Field map closes, it
 * stops. That is the rule the build list asks for and the rule a phone's battery
 * cares about - a background watch in a PWA is how an app becomes the reason a
 * device is warm.
 *
 * The feed publishes once a second even when no new fix arrives, which is what
 * keeps the fix-age readout honest without the screen running its own timer.
 */
export function useGpsState(): GpsState {
  const [state, setState] = useState<GpsState>(() => gpsFeed.getState())

  useEffect(() => {
    const unsubscribe = gpsFeed.subscribe(setState)
    const release = gpsFeed.retain()
    return () => {
      unsubscribe()
      release()
    }
  }, [])

  return state
}
