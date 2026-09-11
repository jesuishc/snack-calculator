import { dedupeProducts, extractSpec, fetchText, normalizeProduct, queryMatches, stripTags } from './common.js';
import { searchCompareService } from './mcp.js';

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
  if (!products.length) {
    const text = stripTags(html);
    const escaped = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`([^]{0,70}${escaped}[^]{0,100})\\s([0-9,]{3,})\\s*원\\s*(1\\+1|2\\+1|3\\+1|덤증정)?`, 'gi');
    let match;
    while ((match = pattern.exec(text)) && products.length < 12) {
      const name = match[1].trim();
      products.push(normalizeProduct('gs25', { name, price: match[2], promotion: match[3] || '', storeId, url: sourceUrl, ...extractSpec(name) }));
    }
  }
  return dedupeProducts(products).slice(0, 12);
}

export async function searchGs25({ q, storeId = '' }) {
  try {
    const mcp = await searchCompareService({ q, retailer: 'gs25', service: 'gs25', storeId });
    if (mcp.products.length) return mcp;
  } catch {}
  const sourceUrl = `https://gs25.gsretail.com/gscvs/ko/products/event-goods?searchWord=${encodeURIComponent(q)}`;
  const html = await fetchText(sourceUrl);
  return { retailer: 'gs25', sourceUrl, products: parseGs25Html(html, q, storeId, sourceUrl) };
}
