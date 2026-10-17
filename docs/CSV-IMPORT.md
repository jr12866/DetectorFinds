# CSV Import / Export contract — schema_version 1

This is the published shape of `finds.csv`. It exists so that anyone with old records —
a spreadsheet, another app's export, a notebook typed up by hand — can format them to it.
The app's own CSV export writes exactly this file, so **export and import are the same
contract** and a round trip is a test, not a hope.

Nothing here is secret. If you find a mistake in this document, that is a bug.

---

## 1. What a file is

An import is one of:

- **`finds.csv`** on its own, or
- a **`.zip`** containing `finds.csv` and a `photos/` folder of images referenced by the
  CSV. Paths in the CSV are relative to the archive root.

Rules for the CSV itself:

- UTF-8, RFC 4180 quoting, comma-separated, one header row.
- Column order does not matter. Unknown columns are reported as a warning and ignored.
- Blank means "not recorded". Do not write `N/A`, `n/a`, `-`, `none` or `unknown`; leave
  the cell empty.
- A row is skipped (and reported) if every cell in it is empty.

## 2. The row model — read this first

**One row is one thing.** The `row_type` column says which kind:

| `row_type` | What it creates |
| --- | --- |
| `find` | A Find — one hole, one position, one date. Its `find_notes` and `find_photos` apply to the hole itself. |
| `item` | An Item recovered from the Find named in `find_ref`, plus that Find if it does not exist yet. |

Rows that share a `find_ref` describe **the same hole**. So three coins from one hole are
three `item` rows with the same `find_ref`, and you may add a `find` row for the hole's own
notes and photo.

A Find with no `item` rows is a **Miss** — a logged hole that produced nothing. That is a
complete record, not a placeholder.

`find_ref` is your key. It only has to be unique inside this file, and it is never stored:
the app generates its own ids. `1`, `A-12`, `2019-05-12-03` are all fine.

## 3. Columns

### Always required

| Column | Notes |
| --- | --- |
| `schema_version` | Integer. Must be `1` on every row. |
| `row_type` | `find` or `item`. |
| `find_ref` | Groups rows into one Find. Any text, unique within the file. |
| `lat`, `lon` | Decimal degrees, WGS84, at least 5 decimal places (~1 m). Required on every row that creates a Find. |
| `date_found` | `YYYY-MM-DD`. Required on every row that creates a Find. |

### Find columns

| Column | Notes |
| --- | --- |
| `time_found` | `HH:MM` or `HH:MM:SS`, 24-hour, local to where you were. |
| `timezone_offset` | `+HH:MM` / `-HH:MM` for that date. Optional; if omitted the time is read in your current zone. |
| `accuracy_m` | GPS accuracy in metres at the time. |
| `altitude_ft` | Altitude above mean sea level, feet. |
| `position_source` | `gps`, `photo` or `hand`. Omit to mean `gps`. |
| `find_notes` | Free text about the hole: soil, depth context, what was around it. |
| `find_photos` | Image paths, `;`-separated, relative to the archive root. |

### Site columns (repeated on every row that creates a Find)

Rows with the same `site_name` are merged into one Site.

| Column | Notes |
| --- | --- |
| `site_name` | Required if you want Sites at all. |
| `site_code` | Your short code, e.g. `WF-01`. |
| `landowner` | Name of the person who granted access. |
| `plss_township`, `plss_range`, `plss_section` | Public Land Survey System reference. Free text, e.g. `T147N`, `R02W`, `Sec 12`. |
| `ground_kind` | One of `ploughed`, `pasture`, `woodland`, `meadow`, `garden`, `beach`, `sports-field`, `other`. Anything else is kept as `other` and reported. |
| `access_notes` | Where to park, gates to avoid, what the owner asked for. |

### Session and Detector columns (repeated on every row that creates a Find)

Rows with the same `session_date` **and** `site_name` are merged into one Session.

| Column | Notes |
| --- | --- |
| `session_date` | `YYYY-MM-DD`. Omit to leave the Find unassigned to a Session. |
| `detector_make`, `detector_model`, `detector_nickname` | Merged into one Detector per make+model. |
| `detector_settings` | Free text, e.g. `Disc 4-11, notched, sens 7`. |

### Item columns (only on `item` rows)

| Column | Notes |
| --- | --- |
| `category` | One of `coin`, `token`, `jewellery`, `military`, `button`, `buckle`, `tool`, `weapon`, `religious`, `personal`, `machine-part`, `toy`, `bottle`, `lead`, `silver-roll`, `clue-bag`, `natural`, `other`. Anything else is kept as `other` and reported. |
| `sub_type` | Free text: `wheat penny`, `watch key`. |
| `tags` | `;`-separated free text. |
| `item_name` | Short display name. Optional; the app derives one if you omit it. |
| `item_notes` | Free text. This is the one field the app itself never makes mandatory, but a row with nothing in it is a thin record. |
| `coin_country`, `coin_ruler`, `coin_mint_mark`, `coin_denomination`, `coin_composition` | Free text. |
| `date_on` | The date carried by the object. `1893`, or `1890s`, or `third century`. |
| `date_on_type` | `exact` or `approx`. Omit to mean `exact` when `date_on` is a bare four-digit year, otherwise `approx`. |
| `silver`, `gold` | `yes` / `no`. Also accepts `y`, `n`, `true`, `false`, `1`, `0`. |
| `material` | Free text: `copper-nickel`, `lead`, `sterling`. |
| `weight_oz`, `weight_g` | Give one or the other. If you give both they must agree within 2%. |
| `length_mm`, `width_mm`, `thickness_mm`, `diameter_mm` | Millimetres. `diameter_mm` is for round things. |
| `depth_in` | Inches below the surface. |
| `condition` | One of `poor`, `fair`, `good`, `excellent`, `uncleaned`, `unknown`. |
| `cleaning_notes` | What was done to it, and what you would do differently. |
| `identified_unknown` | `yes` marks an Item you have worked out but that started as a puzzle. |
| `item_photos` | Image paths, `;`-separated. |

### Units

Measurements in the CSV are **imperial** (`depth_in`, `altitude_ft`, `weight_oz`) except
dimensions, which are millimetres because nobody carries a coin in inches. The app stores
everything metric internally and displays imperial; the CSV documents the unit in the
column name instead of in a footnote.

## 4. Photos

- Formats: JPEG, PNG, WebP.
- Path must exist in the archive, e.g. `photos/2019/1893-wheat.jpg`.
- More than 6 `item_photos` on one row: the first 6 are kept, the rest are reported and
  dropped.
- A referenced file that is missing is an **error**, not a warning. The row is still
  importable, but the preview says which photo will be lost.
- Photos are re-encoded to ≤1600 px JPEG on import, the same as a camera photo. EXIF is
  stripped; the capture date is kept as metadata only.

## 5. What the app does with it

1. Parse, then **validate every row** before touching the database.
2. Show a preview: counts of Finds, Misses, Items, Sites, Sessions, Detectors and photos;
   the first few rows of each; and a list of every problem, with row numbers.
3. **Replace everything.** The preview says, in plain words, that the current database will
   be deleted. There is no merge mode and there never will be.
4. Offer a safety export of the current data before proceeding.
5. Import inside one transaction. If it fails, nothing changes.

Rows that fail validation are reported and **skipped**, unless more than 5% of rows fail,
in which case the whole import is refused — a file that wrong is a mismatch, not a few
typos.

## 6. Sample

See [`examples/finds-sample.csv`](examples/finds-sample.csv) — all 52 columns, two Sites,
two Sessions, four Finds (one of them a Miss), five Items, and three photo references.
The excerpt below is a trimmed subset of that file to show the shape:

```csv
schema_version,row_type,find_ref,lat,lon,date_found,site_name,landowner,category,date_on,silver,depth_in,item_notes
1,find,WF-2019-014,39.810720,-77.230510,2019-05-18,Walnut Farm,J. Peacock,,,,,,"Heavy plough, second pass after rain."
1,item,WF-2019-014,39.810720,-77.230510,2019-05-18,Walnut Farm,J. Peacock,coin,1893,no,2.5,"Wheat penny, worn but readable date."
1,item,WF-2019-014,39.810720,-77.230510,2019-05-18,Walnut Farm,J. Peacock,button,,,,,,"Two-piece brass, shank missing."
```

## 7. Versioning

`schema_version` is a whole-file version. Adding a column is backwards compatible and does
not bump it. Removing one, renaming one, or changing what a column means does bump it, and
the app accepts the previous version for at least one full release after that.
