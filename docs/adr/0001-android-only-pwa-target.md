# 1. Android-only PWA target

Date: 2026-10-17
Status: Accepted

## Context

The app must work in fields with no signal, store everything on the device, use GPS
continuously, and take photos. The user is on Android and is the only user. The original
framing assumed iOS, which would have imposed a hard storage ceiling and a different
camera path.

## Decision

Target Android, installed as a PWA from Chrome (Add to Home Screen). iOS and desktop must
load and must not crash, but nothing is promised to them: no background tracking, no
offline tile caching, no guaranteed camera behaviour.

A Trusted Web Activity / APK wrapper is an optional later step, not a foundation. The app
is installable as a plain PWA from day one.

## Consequences

- Offline storage can rely on IndexedDB/OPFS with a generous quota rather than the ~1 GB
  iOS ceiling, which makes the photo library and offline tile cache viable.
- Background and screen-off GPS becomes a solvable Android problem instead of an
  impossible iOS one.
- Chrome on Android is the only browser that needs testing; feature detection is still
  required for iOS so it degrades rather than dies.
- The ceiling is real: a PWA cannot run a native foreground service. If continuous
  screen-off tracking turns out to be impossible in a PWA, the answer is the TWA/APK
  wrapper (or Capacitor), not a cleverer service worker. That decision is deferred.
