# Step 04 — Bin, deletes, and undo

**Depends on:** [03](03-find-editor-photos-and-the-15-second-flow.md).
**Ships:** a Bin, a real delete flow, and undo. Small step, deliberately placed early: it is
much better to learn that deletes are wrong while you only have test Finds in the app.
**Requirements:** R-EDIT-2, R-EDIT-3, R-EDIT-4.
**Decisions honoured:** [ADR-0002](../adr/0002-local-first-no-server.md).
**Done means:** nothing can be lost by accident, and nothing can be orphaned by accident.

## Build

1. **Soft delete everywhere.** Finds, Items, Sessions and Sites all move to the Bin instead
   of disappearing. The mechanism exists from step 01; this step wires it to the UI.
2. **Bin screen**, under Settings. Lists deleted Finds, Items, Sessions and Sites with the
   date they were deleted and how many days remain. Restore, or delete for good.
3. **30-day expiry** (R-EDIT-2): on app start, purge Bin entries older than 30 days into
   `tombstones`. Show the count purged, quietly, in Diagnostics — not as a toast.
4. **Undo** (R-EDIT-2): every destructive action shows a snackbar with Undo for a few seconds.
   Undo must work for a Find that took its Items with it.
5. **Blocked deletes** (R-EDIT-3): deleting a Site or Session that still contains Finds is
   refused. The dialog explains how many Finds are involved and offers three actions:
   re-parent them to another Site/Session, delete them too, or cancel. Re-parenting happens
   in the same dialog, with a picker.
6. **Cascade correctness** (R-EDIT-4): deleting a Find takes its Items and its Find-level
   photos. Deleting an Item leaves the Find. Deleting a Session leaves its Finds but removes
   its Track. Deleting a Site takes its Boundaries and Permissions with it, and only after
   the Finds have been dealt with.
7. **Photo garbage collection**: a photo whose owner is in the Bin is hidden but kept; a
   photo whose owner has been purged is deleted. Report reclaimed bytes in Diagnostics.
8. **Tombstone view**: a read-only list of purged IDs in Diagnostics, so the export/import
   behaviour in step 11 can be reasoned about against real data.

## Acceptance criteria

- [ ] Deleting a Find removes it from the map, lists, and counts immediately, and it appears
      in the Bin.
- [ ] Undo restores the Find and its Items, and the pin returns to the map.
- [ ] Deleting a Site with 3 Finds is refused, and re-parenting those 3 Finds to another Site
      in the same dialog succeeds and is reflected on the map and in both Sites' counts.
- [ ] Deleting a Find takes its Items to the Bin; deleting one Item from a 3-Item Find leaves
      the Find and the other two Items.
- [ ] A Bin entry older than 30 days is purged on next start, leaves a tombstone, and its
      photos are reclaimed.
- [ ] Purging a Site's Finds, then deleting the Site, succeeds.
- [ ] No delete path can produce a Find pointing at a deleted Site or Session.

## Verify on a phone

1. Delete a Find in the field, then immediately Undo. Confirm the pin returns.
2. Delete the same Find again, close the app, reopen, restore from the Bin.
3. Try to delete a Site that has Finds. Confirm the refusal and the re-parent picker.
4. Set a Bin entry's `deletedAt` back 31 days over remote debugging, restart, and confirm it
   is purged and a tombstone exists.
5. Confirm Needs Detail counts, Site counts and map pins all agree after each of the above.

## Commit

`git commit -m "step 04: bin, soft delete with 30-day purge, undo, blocked deletes with re-parent"`
