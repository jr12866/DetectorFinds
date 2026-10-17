# Step 06 — Sites, Boundaries, Permissions, and PLSS

**Depends on:** [05](05-sessions-track-and-detector.md).
**Ships:** Sites as a first-class thing you can see, draw and reason about. From this step
on, every Session belongs to a Site and every Find belongs to a Site through its Session or
directly.
**Requirements:** R-SITE-1, R-SITE-2, R-SITE-3, R-SITE-4, R-SITE-5, R-MAP-11, R-EDIT-1.
**Done means:** you arrive at a field, pick the Site, see its boundary drawn on the map, and
know who to ask and what you were promised.

## Build

1. **Site entity in the UI**: name, short code, Ground Kind, Access Notes, Landowner, PLSS
   Reference (township / range / section), and the drawn Site Boundary with its computed area
   in acres.
2. **Site list** in the bottom nav, with Find counts and last-visited date.
3. **Site detail**: boundary on a map with its Pins, counts by Category, Permissions history,
   Access Notes, and the Sessions held there.
4. **Landowner list**: name, contact, notes. A Landowner can hold many Permissions across
   many Sites.
5. **Permission entity** (R-SITE-4): Landowner, date granted, optional expiry date,
   free-text conditions. Applicable to many Sites. The Site detail shows the full history,
   newest first. No expiry warnings — that is v2.
6. **Drawing the Site Boundary** (R-SITE-2), all three methods:
   - **Tap to trace**: tap vertices around the edge, close the polygon, live area readout in
     acres while drawing.
   - **Walk the boundary**: uses the Track. The recording state must be unmistakable — a
     red line being drawn, elapsed time, vertex count, live area. On stop, measure the largest
     gap between consecutive Track points; if it exceeds a threshold, **refuse the boundary**
     and say which stretch failed and why (R-SITE-2).
   - **Vertex editing**: tap a vertex to select it, then use the Delete or Add-vertex buttons
     in the editing bar; drag the selected vertex to move it. Inserting a vertex is a tap on
     an edge while in edit mode. No long-press anywhere — R-MODE-3 forbids it in Field mode
     and the walk-the-boundary editor is a Field-mode screen.
7. **Boundary geometry** via the `@turf` subset: area, point-in-polygon, validity. Reject
   self-intersecting polygons with a clear message rather than storing a broken shape.
8. **Site picker on the Start Session sheet** now becomes meaningful — wire it up.
9. **Site assignment for existing Finds**: Finds created in steps 02–05 have no Site. Give
   the Find detail a Site picker, and give the Site detail a "Finds near this Site with no
   Site" list so the backlog can be cleared.
10. **PLSS Reference** (R-SITE-5): three free-text fields. No lookup service, no validation
    against a public land database — the user types what the county records say.
11. **"Show only this Site"** (R-MAP-11): one tap from the Site detail filters the Field map
    to that Site's Pins and boundary.
12. **Ground Kind**: the fixed list from `GLOSSARY.md`, chosen from a picker.

## Acceptance criteria

- [ ] Tap-tracing a roughly square boundary produces an area within a few percent of the
      known acreage, checked against a field of known size.
- [ ] Walking a boundary with the app in the foreground closes the polygon and the area is
      within a reasonable tolerance of the real field.
- [ ] Walking a boundary, backgrounding the app for two minutes, then finishing, produces a
      refusal naming the gap — and no boundary is saved.
- [ ] A self-intersecting polygon is refused with a message that says what is wrong.
- [ ] Vertex editing: dragging, inserting and deleting a vertex all change the stored
      boundary and the recomputed area.
- [ ] A Permission granted to three Sites appears on all three, and the Site detail shows the
      full history.
- [ ] Deleting a Landowner that still has Permissions is blocked.
- [ ] Assigning a Site to an old Find updates the Site's counts, the map, and the filter
      sheet.
- [ ] "Show only this Site" filters Pins and Track to that Site in one tap, and clears in one
      tap.

## Verify on a phone

1. Walk the boundary of a field you know the acreage of. Compare the reported area.
2. Repeat, deliberately backgrounding the app once. Confirm the refusal is clear and names
   the failed stretch.
3. Tap-trace the same field from the map and compare the two areas.
4. Edit a vertex and confirm the area changes.
5. Add a Landowner, a Permission with conditions, and attach it to two Sites.
6. Assign an old Find to the new Site and confirm the counts move.

## Commit

`git commit -m "step 06: sites, boundary capture by tap and walk with gap refusal, permissions, plss reference"`
