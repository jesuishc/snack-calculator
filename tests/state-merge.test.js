import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAppStates } from '../src/domain/state-merge.js';

test('newer offer wins while ratings from both people are preserved', () => {
  const local = { snacks:[{id:'p1',name:'몽쉘',ratings:{남편:5},offers:{gs25:{price:3000,checkedAt:'2026-09-11T02:00:00Z'}}}] };
  const remote = { snacks:[{id:'p1',name:'몽쉘',ratings:{아내:4},offers:{gs25:{price:3500,checkedAt:'2026-09-11T01:00:00Z'}}}] };
  const merged = mergeAppStates(local, remote);
  assert.deepEqual(merged.snacks[0].ratings, { 아내:4, 남편:5 });
  assert.equal(merged.snacks[0].offers.gs25.price, 3000);
});

test('deleted snack does not return from another device', () => {
  const local = { snacks:[], tombstones:{snacks:{p1:'2026-09-11T03:00:00Z'},stores:{}} };
  const remote = { snacks:[{id:'p1',name:'몽쉘',ratings:{},offers:{}}] };
  const merged = mergeAppStates(local, remote);
  assert.equal(merged.snacks.length, 0);
  assert.ok(merged.tombstones.snacks.p1);
});

test('deleted custom store does not return', () => {
  const local = { stores:[], tombstones:{snacks:{},stores:{local_1:'2026-09-11T03:00:00Z'}} };
  const remote = { stores:[{id:'local_1',name:'동네마트'}] };
  assert.equal(mergeAppStates(local, remote).stores.length, 0);
});
