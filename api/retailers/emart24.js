import { dedupeProducts, extractSpec, normalizeProduct, queryMatches, stripTags } from './common.js';
import { searchCompareService } from './mcp.js';

export function parseEmart24Html(rawHtml, q, storeId = '', sourceUrl = '') {
  const html = String(rawHtml).replace(/\r?\n/g, ' ');
  const products = [];
  const cards = html.match(/<(?:li|div)[^>]+class="[^"]*(?:item|goods|product)[^"]*"[\s\S]{0,2500}?<\/(?:li|div)>/gi) || [];
  for (const card of cards) {
    const name = stripTags((card.match(/<(?:p|strong|span)[^>]+class="[^"]*(?:name|tit|title)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|strong|span)>/i) || [])[1]);
    if (!name || !queryMatches(name, q)) continue;
    const price = stripTags((card.match(/<(?:p|strong|span)[^>]+class="[^"]*(?:price|cost)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|strong|span)>/i) || [])[1]);
    const promotion = (card.match(/(1\+1|2\+1|3\+1|덤증정)/i) || [])[1] || '';
    const productId = (card.match(/(?:goodsNo|goodsCd|productId)["'=:\s]+([A-Za-z0-9_-]+)/i) || [])[1] || '';
    products.push(normalizeProduct('emart24', { name, price, promotion, productId, storeId, url: sourceUrl, ...extractSpec(name) }));
  }
  return dedupeProducts(products).slice(0, 12);
}

export async function searchEmart24({ q, storeId = '' }) {
  return searchCompareService({ q, retailer: 'emart24', service: 'emart24', storeId });
}
