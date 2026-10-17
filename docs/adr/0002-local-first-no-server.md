# 2. Local-first, no server, file export as the only portability path

Date: 2026-10-17
Status: Accepted

## Context

The data is the whole point of the app: years of find positions, photos and notes. A
server would add accounts, cost, and a dependency that fails in a field with no signal.
The user is a single person on a single phone and has no interest in sharing live data.

## Decision

There is no backend. The device is the only copy of the data. Portability and backup are
file exports written to the phone's storage: a full JSON+photo archive, a photo-free
archive, CSV of items, and GPX of tracks. Import replaces the whole database after a
preview.

## Consequences

- Losing or breaking the phone without a recent export loses everything. The app must
  nag about exports and make them one-handed.
- Import is replace-everything, never merge. Merging two databases is explicitly out of
  scope and the UI must say so.
- To keep a future sync possible without a rewrite, every record carries a UUIDv7 id, a
  last-modified timestamp, and deletes leave a tombstone rather than vanishing.
- Photo-free export exists so the archive can be emailed or dropped somewhere small;
  photos are the bulk of the bytes.
- "Replace everything" means a bad import is destructive, so import must show counts and
  require confirmation.
