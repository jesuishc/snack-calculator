import test from 'node:test';
import assert from 'node:assert/strict';
import { addHistory, historyFor, priceChange } from '../src/domain/history.js';

test('adds and filters price history', () => {
  let history = [];
  history = addHistory(history, { productId:'p1', productName:'몽쉘', storeId:'coupang', price:5000, checkedAt:'2026-09-01T00:00:00Z' });
  history = addHistory(history, { productId:'p1', productName:'몽쉘', storeId:'coupang', price:4500, checkedAt:'2026-09-02T00:00:00Z' });
  assert.equal(historyFor(history, 'p1', 'coupang').length, 2);
  assert.equal(priceChange(history, 'p1', 'coupang').amount, -500);
});

test('does not duplicate identical latest observation', () => {
  let history = addHistory([], { productId:'p1', storeId:'gs25', price:3000, promotion:'1+1' });
  history = addHistory(history, { productId:'p1', storeId:'gs25', price:3000, promotion:'1+1' });
  assert.equal(history.length, 1);
});
