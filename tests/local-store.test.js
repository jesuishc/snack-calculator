import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const file = join(tmpdir(), `snack-calculator-${process.pid}-${Date.now()}.json`);
process.env.SNACK_DATA_FILE = file;
const store = await import(`../api/local-store.js?test=${Date.now()}`);

test('local household snapshot persists', async () => {
  await store.putLocalHousehold('home1234', { snacks: [{ id: 'p1' }] });
  const row = await store.getLocalHousehold('home1234');
  assert.equal(row.payload.snacks[0].id, 'p1');
  assert.ok(row.updated_at);
});

test('local price history persists and filters', async () => {
  await store.appendLocalHistory({ household_id:'home1234', product_id:'p1', store_id:'gs25', price:2000, promotion:'1+1', checked_at:'2026-09-11T00:00:00Z' });
  await store.appendLocalHistory({ household_id:'home1234', product_id:'p2', store_id:'gs25', price:1000, promotion:'none', checked_at:'2026-09-11T00:00:01Z' });
  const rows = await store.listLocalHistory({ householdId:'home1234', productId:'p1', storeId:'gs25' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price, 2000);
});

test.after(async () => {
  await rm(file, { force: true });
});
