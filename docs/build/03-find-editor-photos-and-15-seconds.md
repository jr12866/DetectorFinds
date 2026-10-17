# Step 03 — Find editor, photos, and the 15-second flow

**Depends on:** [02](02-map-gps-and-the-first-pin.md).
**Ships:** the field logging flow and the Find detail screen. This is the first step where
the app does the thing it exists to do.
**Requirements:** R-FIND-2, R-FIND-3, R-FIND-4, R-PHOTO-1, R-PHOTO-2, R-PHOTO-3, R-PHOTO-4,
R-PHOTO-5, R-PHOTO-6, R-MODE-2, and the 15-second rule in PRD §5.
**Done means:** standing in a field, you go from the start screen to a logged Find with a
photo in under fifteen seconds, and the Find is still there when you get home.

## Build

1. **Field Strip** (R-MODE-2): the bottom sheet on the Field map. Big button: "Log find".
   Everything in v1 lives here.
2. **The 15-second flow.** Exactly three taps from the start screen:
   1. "Log find" — captures the averaged position, timestamp, accuracy, altitude.
   2. Camera opens (R-PHOTO-1). Shoot, accept.
   3. "Save".
   No text entry is required at any point. The Find is created as a Miss with one photo.
3. **Find detail screen.** Opens from the pin popup or from a list. Shows Position, accuracy,
   altitude, position source, Date Found, notes, photos, the Items in this Find (empty until
   step 07), and a "needs detail" badge when the Find has no notes and no Items.
4. **Notes** (R-FIND-2): a multi-line field, large tap target, and a note keypad that does
   not require the user to dismiss anything to save.
5. **Depth** (R-FIND-3): one optional numeric field in inches, with the units module parsing
   `6` and `6"` and storing metres. Deliberately not in the 15-second flow; it lives on the
   detail screen.
6. **Photo ingest** (R-PHOTO-2): on capture, re-encode to a JPEG around 1600 px on the long
   edge plus a thumbnail, store both as Blobs, discard the original. Do this off the main
   thread where possible; a 12 MP phone photo must not freeze the map.
7. **Gallery import** (R-PHOTO-1): "Add from gallery" alongside the camera button.
8. **EXIF** (R-PHOTO-3): strip all EXIF from stored Blobs, keep the capture timestamp.
9. **Photo geolocation** (R-PHOTO-4): if a gallery photo carries a GPS EXIF tag, offer "use
   this photo's location as this Find's Position", and set `positionSource: "photo"` when
   accepted.
10. **Photo management**: reorder, set the display photo, delete. A hard cap of 6 per Item
    and a soft warning past 10 on a Find (R-PHOTO-5) — the Item cap only becomes reachable in
    step 07, but enforce it here.
11. **Needs Detail** (R-FIND-4): the rule is "no notes and no Items". Surface it as a badge
    on the Find, a count on the map, and a queue screen reachable from the bottom nav.
12. **Photo viewer**: full-screen, pinch-zoom, swipe between photos of the same Find.
13. **Offline behaviour**: the whole flow must work with no network. The only thing that
    should degrade is the basemap.

## Acceptance criteria

- [ ] From a cold start on the Field map, three taps and one photo produce a saved Find.
      Timed on a real phone, repeatedly, under fifteen seconds including the camera.
- [ ] The saved Find has a position, accuracy, altitude, `positionSource: "gps"`, a
      timestamp, and one photo Blob.
- [ ] A Find saved with no photo and no notes shows the "needs detail" badge and appears in
      the Needs Detail queue.
- [ ] A 12 MP camera photo becomes a JPEG no larger than 1600 px on the long edge plus a
      thumbnail, and the stored photo has no EXIF GPS or camera metadata.
- [ ] Adding a gallery photo that carries GPS EXIF offers to move the Find's Position, and
      accepting sets `positionSource: "photo"`.
- [ ] Reordering photos and setting the display photo persists across a restart.
- [ ] The 7th photo on an Item is refused with a clear message (testable in step 07; the
      guard must exist now).
- [ ] The entire flow runs in airplane mode with no errors.
- [ ] The screen never leaves portrait, and no tap target in the flow is under 56 px.

## Verify on a phone

1. Set a stopwatch. Start on the Field map. Log a find with a photo. Stop. Repeat five times
   and write down the worst case.
2. Log one Find with no photo and no notes. Confirm the badge and the queue entry.
3. Take a photo with the phone's camera app, with location tagging on, then add it from the
   gallery to a hand-placed Find. Accept the offer to move the Position and confirm the
   source changes to `photo`.
4. Over remote debugging, inspect the stored Blobs: confirm size, dimensions, and that EXIF
   is gone.
5. Fill a Find with 11 photos and confirm the warning past 10 and the hard stop at the Item
   cap.
6. Airplane mode: repeat step 1. The camera and the save must behave identically.

## Commit

`git commit -m "step 03: find editor, photo ingest and exif handling, 15-second field flow, needs-detail queue"`
