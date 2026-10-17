# Step 05 — Sessions, Track, and Detectors

**Depends on:** [03](03-find-editor-photos-and-the-15-second-flow.md). Step 06 attaches Sites,
so a Session created here has no Site yet — that is allowed by the model.
**Ships:** start-hunting / stop-hunting, a recorded Track drawn behind the blue dot, the
Session log, and the Detector list.
**Requirements:** R-SESSION-1, R-SESSION-2, R-SESSION-3, R-SESSION-4, R-SESSION-5,
R-TRACK-1, R-TRACK-2, R-TRACK-3, R-TRACK-4, R-TRACK-5, R-DETECTOR-1, R-DETECTOR-2, R-MODE-4.
**Decisions honoured:** [ADR-0005](../adr/0005-foreground-only-track.md).
**Done means:** a day in the field is recorded as one Session with a Track you can look at
afterwards, and the app tells you honestly when the Track has a hole in it.

## Build

1. **Detector list**: make, model, nickname, notes. Add, edit, delete (blocked while a
   Session references it).
2. **Settings Presets**: free-text presets per Detector — a name plus a block of text. No
   structure, no fields.
3. **Start Session sheet** (R-SESSION-1): pick the Site (optional until step 06) and the
   Detector from existing entries, with inline "add new" for each. Pick a Settings Preset or
   leave it unset. Start button.
4. **Open Session state**: a persistent strip on the Field map showing elapsed time, current
   Site, and the Stop button. Every Find created while a Session is open is stamped with its
   `sessionId` (R-SESSION-2).
5. **Wake lock** (R-MODE-4): request while a Session is open, release on stop and on page
   hide. Re-request on resume. Diagnostics shows whether the lock is currently held.
6. **Track recording** (R-TRACK-1): sample every 3 s or 5 m while a Session is open, store
   `lat, lon, accuracyM, altitudeM, speedMps, recordedAt, seq, gapBefore`. Never interpolate.
7. **Track drawing**: a live line behind the blue dot, drawn on the canvas layer. Old
   Sessions' Tracks are faint and off by default below zoom 13 (R-TRACK-4).
8. **Background pause** (R-TRACK-2): on `visibilitychange` to hidden, stop recording and mark
   the gap. On return, resume and mark another gap. The strip must say **"Track paused"** in
   a way that is impossible to miss, and the Session detail must list every pause with its
   duration.
9. **Nag** (R-SESSION-4): if the user has moved more than a threshold distance with no open
   Session, prompt to start one and offer to backdate the start. Backdating only sets
   `startedAt`; it does not invent a Track.
10. **Session detail screen**: Site, Detector, Settings Preset name, start/stop times,
    recorded time, recorded distance labelled **"recorded distance"** (R-TRACK-3), pause
    list, Find count, notes, and the Track on a map.
11. **Session list** in the bottom nav: newest first, with Find counts.
12. **Re-assignment** (R-EDIT-1): move a Find between Sessions and between Sites from the
    Find detail screen.
13. **Track point volume guard**: warn when a Session exceeds a large point count and offer
    to thin the display, never the stored data (R-TRACK-5).

## Acceptance criteria

- [ ] Starting a Session stamps every subsequent Find with that `sessionId`, and the Session
      detail lists them.
- [ ] A Find created before the Session started is not swept into it.
- [ ] Backgrounding the app for 60 s produces exactly one gap, the strip shows "Track paused"
      on return, and the Session detail reports the pause duration.
- [ ] The Track on disk contains no interpolated points: point count matches the number of
      real fixes.
- [ ] Recorded distance for a known mock walk matches the expected value within the sampling
      tolerance, and the label says "recorded distance".
- [ ] The wake lock is held while a Session is open and released after stopping, as reported
      by Diagnostics.
- [ ] Moving with no open Session triggers the nag, and backdating the start sets `startedAt`
      without adding Track points.
- [ ] Deleting a Session removes its Track and leaves its Finds, which then show as
      Session-less.
- [ ] A Session with 20,000 Track points renders without dropping frames on the phone.

## Verify on a phone

1. Start a Session and walk a known loop of about 300 m. Stop. Compare recorded distance with
   the real loop length.
2. Background the app for a minute mid-walk, return, and confirm the pause is visible on the
   map as a gap and in the detail as a pause.
3. Log a Find mid-Session and confirm it appears in the Session's Find list.
4. Walk 300 m with no Session open and confirm the nag appears, then backdate the start and
   confirm no Track was invented.
5. Check Diagnostics for the wake lock state at each stage.
6. Airplane mode: repeat 1–3. The Track must record identically with no network.

## Commit

`git commit -m "step 05: sessions, foreground track with visible pauses, detectors and presets, wake lock"`
