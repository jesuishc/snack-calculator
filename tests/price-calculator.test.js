import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMetrics, receivedBundles, valueScore } from '../src/domain/price-calculator.js';

const product = { weight: 400, count: 10, rating: 4, offers: {} };

test('1+1 doubles received quantity', () => {
  assert.equal(receivedBundles({ bundles: 1, promo: '1+1' }), 2);
});

test('2+1 converts paid bundles into received bundles', () => {
  assert.equal(receivedBundles({ bundles: 2, promo: '2+1' }), 3);
});

test('3+1 converts paid bundles into received bundles', () => {
  assert.equal(receivedBundles({ bundles: 3, promo: '3+1' }), 4);
});

test('calculates total, each and 100g including shipping', () => {
  const result = calculateMetrics(product, { price: 5000, bundles: 1, shipping: 3000, promo: '1+1' });
  assert.equal(result.total, 8000);
  assert.equal(result.each, 400);
  assert.equal(result.g100, 1000);
});

test('value score uses the cheapest positive offer', () => {
  const snack = {
    ...product,
    offers: {
      a: { price: 5000, bundles: 1, shipping: 0, promo: 'none' },
      b: { price: 4000, bundles: 1, shipping: 0, promo: 'none' }
    }
  };
  assert.equal(valueScore(snack, [{ id: 'a' }, { id: 'b' }], 'total'), 1);
});
