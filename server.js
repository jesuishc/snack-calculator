import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const headers = {
  'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
  'accept-language': 'ko-KR,ko;q=0.9,en;q=0.7'
};

function decodeHtml(value='') {
  return value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
}
function stripTags(value='') { return decodeHtml(value.replace(/<[^>]*>/g,' ')); }
function number(value='') { const n = Number(String(value).replace(/[^0-9]/g,'')); return Number.isFinite(n) ? n : 0; }
function unique(items) {
  const seen = new Set();
  return items.filter(x => { const key = `${x.name}|${x.price}`; if (!x.name || !x.price || seen.has(key)) return false; seen.add(key); return true; });
}
async function getText(url) {
  const response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function scrapeCoupang(query) {
  const url = `https://www.coupang.com/np/search?q=${encodeURIComponent(query)}`;
  const html = await getText(url);
  const products = [];
  const blocks = html.match(/<li[^>]+class="[^"]*search-product[^"]*"[\s\S]*?<\/li>/gi) || [];
  for (const block of blocks.slice(0, 12)) {
    const name = stripTags((block.match(/class="name"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
    const priceText = stripTags((block.match(/class="price-value"[^>]*>([\s\S]*?)<\/strong>/i) || [])[1]);
    const image = (block.match(/<img[^>]+(?:data-img-src|src)="([^"]+)"/i) || [])[1] || '';
    const href = (block.match(/<a[^>]+href="([^"]+)"/i) || [])[1] || '';
    products.push({ retailer:'coupang', name, price:number(priceText), image:image.startsWith('//') ? `https:${image}` : image, url:href.startsWith('/') ? `https://www.coupang.com${href}` : href });
  }
  return { retailer:'coupang', sourceUrl:url, products:unique(products).slice(0,8) };
}

async function scrapeGs25(query) {
  const url = 'https://gs25.gsretail.com/gscvs/ko/products/event-goods';
  const html = await getText(url);
  const normalized = html.replace(/\r?\n/g,' ');
  const products = [];
  const pattern = /<p[^>]*class="tit"[^>]*>([\s\S]*?)<\/p>[\s\S]{0,900}?<span[^>]*class="cost"[^>]*>([\s\S]*?)<\/span>[\s\S]{0,500}?(1\+1|2\+1|덤증정)?/gi;
  let match;
  while ((match = pattern.exec(normalized))) {
    const name = stripTags(match[1]);
    if (!name.toLowerCase().includes(query.toLowerCase().replace(/\s+/g,'')) && !name.toLowerCase().includes(query.toLowerCase())) continue;
    products.push({ retailer:'gs25', name, price:number(stripTags(match[2])), promotion:match[3] || '', url });
  }
  if (!products.length) {
    const text = stripTags(html);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const fallback = new RegExp(`([^]{0,30}${escaped}[^]{0,60})\\s([0-9,]{3,})\\s*원`, 'gi');
    while ((match = fallback.exec(text)) && products.length < 8) products.push({ retailer:'gs25', name:match[1].trim(), price:number(match[2]), promotion:'', url });
  }
  return { retailer:'gs25', sourceUrl:url, products:unique(products).slice(0,8) };
}

async function searchPrices(query, retailer) {
  const jobs = [];
  if (retailer === 'all' || retailer === 'coupang') jobs.push(scrapeCoupang(query));
  if (retailer === 'all' || retailer === 'gs25') jobs.push(scrapeGs25(query));
  const settled = await Promise.allSettled(jobs);
  const results = settled.filter(x => x.status === 'fulfilled').map(x => x.value);
  const errors = settled.filter(x => x.status === 'rejected').map(x => x.reason?.message || '조회 실패');
  return { query, checkedAt:new Date().toISOString(), results, errors, notice:'표시 가격은 검색 시점의 참고값이며 옵션·묶음수량·점포·행사 조건에 따라 달라질 수 있습니다.' };
}

const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
createServer(async (req,res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/prices') {
      const q = (url.searchParams.get('q') || '').trim();
      const retailer = url.searchParams.get('retailer') || 'all';
      if (q.length < 2) { res.writeHead(400, {'content-type':'application/json; charset=utf-8'}); return res.end(JSON.stringify({error:'상품명을 2글자 이상 입력하세요.'})); }
      const data = await searchPrices(q, retailer);
      res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      return res.end(JSON.stringify(data));
    }
    const path = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//,'');
    const file = await readFile(join(root,path));
    res.writeHead(200, {'content-type':mime[extname(path)] || 'application/octet-stream'});
    res.end(file);
  } catch (error) {
    res.writeHead(404, {'content-type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({error:error.message || 'Not found'}));
  }
}).listen(port, () => console.log(`Snack calculator: http://localhost:${port}`));
