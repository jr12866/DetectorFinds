# Step 09 — Field and Home modes, start screen, and accessibility

**Depends on:** [08](08-lists-filters-search-stats.md).
**Ships:** the two faces of the app. This step changes almost no capability — it changes what
is visible, how big it is, and what the app opens on.
**Requirements:** R-MODE-1, R-MODE-2, R-MODE-3, R-MODE-4, R-MODE-5, R-START-1, R-START-2,
R-START-3.
**Done means:** in the field the app is one big button and a map; on the sofa it is a database.

## Build

1. **Field mode**: map, Field Strip, blue dot, "Log a find", "Start session". Nothing else.
   No search box, no filters beyond "show only this Site", no stats, no list.
2. **Home mode**: lists, filters, search, stats, editors, Settings. No live GPS watch, no
   wake lock.
3. **Mode switch** (R-MODE-2): one tap, and the map keeps its centre and zoom across the
   switch. Verify this explicitly — losing the view on every switch is the kind of small
   wrongness that makes an app feel broken.
4. **Start screen** (R-START-1, R-START-2): a Settings choice among Field map, Home map,
   Recent Finds, Needs Detail queue, Sessions list, and Stats. Default Field map. Stored in
   `meta`, applied on every cold start.
5. **One-tap reachability** (R-START-3): from whichever start screen is chosen, "Log a find"
   and "Start session" are one tap away. On non-map screens that means a persistent action
   bar, not a detour through the map.
6. **Tap target audit** (R-MODE-3): every control in Field mode is at least 56 px, body text
   is never below 16 px, and nothing in Field mode requires a long-press, hover, drag-past-an-
   edge or double-tap. Walk the app with a ruler on the screen; fix what fails.
7. **Large text toggle** (R-MODE-4): Settings switch that scales the whole UI up one step and
   persists. Implement it as a root font-size change plus a rem-based type scale, not as
   per-component overrides.
8. **Contrast pass** (R-MODE-5): the single light theme is checked for sunlight legibility —
   text against the imagery basemap, pin colours against imagery, and the "Track paused"
   state against both.
9. **Portrait lock** (R-MODE-1): confirm the manifest orientation lock holds and that no
   layout breaks if the lock is ignored on a device that refuses it.
10. **Mode-aware GPS**: the position watch runs in Field mode, stops in Home mode, and the
    transition is visible rather than silent.

## Acceptance criteria

- [ ] Changing the start screen to each of the six options and cold-restarting lands on that
      screen every time.
- [ ] From every start screen option, "Log a find" and "Start session" are reachable in one
      tap.
- [ ] Switching Field ↔ Home preserves map centre and zoom exactly.
- [ ] Every Field-mode control measures 56 px or more on the phone's screen, and no Field
      interaction requires a long-press, hover, drag-past-an-edge or double-tap.
- [ ] Large text on: no text below 16 px anywhere, no clipped labels, no horizontal scrolling,
      and the 15-second flow still completes in under 15 seconds.
- [ ] Field mode holds no GPS watch and no wake lock when the app is in Home mode.
- [ ] The app never renders a second theme and never reflows to landscape.

## Verify on a phone

1. Set the start screen to Needs Detail, kill the app, reopen. Confirm.
2. Repeat for all six options.
3. From the Stats start screen, log a find in one tap sequence and time it.
4. Switch Field → Home → Field on a map you have deliberately zoomed somewhere odd. Confirm
   the view is identical.
5. Turn on Large text and re-run step 03's 15-second timing test.
6. Walk the Field screens with a ruler over the screen and measure every control.
7. Read the popup card and the "Track paused" strip against satellite imagery in daylight.

## Commit

`git commit -m "step 09: field and home modes, configurable start screen, large text, tap-target audit"`
