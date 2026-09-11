import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchRetailer } from './api/search.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const supportedRetailers = new Set(['coupang', 'gs25', 'emart24']);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function handleSearch(url, res) {
  const q = (url.searchParams.get('q') || '').trim();
  const retailer = (url.searchParams.get('retailer') || '').trim();
  const storeId = (url.searchParams.get('storeId') || '').trim();
  if (q.length < 2) return json(res, 400, { error: '상품명을 2글자 이상 입력하세요.' });
  if (!supportedRetailers.has(retailer)) return json(res, 400, { error: '지원하지 않는 판매처입니다.' });

  try {
    const result = await searchRetailer({ q, retailer, storeId });
    return json(res, 200, {
      retailer,
      storeId,
      checkedAt: new Date().toISOString(),
      sourceUrl: result.sourceUrl,
      products: result.products,
      notice: '가격과 행사 정보는 조회 시점 기준 참고값이며 점포, 회원, 쿠폰, 옵션에 따라 실제 결제 조건이 달라질 수 있습니다.'
    });
  } catch (error) {
    return json(res, 502, { error: error.message || '가격 조회 실패', retailer, storeId });
  }
}

async function handleLegacyPrices(url, res) {
  const q = (url.searchParams.get('q') || '').trim();
  const requested = (url.searchParams.get('retailer') || 'all').trim();
  const retailers = requested === 'all' ? [...supportedRetailers] : [requested];
  if (q.length < 2) return json(res, 400, { error: '상품명을 2글자 이상 입력하세요.' });

  const settled = await Promise.allSettled(retailers.map(retailer => searchRetailer({ q, retailer })));
  const results = settled.filter(item => item.status === 'fulfilled').map(item => item.value);
  const errors = settled.filter(item => item.status === 'rejected').map(item => item.reason?.message || '조회 실패');
  return json(res, 200, { query: q, checkedAt: new Date().toISOString(), results, errors });
}

async function serveStatic(url, res) {
  const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const file = await readFile(join(root, safe));
  res.writeHead(200, { 'content-type': mime[extname(safe).toLowerCase()] || 'application/octet-stream' });
  res.end(file);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/search') return await handleSearch(url, res);
    if (url.pathname === '/api/prices') return await handleLegacyPrices(url, res);
    return await serveStatic(url, res);
  } catch (error) {
    return json(res, 404, { error: error.message || 'Not found' });
  }
}).listen(port, () => console.log(`Snack calculator: http://localhost:${port}`));
