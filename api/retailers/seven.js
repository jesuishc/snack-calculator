import { dedupeProducts, extractSpec, normalizeProduct, queryMatches, stripTags } from './common.js';
import { searchCompareService } from './mcp.js';

export function parseSevenHtml(rawHtml, q, storeId = '', sourceUrl = '') {
  const text = stripTags(String(rawHtml).replace(/\r?\n/g, ' '));
  const products = [];
  const pattern = /7-ELEVEn\s+\S+\s+\d{2}\.\d{2}\s+(.{1,120}?)\s+([0-9,]{3,})\s*원(?:\s*\([0-9,]+원\))?\s*(1\+1|2\+1|3\+1)?/gi;
  let match;
  while ((match = pattern.exec(text)) && products.length < 40) {
    const name = match[1].trim();
    if (!queryMatches(name, q)) continue;
    products.push(normalizeProduct('seven', { name, price: match[2], promotion: match[3] || '', storeId, url: sourceUrl, ...extractSpec(name) }));
  }
  return dedupeProducts(products).slice(0, 12);
}

export async function searchSeven({ q, storeId = '' }) {
  return searchCompareService({ q, retailer: 'seven', service: 'seveneleven', storeId });
}
