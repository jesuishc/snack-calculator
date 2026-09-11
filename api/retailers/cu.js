import { dedupeProducts, extractSpec, fetchText, normalizeProduct, queryMatches, stripTags } from './common.js';

export function parseCuHtml(rawHtml, q, storeId = '', sourceUrl = '') {
  const html = String(rawHtml).replace(/\r?\n/g, ' ');
  const products = [];
  const cards = html.match(/<(?:li|div)[^>]+class="[^"]*(?:prod|product|goods|item)[^"]*"[\s\S]{0,3500}?<\/(?:li|div)>/gi) || [];

  for (const card of cards) {
    const name = stripTags((card.match(/<(?:p|strong|span|div)[^>]+class="[^"]*(?:name|tit|title|prodName|prod_name)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|strong|span|div)>/i) || [])[1]);
    if (!name || !queryMatches(name, q)) continue;
    const price = stripTags((card.match(/<(?:p|strong|span|div)[^>]+class="[^"]*(?:price|cost|prodPrice|prod_price)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|strong|span|div)>/i) || [])[1]);
    const promotion = (card.match(/(1\+1|2\+1|3\+1|덤증정)/i) || [])[1] || '';
    const productId = (card.match(/(?:gdIdx|goodsCd|productId)["'=:\s]+([A-Za-z0-9_-]+)/i) || [])[1] || '';
    const href = (card.match(/<a[^>]+href="([^"]+)"/i) || [])[1] || '';
    const url = href.startsWith('/') ? `https://cu.bgfretail.com${href}` : href || sourceUrl;
    products.push(normalizeProduct('cu', { name, price, promotion, productId, storeId, url, ...extractSpec(name) }));
  }

  if (!products.length) {
    const text = stripTags(html);
    const escaped = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`([^]{0,70}${escaped}[^]{0,110})\\s([0-9,]{3,})\\s*원\\s*(1\\+1|2\\+1|3\\+1|덤증정)?`, 'gi');
    let match;
    while ((match = pattern.exec(text)) && products.length < 12) {
      const name = match[1].trim();
      products.push(normalizeProduct('cu', { name, price: match[2], promotion: match[3] || '', storeId, url: sourceUrl, ...extractSpec(name) }));
    }
  }

  return dedupeProducts(products).slice(0, 12);
}

export async function searchCu({ q, storeId = '' }) {
  const sourceUrl = `https://cu.bgfretail.com/product/search.do?searchText=${encodeURIComponent(q)}`;
  const html = await fetchText(sourceUrl, { timeout: 15000 });
  return { retailer: 'cu', sourceUrl, products: parseCuHtml(html, q, storeId, sourceUrl) };
}
