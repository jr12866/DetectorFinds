import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDatabase } from '../schema';
import { DeleteBlockedError, NotFoundError } from '../errors';
import type { Find } from '../types';
import type { Repositories } from './index';
import { DAY, fieldLog, makeRepos, T0, type TestSetup } from './testHelpers';

/**
 * Finds: the record of one hole. The derived fields (`itemCount`, `categoryId`,
 * `needsDetail`) are the part most likely to rot, so they get the most attention
 * here — everything downstream (pin colour, the Needs Detail queue, the map) reads
 * them rather than computing anything.
 */
describe('finds repository', () => {
  let app: TestSetup
  let repos: Repositories
  // One database per test: several tests here count live Finds or read the whole
  // tombstones store, and a shared name would let sibling tests see each other's
  // rows.
  let seq = 0

  beforeEach(() => {
    app = makeRepos(`finds-${(seq += 1)}`)
    repos = app.repos
  })

  afterEach(async () => {
    app.close()
    await deleteDatabase(app.db.name)
  })

  it('creates a field log in one call and marks it Needs Detail', async () => {
    const find = await fieldLog(repos, T0);

    expect(find.foundAt).toBe(T0);
    expect(find.lat).toBe(39);
    expect(find.lon).toBe(-98);
    // A field log with no note and no items is exactly the record the queue is
    // meant to catch: logged fast, empty.
    expect(find.needsDetail).toBe(1);
    expect(find.itemCount).toBe(0);
    expect(find.deletedAt).toBe(0);

    const stored = await repos.finds.get(find.id);
    expect(stored).toBeTruthy();
    expect(stored?.id).toBe(find.id);
  });

  it('keeps a position of 0,0 rather than rejecting it, and says so in the row', async () => {
    // The repository layer does not police position: only the field-log UI knows
    // whether a fix was held. A Find at 0,0 is a visible, ugly sentinel, which is
    // better than a nullable lat that every reader has to handle.
    const find = await repos.finds.create({ foundAt: T0 });
    expect(find.lat).toBe(0);
    expect(find.lon).toBe(0);
  });

  it('defaults the position source to hand, because the repository must never claim GPS', async () => {
    const find = await repos.finds.create({ foundAt: T0, lat: 39, lon: -98 });
    expect(find.positionSource).toBe('hand');
  });

  it('clears Needs Detail once a note is written', async () => {
    const find = await fieldLog(repos, T0);
    expect(find.needsDetail).toBe(1);

    const updated = await repos.finds.update(find.id, { note: 'Silver coin, 1943, ploughed.' });
    expect(updated?.needsDetail).toBe(0);

    const stored = await repos.finds.get(find.id);
    expect(stored?.needsDetail).toBe(0);
  });

  it('clears Needs Detail once an Item is filed, even with no note', async () => {
    const find = await fieldLog(repos, T0);
    await repos.items.create(find.id, { categoryId: 'coin' });

    const stored = await repos.finds.get(find.id);
    expect(stored?.itemCount).toBe(1);
    expect(stored?.needsDetail).toBe(0);
  });

  it('puts a Find back on the Needs Detail queue when its last Item is binned', async () => {
    const find = await fieldLog(repos, T0);
    const item = await repos.items.create(find.id, { categoryId: 'coin' });
    expect((await repos.finds.get(find.id))?.needsDetail).toBe(0);

    await repos.items.softDelete(item.id);

    const stored = await repos.finds.get(find.id);
    expect(stored?.itemCount).toBe(0);
    expect(stored?.needsDetail).toBe(1);
  });

  it('keeps a Find with Items off the queue even when the note is empty', async () => {
    const find = await repos.finds.create({ foundAt: T0, lat: 39, lon: -98, note: '' });
    await repos.items.create(find.id, { categoryId: 'scrap' });

    const queue = await repos.finds.needsDetail();
    expect(queue.map((f) => f.id)).not.toContain(find.id);
  });

  it('counts Needs Detail and lists it oldest first', async () => {
    const older = await fieldLog(repos, T0);
    const newer = await fieldLog(repos, T0 + DAY);
    await repos.finds.update(newer.id, { note: 'enriched at home' });

    const queue = await repos.finds.needsDetail();
    expect(queue.map((f) => f.id)).toEqual([older.id]);
    expect(await repos.finds.countNeedsDetail()).toBe(1);
  });

  it('leaves the Bin out of the Needs Detail queue', async () => {
    const find = await fieldLog(repos, T0);
    await repos.finds.softDelete(find.id);

    expect(await repos.finds.countNeedsDetail()).toBe(0);
    expect((await repos.finds.needsDetail()).length).toBe(0);
  });

  it('soft-deletes a Find and its Items together, and restores only what it took', async () => {
    const find = await fieldLog(repos, T0);
    const item = await repos.items.create(find.id, { categoryId: 'coin' });

    await repos.finds.softDelete(find.id);

    const binnedFind = await repos.finds.get(find.id);
    expect(binnedFind?.deletedAt).toBe(T0);
    const binnedItem = await repos.items.get(item.id);
    expect(binnedItem?.deletedAt).toBe(T0);
    // The mark that makes restore honest: this Item went in the Bin because its
    // Find did, not because the user binned it by hand.
    expect(binnedItem?.cascadeDeletedFrom).toBe(find.id);

    await repos.finds.restore(find.id);

    const restored = await repos.finds.get(find.id);
    expect(restored?.deletedAt).toBe(0);
    expect((await repos.items.get(item.id))?.deletedAt).toBe(0);
    expect((await repos.items.get(item.id))?.cascadeDeletedFrom).toBe('');
  });

  it('keeps a binned Find describing the Items it went into the Bin with', async () => {
    const find = await fieldLog(repos, T0);
    await repos.items.create(find.id, { categoryId: 'coin' });
    await repos.items.create(find.id, { categoryId: 'buckle' });

    await repos.finds.softDelete(find.id);

    // The Bin row says what was found, not "Miss", and the derived fields still
    // describe the Item rows sitting underneath it.
    const binned = await repos.finds.get(find.id);
    expect(binned?.itemCount).toBe(2);
    expect(binned?.categoryId).toBe('coin');
    expect(binned?.needsDetail).toBe(0);

    await repos.finds.restore(find.id);

    const restored = await repos.finds.get(find.id);
    expect(restored?.itemCount).toBe(2);
    expect(restored?.categoryId).toBe('coin');
  });

  it('leaves a hand-binned Item in the Bin when its Find is restored', async () => {
    const find = await fieldLog(repos, T0);
    const item = await repos.items.create(find.id, { categoryId: 'coin' });

    // Binned by hand first, then the Find goes too. With a pinned clock both
    // deletes land in the same millisecond, so only cascadeDeletedFrom can tell
    // the two cases apart.
    await repos.items.softDelete(item.id);
    await repos.finds.softDelete(find.id);

    await repos.finds.restore(find.id);

    expect((await repos.finds.get(find.id))?.deletedAt).toBe(0);
    const stillBinned = await repos.items.get(item.id);
    expect(stillBinned?.deletedAt).toBe(T0);
  });

  it('purges a Find with its Items and writes tombstones for both', async () => {
    const find = await fieldLog(repos, T0);
    const item = await repos.items.create(find.id, { categoryId: 'coin' });

    await repos.finds.purge(find.id);

    expect(await repos.finds.get(find.id)).toBeUndefined();
    expect(await repos.items.get(item.id)).toBeUndefined();

    const tombstones = await app.db.tombstones.toArray();
    expect(tombstones.map((t) => t.store).sort()).toEqual(['finds', 'items']);
    expect(tombstones.map((t) => t.id).sort()).toEqual([find.id, item.id].sort());
  });

  it('purging a cascade-binned Item after its Find is a no-op, not a second tombstone', async () => {
    const find = await fieldLog(repos, T0);
    const item = await repos.items.create(find.id, { categoryId: 'coin' });

    await repos.finds.softDelete(find.id);
    await repos.finds.purge(find.id);
    // The Bin offers the cascade-binned Item as its own entry, so the user can
    // empty the Bin by hand and ask for it again. Tombstones are keyed by id, so
    // the second attempt overwrites rather than duplicating.
    await repos.items.purge(item.id);

    const tombstones = await app.db.tombstones.toArray();
    expect(tombstones.length).toBe(2);
  });

  it('does not mind purging, restoring or updating an id that is not there', async () => {
    // These are all idempotent: they resolve quietly. NotFoundError is reserved
    // for the cases where a missing row means the caller asked for something
    // impossible, such as filing an Item into a Find that does not exist.
    await expect(repos.finds.update('missing', { note: 'x' })).resolves.toBeUndefined();
    await expect(repos.finds.restore('missing')).resolves.toBeUndefined();
    await expect(repos.finds.softDelete('missing')).resolves.toBeUndefined();
  });

  it('refuses to file an Item into a Find that does not exist', async () => {
    await expect(repos.items.create('missing-find', { categoryId: 'coin' })).rejects.toThrow(NotFoundError);
  });

  it('re-files an Item between Finds and re-derives both', async () => {
    const one = await fieldLog(repos, T0);
    const two = await fieldLog(repos, T0 + DAY);
    const item = await repos.items.create(one.id, { categoryId: 'coin' });

    await repos.items.moveToFind(item.id, two.id);

    const first = await repos.finds.get(one.id);
    const second = await repos.finds.get(two.id);
    expect(first?.itemCount).toBe(0);
    expect(first?.categoryId).toBe('');
    // The hole that lost its only coin is a Miss again, and Needs Detail.
    expect(first?.needsDetail).toBe(1);
    expect(second?.itemCount).toBe(1);
    expect(second?.categoryId).toBe('coin');
    expect(second?.needsDetail).toBe(0);
  });

  it('refuses to re-file an Item into a Find that does not exist', async () => {
    const one = await fieldLog(repos, T0);
    const item = await repos.items.create(one.id, { categoryId: 'coin' });

    await expect(repos.items.moveToFind(item.id, 'missing-find')).rejects.toThrow(NotFoundError);
    // The Item did not move.
    expect((await repos.items.get(item.id))?.findId).toBe(one.id);
  });

  it('says nothing when asked to re-file an Item that is not there', async () => {
    const one = await fieldLog(repos, T0);
    await expect(repos.items.moveToFind('missing-item', one.id)).resolves.toBeUndefined();
  });

  it('derives the Find Category from silver first', async () => {
    const find = await fieldLog(repos, T0);
    await repos.items.create(find.id, { categoryId: 'coin', isSilver: 'no' });
    await repos.items.create(find.id, { categoryId: 'jewellery', isSilver: 'yes' });

    const stored = await repos.finds.get(find.id);
    expect(stored?.categoryId).toBe('jewellery');
  });

  it('does not rank gold over silver, because precious metal is one flag and the tie goes to the older record', async () => {
    const find = await fieldLog(repos, T0);
    await repos.items.create(find.id, { categoryId: 'coin', isSilver: 'yes' });
    await repos.items.create(find.id, { categoryId: 'jewellery', isGold: 'yes' });

    // Silver and gold are equally significant, so the earlier Item wins and the
    // pin colour for this hole stays stable however the Items are re-filed.
    expect((await repos.finds.get(find.id))?.categoryId).toBe('coin');
  });

  it('prefers a precious Item over an ordinary one filed first', async () => {
    const find = await fieldLog(repos, T0);
    await repos.items.create(find.id, { categoryId: 'scrap' });
    await repos.items.create(find.id, { categoryId: 'jewellery', isGold: 'yes' });

    expect((await repos.finds.get(find.id))?.categoryId).toBe('jewellery');
  });

  it('derives the Find Category from the first named category when nothing is precious', async () => {
    const find = await fieldLog(repos, T0);
    await repos.items.create(find.id, { categoryId: 'unknown' });
    const buckle = await repos.items.create(find.id, { categoryId: 'buckle' });

    expect((await repos.finds.get(find.id))?.categoryId).toBe('buckle');

    // Removing the named Item leaves the Find classified as unknown, which is a
    // real answer and a colour on the map, not "no category chosen".
    await repos.items.softDelete(buckle.id);
    expect((await repos.finds.get(find.id))?.categoryId).toBe('unknown');
  });

  it('leaves the Find Category empty when every Item is uncategorised', async () => {
    const find = await fieldLog(repos, T0);
    await repos.items.create(find.id, { categoryId: '' });

    expect((await repos.finds.get(find.id))?.categoryId).toBe('');
  });

  it('breaks ties by creation order, so the same hole always gets the same pin colour', async () => {
    const find = await fieldLog(repos, T0);
    app.setNow(T0 + 10);
    const first = await repos.items.create(find.id, { categoryId: 'coin' });
    app.setNow(T0 + 20);
    await repos.items.create(find.id, { categoryId: 'button' });

    expect((await repos.finds.get(find.id))?.categoryId).toBe('coin');

    // Re-filing the older Item away moves the colour to the next one up.
    await repos.items.moveToFind(first.id, (await fieldLog(repos, T0 + DAY)).id);
    expect((await repos.finds.get(find.id))?.categoryId).toBe('button');
  });

  it('moves a pin and records where the new position came from', async () => {
    const find = await repos.finds.create({ foundAt: T0, lat: 39, lon: -98, positionSource: 'gps', accuracyM: 4 });

    const moved = await repos.finds.setPosition(find.id, { lat: 39.001, lon: -98.001, source: 'hand' });
    expect(moved?.lat).toBe(39.001);
    expect(moved?.positionSource).toBe('hand');
    // A hand-placed pin makes no accuracy claim.
    expect(moved?.accuracyM).toBe(0);
  });

  it('re-assigns a Find to another Site and Session', async () => {
    const find = await fieldLog(repos, T0);
    const site = await repos.sites.create({ name: 'Ridge Field' });
    const session = await repos.sessions.create({ date: '2026-01-15', startedAt: T0 });

    const moved = await repos.finds.reassign(find.id, { siteId: site.id, sessionId: session.id });
    expect(moved?.siteId).toBe(site.id);
    expect(moved?.sessionId).toBe(session.id);

    expect((await repos.finds.bySite(site.id)).map((f) => f.id)).toEqual([find.id]);
    expect((await repos.finds.bySession(session.id)).map((f) => f.id)).toEqual([find.id]);
  });

  it('lists live Finds newest first and leaves the Bin out', async () => {
    const one = await fieldLog(repos, T0);
    const two = await fieldLog(repos, T0 + DAY);
    const three = await fieldLog(repos, T0 + 2 * DAY);
    await repos.finds.softDelete(two.id);

    expect((await repos.finds.list()).map((f) => f.id)).toEqual([three.id, one.id]);
    expect((await repos.finds.list(1)).map((f) => f.id)).toEqual([three.id]);
    expect(await repos.finds.countLive()).toBe(2);
  });

  it('reads a Date Found range inclusively at both ends', async () => {
    const old = await fieldLog(repos, T0)
    const middle = await fieldLog(repos, T0 + DAY)
    const recent = await fieldLog(repos, T0 + 2 * DAY)
    await repos.finds.softDelete(middle.id)

    // A range is two dates a person read off a screen, so both boundary rows are
    // in the result: 1-14 March includes 14 March. The binned Find sits inside the
    // range and still stays out of it.
    expect((await repos.finds.between(T0, T0 + 2 * DAY)).map((f) => f.id)).toEqual([recent.id, old.id])
    // A one-day range has to find the one-day Find, which is what a single-date
    // search in the filter screen does.
    expect((await repos.finds.between(T0, T0)).map((f) => f.id)).toEqual([old.id])
    expect((await repos.finds.between(T0 + DAY, T0 + DAY)).map((f) => f.id)).toEqual([])
  })

  it('counts Finds per Site for the Site list', async () => {
    const site = await repos.sites.create({ name: 'Ridge Field' });
    const other = await repos.sites.create({ name: 'Bottom Meadow' });
    for (let i = 0; i < 3; i += 1) {
      await repos.finds.create({ foundAt: T0 + i, siteId: site.id });
    }
    await repos.finds.create({ foundAt: T0, siteId: other.id });

    const counts = await repos.finds.countBySite();
    expect(counts[site.id]).toBe(3);
    expect(counts[other.id]).toBe(1);
  });

  it('finds Finds inside a map bounds', async () => {
    const inside = await repos.finds.create({ foundAt: T0, lat: 39.5, lon: -98.5 });
    await repos.finds.create({ foundAt: T0, lat: 41, lon: -97 });
    const binned = await repos.finds.create({ foundAt: T0, lat: 39.6, lon: -98.6 });
    await repos.finds.softDelete(binned.id);

    const found = await repos.finds.inBounds({ sw: [39, -99], ne: [40, -98] });
    expect(found.map((f) => f.id)).toEqual([inside.id]);
  });

  it('filters Finds by category using the stored Find Category', async () => {
    const coin = await fieldLog(repos, T0);
    await repos.items.create(coin.id, { categoryId: 'coin' });
    const miss = await fieldLog(repos, T0 + DAY);

    expect((await repos.finds.byCategory('coin')).map((f) => f.id)).toEqual([coin.id]);
    expect((await repos.finds.byCategory('buckle')).length).toBe(0);
    // A Miss has no category, so it is not a coin and not a buckle either.
    expect((await repos.finds.byCategory('')).map((f) => f.id)).toEqual([miss.id]);
  });

  it('blocks deleting a Site that still has Finds, and says which one to move', async () => {
    const site = await repos.sites.create({ name: 'Ridge Field' });
    const find = await repos.finds.create({ foundAt: T0, siteId: site.id });

    // R-EDIT-3: the block is on the soft delete, because the Bin must not hold a
    // Site whose Finds would come back orphaned.
    const error = await repos.sites.softDelete(site.id).then(() => null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeleteBlockedError);
    expect((error as DeleteBlockedError).reason).toBe('site-has-finds');
    expect((error as DeleteBlockedError).blockingStore).toBe('finds');
    expect((error as DeleteBlockedError).blockingIds).toEqual([find.id]);

    // Move the Find off the Site and the delete is allowed.
    await repos.finds.reassign(find.id, { siteId: '' });
    await repos.sites.softDelete(site.id);
    expect((await repos.sites.get(site.id))?.deletedAt).toBe(T0);

    await repos.sites.purge(site.id);
    expect(await repos.sites.get(site.id)).toBeUndefined();
  });

  it('keeps a Find that has no Site, because steps 02-05 create them before Sites exist', async () => {
    const find = await fieldLog(repos, T0);
    expect(find.siteId).toBe('');

    const unassigned = await repos.sites.unassignedFindCount();
    expect(unassigned).toBe(1);
  });

  it('stamps updatedAt on every write', async () => {
    const find = await fieldLog(repos, T0);
    expect(find.updatedAt).toBe(T0);

    app.setNow(T0 + 60_000);
    const updated = await repos.finds.update(find.id, { note: 'later' });
    expect(updated?.updatedAt).toBe(T0 + 60_000);
    expect(updated?.createdAt).toBe(T0);
  });

  it('never lets a stale patch resurrect a binned Find', async () => {
    const find = await fieldLog(repos, T0);
    await repos.finds.softDelete(find.id);

    const patched = await repos.finds.update(find.id, { note: 'typing into a sheet that was open' });
    expect(patched?.deletedAt).toBe(T0);
  });

  it('reads a Find with its Items for the detail screen', async () => {
    const find = await repos.finds.create({ foundAt: T0, lat: 39, lon: -98, note: 'hot' });
    const one = await repos.items.create(find.id, { categoryId: 'coin', note: 'wheat penny' });
    const two = await repos.items.create(find.id, { categoryId: 'button' });
    await repos.items.softDelete(two.id);

    const items = await repos.items.forFind(find.id);
    expect(items.map((i) => i.id)).toEqual([one.id]);
    // forFind is the detail screen, so it hides the Bin. The Bin itself reads the
    // row by id, which is why get() stays raw.
    expect((await repos.items.get(two.id))?.deletedAt).toBe(T0);
  });

  it('reports the category of a Find for the popup card', async () => {
    const find = await fieldLog(repos, T0);
    expect(await repos.items.categoryOf(find.id)).toBe('');

    await repos.items.create(find.id, { categoryId: 'military' });
    expect(await repos.items.categoryOf(find.id)).toBe('military');
  });

  it('keeps a Find with no Items as a full record, because a Miss is not a nullable flag', async () => {
    const find = await repos.finds.create({ foundAt: T0, lat: 39, lon: -98, note: 'signal, nothing there' });
    expect(find.itemCount).toBe(0);

    const stored = await repos.finds.get(find.id);
    expect(stored).toBeInstanceOf(Object);
    expect((stored as Find).itemCount).toBe(0);
    expect((stored as Find).categoryId).toBe('');
  });
});
