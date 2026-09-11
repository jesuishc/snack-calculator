import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCandidateMeta, matchCandidate, parseSpec, rankCandidates } from '../src/domain/matcher.js';

test('extracts weight and count from product title', () => {
  const meta = extractCandidateMeta('롯데 몽쉘 딸기 384g 12입', 'https://example.com/products/12345');
  assert.equal(meta.weight, 384);
  assert.equal(meta.count, 12);
  assert.equal(meta.productId, '12345');
});

test('parses multiplied pack specifications', () => {
  assert.deepEqual(parseSpec('초코과자 32g x 12개'), { weight: 384, count: 12 });
  assert.deepEqual(parseSpec('초코과자 12입 × 32g'), { weight: 384, count: 12 });
  assert.deepEqual(parseSpec('대용량 1.2kg 20입'), { weight: 1200, count: 20 });
});

test('barcode match is always exact', () => {
  const result = matchCandidate({ name:'몽쉘 딸기', barcode:'8801234' }, { name:'다른 이름', barcode:'8801234' });
  assert.equal(result.score, 100);
});

test('remembered retailer product is pinned first', () => {
  const product = { name:'몽쉘 딸기', brand:'롯데', weight:384, count:12 };
  const ranked = rankCandidates(product, [
    { name:'롯데 몽쉘 딸기 384g 12입', productId:'new', weight:384, count:12, price:4000 },
    { name:'롯데 몽쉘 딸기 384g 12입', productId:'remembered', weight:384, count:12, price:5000 }
  ], 'remembered');
  assert.equal(ranked[0].productId, 'remembered');
  assert.equal(ranked[0].score, 100);
});

test('same brand and specification ranks above mismatched size', () => {
  const product = { name:'몽쉘 딸기', brand:'롯데', weight:384, count:12 };
  const ranked = rankCandidates(product, [
    { name:'롯데 몽쉘 딸기 192g 6입', weight:192, count:6 },
    { name:'롯데 몽쉘 딸기 384g 12입', weight:384, count:12 }
  ]);
  assert.equal(ranked[0].weight, 384);
  assert.ok(ranked[0].score > ranked[1].score);
});
