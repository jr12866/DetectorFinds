# 6. Imperial on screen, metric in the database

Date: 2026-10-17
Status: Accepted

## Context

The user is in the United States and thinks in inches, ounces, feet, acres and miles
(R-UNIT-1). The platform thinks in metres: GPS gives accuracy and altitude in metres, and
Leaflet measures distances in metres. Storing the user's units directly means converting
platform values on the way in; storing metric means converting user values on the way in.

## Decision

The database stores **SI only**: metres, grams, millimetres, square metres. The display
layer converts to imperial on the way out and parses imperial on the way in. Depth is
entered and shown in inches and stored in metres; weight is shown in ounces **and** grams
and stored in grams.

The published CSV is the exception: it carries imperial column names (`depth_in`,
`weight_oz`) because the humans formatting that file are US hobbyists, and it documents the
unit in the column name rather than in a footnote.

## Consequences

- One conversion module, one place, exhaustively unit-tested. No component may multiply by
  0.03937 by hand.
- Filtering and sorting on measurements is done in metric, so a range filter never depends
  on locale.
- Rounding drift is a real risk: enter 1.5 in, store 0.0381 m, display 1.5 in. The display
  layer rounds to the precision the user typed at, and the Item editor keeps the raw string
  the user entered until it is committed.
- Because the CSV is imperial and the database is metric, the CSV writer and the CSV reader
  must be the same module's two directions, and round-tripping a file must be a test.
- Metric-only storage keeps a future unit preference setting cheap. It is not in v1.
