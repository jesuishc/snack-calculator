import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSpec, queryMatches } from '../api/retailers/common.js';
import { parseCoupangHtml } from '../api/retailers/coupang.js';
import { parseGs25Html } from '../api/retailers/gs25.js';
import { parseEmart24Html } from '../api/retailers/emart24.js';

test('common spec parser handles package expressions', () => {
  assert.deepEqual(extractSpec('몽쉘 32g x 12개'), { weight: 384, count: 12 });
  assert.deepEqual(extractSpec('과자 1.2kg 20입'), { weight: 1200, count: 20 });
});

test('query matching tolerates omitted brand tokens', () => {
  assert.equal(queryMatches('몽쉘 딸기 384g 12입', '롯데 몽쉘 딸기'), true);
  assert.equal(queryMatches('전혀 다른 감자칩', '롯데 몽쉘 딸기'), false);
});

test('Coupang fixture is normalized', () => {
  const html = `<li class="search-product"><a href="/vp/products/12345"><img data-img-src="//img.test/a.jpg"><div class="name">롯데 몽쉘 딸기 32g x 12개</div><strong class="price-value">4,980</strong></a></li>`;
  const [item] = parseCoupangHtml(html, '몽쉘 딸기', 'https://www.coupang.com/search');
  assert.equal(item.retailer, 'coupang');
  assert.equal(item.price, 4980);
  assert.equal(item.productId, '12345');
  assert.equal(item.weight, 384);
  assert.equal(item.count, 12);
});

test('GS25 fixture carries promotion and store id', () => {
  const html = `<li class="product"><p class="tit">몽쉘 딸기 384g 12입</p><span class="cost">5,000원</span><span>1+1</span><input goodsCd="GS123"></li>`;
  const [item] = parseGs25Html(html, '몽쉘 딸기', 'store-1', 'https://gs25.test');
  assert.equal(item.price, 5000);
  assert.equal(item.promotion, '1+1');
  assert.equal(item.storeId, 'store-1');
  assert.equal(item.count, 12);
});

test('Emart24 fixture carries promotion', () => {
  const html = `<div class="goods"><strong class="name">몽쉘 딸기 384g 12입</strong><span class="price">4,800원</span><span>2+1</span><input goodsNo="EM123"></div>`;
  const [item] = parseEmart24Html(html, '몽쉘 딸기', '', 'https://emart24.test');
  assert.equal(item.price, 4800);
  assert.equal(item.promotion, '2+1');
  assert.equal(item.count, 12);
});
