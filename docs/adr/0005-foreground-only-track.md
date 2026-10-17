# 5. The Track records only while the app is in the foreground

Date: 2026-10-17
Status: Accepted

## Context

A Session's Track is meant to show where the user walked, and to be usable for
walk-the-boundary Site capture (R-SITE-2). The obvious implementation is
`watchPosition` running continuously.

That does not work in a browser. Chrome Android suspends geolocation the moment a tab or
an installed PWA goes to the background, and it does not resume it until the page is
visible again. There is no web-platform background geolocation; the relevant requests in
Chromium and Firefox remain open proposals, and the TWA helper library's own issue tracker
treats background geolocation as something that requires native code and a `postMessage`
bridge into the web layer.

So the choice is between a Track that stops when the phone sleeps, and not building this as
a PWA.

## Decision

The Track runs **only while the app is visible and the screen is awake**. It holds a screen
wake lock for the duration of a Session (R-TRACK-4) so that, in normal use, the phone sits
in a pocket or on the arm of a chair with the app open and the screen on.

When the page becomes hidden, or the wake lock is lost, the Track **pauses visibly**: the
Field strip says so, the Session record shows the gap, and resuming is explicit. Gaps are
kept as gaps. The Track is never silently interpolated across one.

The Session start sheet states plainly that the screen must stay on, that this costs
battery, and that a Track with gaps is still a useful Track.

## Consequences

- A Track is a partial record of a day, and the product must stop implying otherwise. The
  Session detail shows total recorded distance and total recorded time, not "distance
  walked".
- Battery is the user's problem to manage, and the app's job is to be honest about it:
  brightness hint, "screen will stay on", and a Session that can be stopped and restarted
  without losing anything.
- Walk-the-boundary Site capture (R-SITE-2) is only reliable with the screen on, so the
  boundary UI must show a live "recording" state and must refuse to finish a boundary that
  has a large gap in it.
- Logging a Find is unaffected: it takes a fix on demand, in the foreground, and does not
  depend on the Track at all. Losing the Track never loses a Find.
- If foreground-only tracking turns out to be unacceptable in real use — likely, since
  nobody wants a screen on for four hours — the answer is the TWA/APK wrapper with a native
  location service feeding positions to the web layer, which contradicts the "optional late
  step" framing in ADR-0001 and is a materially larger project. That decision is deferred
  until step 05 has been used in a real Session, and it is the single strongest trigger for
  reopening ADR-0001.
- Nothing in this ADR constrains Find positions. A Find's Position is a foreground fix and
  is unaffected by any of this.
