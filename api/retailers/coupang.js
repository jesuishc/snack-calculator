import { dedupeProducts, extractSpec, fetchText, normalizeProduct, queryMatches, stripTags } from './common.js';

export async function searchCoupang({ q }) {
  const sourceUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}`;
  const html = await fetchText(sourceUrl);
  const blocks = html.match(/<li[^>]+class="[^"]*search-product[^"]*"[\s\S]*?<\/li>/gi) || [];
  const products = [];

  for (const block of blocks.slice(0, 30)) {
    const name = stripTags((block.match(/class="name"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
    if (!name || !queryMatches(name, q)) continue;
    const price = stripTags((block.match(/class="price-value"[^>]*>([\s\S]*?)<\/strong>/i) || [])[1]);
    const href = (block.match(/<a[^>]+href="([^"]+)"/i) || [])[1] || '';
    const image = (block.match(/<img[^>]+(?:data-img-src|src)="([^"]+)"/i) || [])[1] || '';
    const productId = (href.match(/\/vp\/products\/(\d+)/i) || [])[1] || '';
    const spec = extractSpec(name);

    products.push(normalizeProduct('coupang', {
      name,
      price,
      url: href.startsWith('/') ? `https://www.coupang.com${href}` : href,
      image: image.startsWith('//') ? `https:${image}` : image,
      productId,
      ...spec
    }));
  }

  return { retailer: 'coupang', sourceUrl, products: dedupeProducts(products).slice(0, 12) };
}
