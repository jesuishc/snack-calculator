import crypto from 'node:crypto';
import { dedupeProducts, extractSpec, fetchText, normalizeProduct, queryMatches, stripTags } from './common.js';

const COUPANG_API_HOST = 'https://api-gateway.coupang.com';
const COUPANG_SEARCH_PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';

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

function readerPrice(line = '') {
  const discounted = String(line).match(/~~\s*[0-9][0-9,]*\s*원\s*~~\s*\d+%\s*([0-9][0-9,]*)\s*원/i);
  if (discounted) return discounted[1];
  return (String(line).match(/([0-9][0-9,]{2,})\s*원/) || [])[1] || '';
}

function readerName(line = '', price = '') {
  let value = String(line)
    .replace(/^\s*[-*•]\s*/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/~~\s*[0-9][0-9,]*\s*원\s*~~\s*\d+%/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (price) {
    const idx = value.search(new RegExp(`${String(price).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*원`));
    if (idx > 0) value = value.slice(0, idx).trim();
  }
  return stripTags(value).replace(/^\d+\s+/, '').trim();
}

export function parseCoupangReader(text, q, sourceUrl = '') {
  const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const products = [];

  for (const line of lines) {
    const price = readerPrice(line);
    if (!price) continue;

    const markdownLink = [...line.matchAll(/\[([^\]]{2,220})\]\((https?:\/\/[^)]+\/vp\/products\/\d+[^)]*)\)/gi)]
      .find(match => queryMatches(match[1], q));
    const name = markdownLink ? stripTags(markdownLink[1]) : readerName(line, price);
    if (!name || !queryMatches(name, q)) continue;

    const url = markdownLink?.[2] || sourceUrl;
    const productId = (url.match(/\/vp\/products\/(\d+)/i) || [])[1] || '';
    products.push(normalizeProduct('coupang', {
      name,
      price,
      url,
      productId,
      ...extractSpec(name)
    }));
  }

  if (!products.length) {
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
  }

  return dedupeProducts(products).slice(0, 12);
}

function signedDate(now = new Date()) {
  const iso = now.toISOString().replace(/[-:]/g, '');
  return iso.slice(2, 8) + 'T' + iso.slice(9, 15) + 'Z';
}

function coupangAuthorization(method, path, query, accessKey, secretKey) {
  const datetime = signedDate();
  const message = `${datetime}${method}${path}${query}`;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

export async function searchCoupangPartners(q) {
  const accessKey = String(process.env.COUPANG_PARTNERS_ACCESS_KEY || '').trim();
  const secretKey = String(process.env.COUPANG_PARTNERS_SECRET_KEY || '').trim();
  if (!accessKey || !secretKey) return null;

  const params = new URLSearchParams({ keyword: q, limit: '10' });
  const subId = String(process.env.COUPANG_PARTNERS_SUB_ID || '').trim();
  if (subId) params.set('subId', subId);
  const query = params.toString();
  const url = `${COUPANG_API_HOST}${COUPANG_SEARCH_PATH}?${query}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: coupangAuthorization('GET', COUPANG_SEARCH_PATH, query, accessKey, secretKey)
    },
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || String(payload?.rCode ?? '0') !== '0') {
    throw new Error(`쿠팡 파트너스 API 오류: ${payload?.rMessage || `HTTP ${response.status}`}`);
  }

  const rows = Array.isArray(payload?.data?.productData)
    ? payload.data.productData
    : Array.isArray(payload?.data) ? payload.data : [];
  const products = rows
    .filter(item => item?.productName && Number(item?.productPrice) > 0 && queryMatches(item.productName, q))
    .map(item => normalizeProduct('coupang', {
      name: item.productName,
      price: item.productPrice,
      productId: item.productId,
      image: item.productImage,
      url: item.productUrl,
      ...extractSpec(item.productName)
    }));
  return { retailer: 'coupang', sourceUrl: url, products: dedupeProducts(products).slice(0, 10) };
}

export async function searchCoupang({ q }) {
  const partners = await searchCoupangPartners(q);
  if (partners?.products?.length) return partners;

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

  try {
    const readerUrl = `https://r.jina.ai/${sourceUrl}`;
    const text = await fetchText(readerUrl, {
      timeout: 25000,
      headers: { accept: 'text/plain' }
    });
    const products = parseCoupangReader(text, q, sourceUrl);
    if (products.length) return { retailer: 'coupang', sourceUrl, products };
  } catch {}

  if (!process.env.COUPANG_PARTNERS_ACCESS_KEY || !process.env.COUPANG_PARTNERS_SECRET_KEY) {
    throw new Error('쿠팡 자동검색 설정이 필요합니다. COUPANG_PARTNERS_ACCESS_KEY와 COUPANG_PARTNERS_SECRET_KEY를 Vercel Preview 환경변수에 등록해 주세요.');
  }
  throw new Error('쿠팡에서 현재 검색 가능한 상품 가격을 받지 못했습니다.');
}
