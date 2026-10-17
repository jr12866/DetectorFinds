# Step 07 — Items and classification

**Depends on:** [03](03-find-editor-photos-and-15-seconds.md),
[06](06-sites-boundaries-permissions-plss.md).
**Ships:** the thing you actually dug out of the ground. Items, the Category list, the
silver and gold flags, and Date On.
**Requirements:** R-ITEM-1, R-ITEM-2, R-ITEM-3, R-ITEM-4, R-ITEM-5, R-ITEM-6, R-ITEM-7,
R-ITEM-8, R-EDIT-1, R-UNIT-1, R-UNIT-3.
**Done means:** a Find from last weekend gains three Items, one of them a silver coin with a
Date On, and the whole thing takes less than a couple of minutes on a sofa.

## Build

1. **Item editor** as a full-screen sheet, not a dialog. Only the free-text note is
   required (R-ITEM-1).
2. **Category picker** (R-ITEM-2): the fixed extensible list from `GLOSSARY.md`, plus "add a
   Category" which writes to the user's own list. Recent Categories first.
3. **Sub-type** (R-ITEM-2): free text with autocomplete from previously entered values.
4. **Tags** (R-ITEM-3): free-text chips, autocomplete from existing Tags.
5. **Coin fields** (R-ITEM-4): country, ruler, mint mark, denomination, composition — all
   free text with autocomplete, none required.
6. **Precious metal flags** (R-ITEM-5): silver and gold booleans, each independently
   filterable. Setting either suggests a composition but never overwrites one.
7. **Date On** (R-ITEM-6): a year field plus a free-text approximation field, with a toggle
   for "exact" versus "approximate". Distinct from Date Found everywhere in the UI, and
   labelled so no user can confuse them.
8. **Physical fields** (R-ITEM-7): material, weight in oz with grams shown alongside,
   dimensions in inches with mm stored, depth in inches, condition from the fixed list,
   cleaning and conservation notes.
9. **Identified flag** (R-ITEM-8): "identified / unknown" plus a notes field.
10. **Item photos** with the hard cap of 6 (R-PHOTO-5), using the ingest pipeline from
    step 03.
11. **Item list on the Find detail**, with a compact row per Item: thumbnail, Category,
    Sub-type, Date On, silver/gold badges.
12. **Re-filing** (R-EDIT-1): move an Item between Finds. The destination picker searches by
    date, Site and notes.
13. **Needs Detail rule update**: a Find with Items but no notes is no longer "needs detail";
    a Find with no Items and no notes still is.
14. **Unit display** (R-UNIT-1, R-UNIT-3): every number in this step goes through the units
    module. Imperial in the UI, SI in the database, no exceptions.

## Acceptance criteria

- [ ] An Item can be created with only a note, and it appears correctly in every list.
- [ ] Adding a custom Category makes it available in the picker immediately and in the
      filter sheet.
- [ ] Setting the silver flag on three Items and the gold flag on two makes the filter sheet
      return exactly those sets, alone and combined.
- [ ] Date On of `1793` and Date On of `c. 1810` both display correctly, sort correctly
      against Date Found views, and survive export and re-import unchanged (test in step 11).
- [ ] Weight entered as `0.32` oz stores `9.07` g and redisplays as `0.32` oz.
- [ ] Depth entered as `6` stores `0.1524` m and redisplays as `6` in.
- [ ] Dimensions entered in inches store millimetres and redisplay in inches.
- [ ] The 7th photo on an Item is refused.
- [ ] Moving an Item from Find A to Find B updates both Finds' counts, the Needs Detail
      badges, and the Site counts.
- [ ] No screen in this step shows a metric value as the primary figure.

## Verify on a phone

1. Create a silver coin Item with country, ruler, denomination, Date On `1878`, weight in oz,
   depth in inches, and two photos. Time it.
2. Create a junk Item with only a note. Confirm both appear correctly on the Find detail.
3. Add a Category called "Relic" and use it immediately.
4. Filter the Finds list for silver-only and confirm the coin is the only result.
5. Move the coin to a different Find and confirm both Finds look right.
6. Over remote debugging, read the stored record and confirm every unit is SI.

## Commit

`git commit -m "step 07: items, categories and tags, silver and gold flags, date on, imperial field inputs"`
