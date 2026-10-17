# Step 08 — Lists, filters, search, and stats

**Depends on:** [07](07-items-and-classification.md).
**Ships:** the Home side of the app. Everything you logged comes off the map and into a list
you can actually search.
**Requirements:** R-LIST-1, R-LIST-2, R-STATS-1, R-MAP-11.
**Done means:** three months from now you can answer "where did that silver coin from the
Miller place come from?" in under thirty seconds.

## Build

1. **Finds list** (R-LIST-1): newest first, one row per Find — display photo, Category badges,
   silver/gold badges, Site name, Session date, Item count, "needs detail" badge. Tap opens
   the Find detail.
2. **Filter sheet**, shared by the list and the map so the two can never disagree. Filters:
   Site, Session, date range, Category, silver, gold, Date On range, hide Misses. The filter
   state is one object in `meta`, applied to both surfaces.
3. **Active filter chips** above the list, each individually clearable, plus "clear all".
4. **Search** (R-LIST-2): one box, substring match over Find notes, Item notes, Site name,
   Landowner name, Category, Sub-type, Tags, and Date On. Home mode only. No fuzzy matching,
   no ranking, no stemming. Show which field matched.
5. **Sort**: Date Found is the default. Allow Date On and Site name as alternates.
6. **Grouping**: by Session, and by Site, as a toggle rather than a separate screen.
7. **Stats screen** (R-STATS-1): per-Site counts — Finds, Misses, Items, silver, gold, first
   and last find date. One Site per row, sorted by Find count. Nothing else. No charts.
8. **"Show only this Site"** from the map's filter sheet, already built in step 06, now
   reachable from the list and the stats row.
9. **Virtualised list rendering**: 5,000 rows must scroll at 60 fps on the phone. This is the
   step where the step 01 benchmarks get a real UI on top of them.
10. **Empty states** that name the thing that is missing rather than saying "no results" —
    a filter that excludes everything must say which filter.

## Acceptance criteria

- [ ] With the step 01 ceiling seeded, the Finds list scrolls smoothly and the first 100 rows
      paint in under 300 ms.
- [ ] Every filter in the sheet returns the expected set against seeded data, and each
      combination tested matches a hand-computed expectation.
- [ ] The map and the list show the same Find count for the same filter state.
- [ ] Searching a Tag, a Landowner name, and a Date On year each return the right Finds, and
      the matched field is shown.
- [ ] Search over 12,000 Items completes in under 300 ms on the phone, timed from the UI.
- [ ] Stats counts per Site match the list counts exactly, including Misses.
- [ ] A filter combination that matches nothing explains which filter is responsible.
- [ ] Search is not offered in Field mode.

## Verify on a phone

1. Seed the ceiling from Diagnostics, then open the Finds list. Scroll to the bottom.
2. Apply Site + Category + silver and compare the count against the Stats row for that Site.
3. Search for a Tag you know exists, then a Landowner name, then a Date On year.
4. Open the map, apply the same filters, and confirm the pin count matches the list count.
5. Kill and reopen; confirm the filter state persisted.

## Commit

`git commit -m "step 08: finds list, shared filter sheet, substring search, per-site stats"`
