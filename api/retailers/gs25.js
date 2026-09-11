import { dedupeProducts, extractSpec, normalizeProduct, queryMatches, stripTags } from './common.js';
import { searchGs25Direct } from '../../src/server/retailer-mcp.js';

export function parseGs25Html(rawHtml, q, storeId = '', sourceUrl = '') {
  const html = String(rawHtml).replace(/\r?\n/g, ' ');
  const products = [];
  const cards = html.match(/<(?:li|div)[^>]+class="[^"]*(?:prod|product|goods)[^"]*"[\s\S]{0,2500}?<\/(?:li|div)>/gi) || [];
  for (const card of cards) {
    const name = stripTags((card.match(/<(?:p|strong|span)[^>]+class="[^"]*(?:tit|name)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|strong|span)>/i) || [])[1]);
    if (!name || !queryMatches(name, q)) continue;
    const price = stripTags((card.match(/<(?:span|strong)[^>]+class="[^"]*(?:cost|price)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|strong)>/i) || [])[1]);
    const promotion = (card.match(/(1\+1|2\+1|3\+1|덤증정)/i) || [])[1] || '';
    const productId = (card.match(/(?:goodsCd|productCode|goodsCode)["'=:\s]+([A-Za-z0-9_-]+)/i) || [])[1] || '';
    products.push(normalizeProduct('gs25', { name, price, promotion, productId, storeId, url: sourceUrl, ...extractSpec(name) }));
  }
  return dedupeProducts(products).slice(0, 12);
}

export async function searchGs25({ q, storeId = '' }) {
  const products = await searchGs25Direct(q);
  return {
    retailer: 'gs25',
    sourceUrl: products[0]?.url || `https://mcp.aka.page/api/gs25/products?keyword=${encodeURIComponent(q)}&limit=12`,
    products: products.map(item => ({ ...item, storeId }))
  };
}
