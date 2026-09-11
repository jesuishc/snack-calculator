import { dedupeProducts, extractSpec, fetchText, normalizeProduct, queryMatches, stripTags } from './common.js';

export function parseCoupangHtml(html, q, sourceUrl = '') {
  const blocks = String(html).match(/<li[^>]+class="[^"]*search-product[^"]*"[\s\S]*?<\/li>/gi) || [];
  const products = [];
  for (const block of blocks.slice(0, 40)) {
    const name = stripTags((block.match(/class="name"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
    if (!name || !queryMatches(name, q)) continue;
    const price = stripTags((block.match(/class="price-value"[^>]*>([\s\S]*?)<\/strong>/i) || [])[1]);
    const href = (block.match(/<a[^>]+href="([^"]+)"/i) || [])[1] || '';
    const image = (block.match(/<img[^>]+(?:data-img-src|src)="([^"]+)"/i) || [])[1] || '';
    const productId = (href.match(/\/vp\/products\/(\d+)/i) || [])[1] || '';
    products.push(normalizeProduct('coupang', {
      name, price,
      url: href.startsWith('/') ? `https://www.coupang.com${href}` : href || sourceUrl,
      image: image.startsWith('//') ? `https:${image}` : image,
      productId,
      ...extractSpec(name)
    }));
  }
  return dedupeProducts(products).slice(0, 12);
}

export function parseCoupangReader(text, q, sourceUrl = '') {
  const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const products = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/\b[0-9]{1,3}(?:,[0-9]{3})+\s*원\b/.test(lines[i])) continue;
    const windowText = lines.slice(Math.max(0, i - 6), Math.min(lines.length, i + 5)).join(' ');
    const links = [...windowText.matchAll(/\[([^\]]{2,180})\]\((https?:\/\/[^)]+\/vp\/products\/\d+[^)]*)\)/gi)];
    const link = links.find(match => queryMatches(match[1], q));
    if (!link) continue;
    const priceMatch = windowText.match(/([0-9]{1,3}(?:,[0-9]{3})+)\s*원/);
    if (!priceMatch) continue;
    const productId = (link[2].match(/\/vp\/products\/(\d+)/i) || [])[1] || '';
    products.push(normalizeProduct('coupang', {
      name: stripTags(link[1]),
      price: priceMatch[1],
      url: link[2],
      productId,
      ...extractSpec(link[1])
    }));
  }
  return dedupeProducts(products).slice(0, 12);
}

export async function searchCoupang({ q }) {
  const sourceUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}`;
  try {
    const html = await fetchText(sourceUrl, {
      timeout: 15000,
      headers: {
        referer: 'https://www.coupang.com/',
        'cache-control': 'no-cache',
        pragma: 'no-cache'
      }
    });
    const direct = parseCoupangHtml(html, q, sourceUrl);
    if (direct.length) return { retailer: 'coupang', sourceUrl, products: direct };
  } catch {}

  const readerUrl = `https://r.jina.ai/${sourceUrl}`;
  const text = await fetchText(readerUrl, {
    timeout: 20000,
    headers: { accept: 'text/plain' }
  });
  return { retailer: 'coupang', sourceUrl, products: parseCoupangReader(text, q, sourceUrl) };
}
