import { dedupeProducts, extractSpec, fetchText, normalizeProduct, queryMatches, stripTags } from './common.js';

export async function searchGs25({ q, storeId = '' }) {
  const sourceUrl = `https://gs25.gsretail.com/gscvs/ko/products/event-goods?searchWord=${encodeURIComponent(q)}`;
  const html = (await fetchText(sourceUrl)).replace(/\r?\n/g, ' ');
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

  if (!products.length) {
    const text = stripTags(html);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`([^]{0,70}${escaped}[^]{0,100})\\s([0-9,]{3,})\\s*원\\s*(1\\+1|2\\+1|3\\+1|덤증정)?`, 'gi');
    let match;
    while ((match = pattern.exec(text)) && products.length < 12) {
      const name = match[1].trim();
      products.push(normalizeProduct('gs25', { name, price: match[2], promotion: match[3] || '', storeId, url: sourceUrl, ...extractSpec(name) }));
    }
  }

  return { retailer: 'gs25', sourceUrl, products: dedupeProducts(products).slice(0, 12) };
}
