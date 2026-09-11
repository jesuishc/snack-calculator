import { dedupeProducts, extractSpec, fetchText, normalizeProduct, queryMatches, stripTags } from './common.js';

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

  if (!products.length) {
    const text = stripTags(html);
    const escaped = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`([^]{0,70}${escaped}[^]{0,100})\\s([0-9,]{3,})\\s*원\\s*(1\\+1|2\\+1|3\\+1|덤증정)?`, 'gi');
    let match;
    while ((match = pattern.exec(text)) && products.length < 12) {
      const name = match[1].trim();
      products.push(normalizeProduct('emart24', { name, price: match[2], promotion: match[3] || '', storeId, url: sourceUrl, ...extractSpec(name) }));
    }
  }
  return dedupeProducts(products).slice(0, 12);
}

export async function searchEmart24({ q, storeId = '' }) {
  const sourceUrl = `https://m.emart24.co.kr/goods/event?search=${encodeURIComponent(q)}`;
  const html = await fetchText(sourceUrl);
  return { retailer: 'emart24', sourceUrl, products: parseEmart24Html(html, q, storeId, sourceUrl) };
}
