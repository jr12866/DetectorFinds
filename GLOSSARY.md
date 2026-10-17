# Glossary

Language for the detector-find logging app. Use these words in code, UI copy, tests and
docs. Names in **bold** are the terms; the identifier in backticks is what it becomes in
the data model.

---

## The things being recorded

**Find** — `Find`
One recovery event at one position: one hole, dug once, at one spot. A Find is the unit
that gets a pin. It carries position, timestamp, and (optionally) a photo, a note, a
detector, and a target signal. A Find contains zero or more **Item**s.

**Item** — `Item`
A single physical object recovered from a Find: one coin, one button, one scrap nail.
Items live inside exactly one Find. A Find with several items is a "multi".

**Miss** — `Find` with zero Items
A hole dug and nothing found. A first-class record, not a special case: the Find exists,
its pin is drawn, and it answers "have I dug here before?". Never modelled as a nullable
flag on a Find or as a separate entity.

**Date Found** — `foundAt`
The UTC instant the **Find** happened, plus the local UTC offset at that moment. One
instant per Find; every **Item** in it shares it.

## Classification and description

**Category** — `category`
The fixed list every **Item** is filed under: coin, button, buckle, jewellery, military,
toy, tool, hardware, token, medal, pipe, clay pipe, scrap, natural, other, unknown. The
list is closed to the app but the user can add to it.

**Sub-type** — `subType`
Free text describing an **Item** more precisely than its **Category**: "wheat penny",
"shoe buckle", "musket ball".

**Tag** — `tags`
User-invented labels on an **Item**, separate from its **Category**. Categories answer
"what kind of thing is it"; Tags answer "which set of things do I care about".

**Silver flag** / **Gold flag** — `isSilver`, `isGold`
Yes / no / unknown on an **Item**. Filterable, and drawn on the map and in lists, because
"show me the silver" is asked in the field, not at a desk.

**Date On** — `dateOn`
The date or year stamped on an **Item** — the Roman emperor, the mint year, "1943". The
US hobby calls these "date finds". Approximate or exact, and may be unknown. Not to be
confused with **Date Found**.

**Depth** — `depthInches`
How deep below the surface an **Item** sat, in inches. Recorded in the field or not at
all — it cannot be recovered afterwards.

**Condition** — `condition`
How good an **Item** is, from poor to uncirculated, or unknown.

## Places

**Site** — `Site`
A patch of ground you detect over — a field, a farm, a wood — with a named **Landowner**
and a **Permission**. The thing you re-visit and the thing you report on. Holds a **Site
Boundary**.

**Site Boundary** — `boundary`
The polygon drawn around a **Site**, by tapping out corners, walking the perimeter, or
editing vertices. Defines the ground a **Permission** covers.

**Landowner** — `Landowner`
The person or entity who grants a **Permission**. Reused across Permissions and Sites
(one farmer, several fields, several agreements over the years).

**Permission** — `Permission`
A standalone agreement to detect, not a field on a Site. It names a **Landowner**, the
date granted, an optional expiry, and free-text conditions, and it applies to one or many
**Site**s. A Site keeps a history of the Permissions that have covered it. Expiry
warnings are deferred to v2.

**PLSS Reference** — `plss`
A **Site**'s US Public Land Survey System description — township, range, section, and
optional quarter-quarter. Lets ground be described precisely to a landowner and groups
Sites sitting in the same section.

**Access Notes** — `accessNotes`
Free text on a **Site** about how to get in and where to park: "gate at the north
corner, park on the track, dog in the yard".

**Ground Kind** — `groundKind`
What kind of ground a **Site** is: ploughed, pasture, lawn, woodland, beach, and so on.

**Position** — `position`
A latitude/longitude pair with an accuracy radius in metres, the fix source, and a
timestamp. Every **Find** has exactly one.

## Sessions and movement

**Session** — `Session`
One outing: a start and end time, one **Site**, one **Detector**. A calendar day — if you
move to a different **Site**, that is a new Session.

**Track** — `Track`
The continuous line of positions recorded during a **Session**. Kept forever, not
trimmed. Exportable as GPX.

**Fix** — `fix`
One GPS reading. A **Position** is built from a fix, or from several averaged fixes.

**Pin** — marker on the map for a **Find**
The map marker standing at a Find's **Position**. Tapping it opens a popup card; "Open"
in that card opens the Find.

**Placed Pin** — `positionSource: "hand"`
A **Pin** put on the map by hand instead of by GPS. A **Find** created this way has no
accuracy claim attached to it.

## Kit

**Detector** — `Detector`
The metal detector used: make, model, coil, nickname. A first-class entity, reused across
sessions, with saved **Settings Preset**s.

**Settings Preset** — `Preset`
A named set of free-text **Detector** settings (discrimination, notches, volume, …) that
can be applied to a Detector and copied to another one. A **Session** records only the
Preset's *name*, not a snapshot of its values — presets are a convenience for re-applying
settings, not a thing to analyse later.

## Photos and record-keeping

**Photo** — `Photo`
An image attached to either a **Find** or an **Item**. Find photos are the "as found at
the hole" shot and appear on the pin card; Item photos are the clean desk shots, capped
at 6 per Item for MVP. Stored re-encoded with a thumbnail; EXIF is stripped except the
capture timestamp.

**Needs Detail** — `needsDetail`
The state of a **Find** logged in the field with only the minimum record. It is visible
on the Find and drives the home-mode queue, because enrichment is a desk job that
happens later or not at all.

**Bin** — `deletedAt`
Where soft-deleted records sit for 30 days before being purged. Deleting a **Site** or
**Session** that still contains Finds is blocked until its Finds are re-parented.

## Map

**Basemap** — `basemap`
The selectable background layer: **Imagery** (USGS NAIP, the default), **Hybrid** (imagery with
topographic labels) or **Topo** (USGS topographic). All three come from USGS The National Map
and are cacheable offline. See [ADR-0004](./docs/adr/0004-leaflet-usgs-raster-basemaps.md).

**Cached Area** — `CachedArea`
A rectangle of **Basemap** tiles deliberately downloaded for offline use, normally the drawn
**Site Boundary** plus a margin. A Site's Cached Areas are what make it usable with no signal;
a Cached Area is not a backup and is safe to delete at any time.

## Using the app

**Field Mode** — `mode: "field"`
The glove-and-sunlight arrangement: map, big controls, the fewest steps needed to record a
recovery. Default for the **Start Screen**. Field Mode never shows a control under 56 px or
body text under 16 px, and never requires a long-press, hover, drag-past-an-edge or double-tap.

**Home Mode** — `mode: "home"`
The armchair arrangement: browsing, editing, enrichment, export and reports. Not a separate app
or database — the same records, differently arranged.

**Field Strip** — `FieldStrip`
The fixed strip at the bottom of the Field map holding the primary actions: Log Find, Add Pin,
Start/Stop Session. Its buttons are at least 56 px and its contents change with whether a
**Session** is open.

**Start Screen** — `startScreen`
The screen the app opens on, chosen by the user in Settings. Default: Field map.

**Track Paused** — `paused`
The state a **Track** enters when the app leaves the foreground, because Chrome Android stops
delivering positions. The pause is shown to the user and the gap is kept as a gap; positions are
never invented for it.

**Backup** — `BackupFile`
A ZIP containing a JSON dump of every store plus the photo originals. The only way data leaves
the device other than CSV and GPX.

**Rolling Backup** — `rollingBackup`
Automatic dated **Backup** files written to a folder the user picked, keeping the most recent
few. Only available where the File System Access API exists.

**Import Preview** — `ImportPreview`
The summary shown before an import is applied: what was parsed, what was rejected and why, and
the explicit statement that the current data will be replaced.

**Landowner Report** — `report`
The printable per-Site page handed to a landowner: what was found, where, a map of the
**Site Boundary** and **Pins**, and free-text notes.

**Large Text** — `largeText`
The setting that raises body text to 20 px and control text to 18 px throughout, without
changing the 56 px minimum.
