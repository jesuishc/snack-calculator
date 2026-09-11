import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchRetailer } from './api/search.js';
import { getHousehold, putHousehold } from './api/household.js';
import { appendHistory, listHistory } from './api/history.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const supportedRetailers = new Set(['coupang', 'gs25', 'emart24']);
const mime = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webmanifest':'application/manifest+json'
};
function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
async function readJson(req){let body='';for await(const chunk of req)body+=chunk;if(!body)return{};try{return JSON.parse(body);}catch{throw Object.assign(new Error('invalid json'),{status:400});}}
async function handleSearch(url,res){
  const q=(url.searchParams.get('q')||'').trim();const retailer=(url.searchParams.get('retailer')||'').trim();const storeId=(url.searchParams.get('storeId')||'').trim();
  if(q.length<2)return json(res,400,{error:'상품명을 2글자 이상 입력하세요.'});if(!supportedRetailers.has(retailer))return json(res,400,{error:'지원하지 않는 판매처입니다.'});
  try{const result=await searchRetailer({q,retailer,storeId});return json(res,200,{retailer,storeId,checkedAt:new Date().toISOString(),sourceUrl:result.sourceUrl,products:result.products,notice:'가격과 행사 정보는 조회 시점 기준 참고값이며 점포, 회원, 쿠폰, 옵션에 따라 실제 결제 조건이 달라질 수 있습니다.'});}
  catch(error){return json(res,error.status||502,{error:error.message||'가격 조회 실패',retailer,storeId});}
}
async function handleLegacyPrices(url,res){
  const q=(url.searchParams.get('q')||'').trim();const requested=(url.searchParams.get('retailer')||'all').trim();const retailers=requested==='all'?[...supportedRetailers]:[requested];
  if(q.length<2)return json(res,400,{error:'상품명을 2글자 이상 입력하세요.'});const settled=await Promise.allSettled(retailers.map(retailer=>searchRetailer({q,retailer})));
  return json(res,200,{query:q,checkedAt:new Date().toISOString(),results:settled.filter(x=>x.status==='fulfilled').map(x=>x.value),errors:settled.filter(x=>x.status==='rejected').map(x=>x.reason?.message||'조회 실패')});
}
async function handleHousehold(req,url,res){
  const id=(url.searchParams.get('householdId')||'').trim();if(id.length<4)return json(res,400,{error:'householdId required'});
  try{if(req.method==='GET'){const row=await getHousehold(id);return row?json(res,200,{...row.payload,serverUpdatedAt:row.updated_at}):json(res,404,{error:'household not found'});}if(req.method==='PUT'){await putHousehold(id,await readJson(req));return json(res,204,{});}return json(res,405,{error:'method not allowed'});}catch(error){return json(res,error.status||500,{error:error.message||'household sync failed'});}
}
async function handleHistory(req,url,res){
  const body=req.method==='POST'?await readJson(req):{};const id=(url.searchParams.get('householdId')||body.householdId||'').trim();if(id.length<4)return json(res,400,{error:'householdId required'});
  try{if(req.method==='GET'){const rows=await listHistory({householdId:id,productId:url.searchParams.get('productId')||'',storeId:url.searchParams.get('storeId')||'',limit:url.searchParams.get('limit')||200});return json(res,200,{history:rows});}if(req.method==='POST'){if(!body.productId||!body.storeId||!(Number(body.price)>0))return json(res,400,{error:'productId, storeId and positive price required'});const rows=await appendHistory({...body,householdId:id});return json(res,201,{history:rows?.[0]||null});}return json(res,405,{error:'method not allowed'});}catch(error){return json(res,error.status||500,{error:error.message||'history failed'});}
}
async function serveStatic(url,res){const requested=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');const safe=normalize(requested).replace(/^(\.\.[/\\])+/, '');const file=await readFile(join(root,safe));res.writeHead(200,{'content-type':mime[extname(safe).toLowerCase()]||'application/octet-stream'});res.end(file);}
createServer(async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host}`);try{if(url.pathname==='/api/search')return await handleSearch(url,res);if(url.pathname==='/api/prices')return await handleLegacyPrices(url,res);if(url.pathname==='/api/household')return await handleHousehold(req,url,res);if(url.pathname==='/api/history')return await handleHistory(req,url,res);return await serveStatic(url,res);}catch(error){return json(res,error.status||404,{error:error.message||'Not found'});}}).listen(port,()=>console.log(`Snack calculator: http://localhost:${port}`));
