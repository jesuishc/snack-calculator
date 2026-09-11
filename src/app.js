import { num, migrateOffer, calculateMetrics, compareValue, bestValue, valueScore } from './domain/price-calculator.js';
import { extractCandidateMeta, rankCandidates, textSimilarity } from './domain/matcher.js';
import { addHistory, historyFor, priceChange } from './domain/history.js';
import { mergeAppStates } from './domain/state-merge.js';

const CONFIG = window.SNACK_CONFIG || {};
const FIXED = {
  coupang: { label: '쿠팡', url: q => `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}` },
  gs25: { label: 'GS25', url: q => `https://gs25.gsretail.com/gscvs/ko/products/event-goods?searchWord=${encodeURIComponent(q)}` },
  emart24: { label: '이마트24', url: q => `https://m.emart24.co.kr/goods/event?search=${encodeURIComponent(q)}` }
};
const defaultsStores = [
  { id: 'coupang', name: '쿠팡', fixed: true },
  { id: 'gs25', name: 'GS25', fixed: true },
  { id: 'emart24', name: '이마트24', fixed: true }
];
const makeDefaultSnacks = () => ['몽쉘 딸기', '버터링 초코', '오예스 쿠앤크'].map((name, i) => ({
  id: String(Date.now() + i), name, brand: '', weight: 0, count: 0, barcode: '', ratings: {}, offers: {}
}));

const $ = id => document.getElementById(id);
const els = {
  basis: $('basis'), headRow: $('headRow'), rows: $('rows'), modal: $('modal'), modalBody: $('modalBody'),
  newName: $('newName'), newStore: $('newStore'), cloudStatus: $('cloudStatus')
};
function load(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value ?? structuredClone(fallback); }
  catch { return structuredClone(fallback); }
}
function esc(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }
function nowIso() { return new Date().toISOString(); }
function currentProfile() { return localStorage.getItem('snackProfile') || '나'; }
function householdId() { return localStorage.getItem('snackHouseholdId') || ''; }
function migrateSnack(source = {}) {
  const offers = {};
  Object.entries(source.offers || source.prices || {}).forEach(([key, value]) => { offers[key] = migrateOffer(value); });
  const legacyRating = num(source.rating); const ratings = { ...(source.ratings || {}) };
  if (legacyRating && !Object.keys(ratings).length) ratings[currentProfile()] = legacyRating;
  return {
    id: String(source.id || Date.now() + Math.random()), name: source.name || '이름 없음', brand: source.brand || '',
    weight: num(source.weight), count: num(source.count), barcode: source.barcode || '', ratings, offers
  };
}
function ratingOf(snack) { return num(snack.ratings?.[currentProfile()]); }
function scoringSnack(snack) { return { ...snack, rating: ratingOf(snack) }; }
function remoteCandidate(item, storeId) { return { store: storeId, ...extractCandidateMeta(item.name, item.url), ...item }; }

let stores = load('snackStoresV4', defaultsStores);
let snacks = load('snackSheetV4', null);
let basisMode = localStorage.getItem('snackBasis') || 'total';
let history = load('snackHistoryV1', []);
let tombstones = load('snackTombstonesV1', { snacks: {}, stores: {} });
let active = null;
if (!snacks) snacks = load('snackSheetV3', makeDefaultSnacks()).map(migrateSnack); else snacks = snacks.map(migrateSnack);
els.basis.value = basisMode;

function save() {
  localStorage.setItem('snackStoresV4', JSON.stringify(stores));
  localStorage.setItem('snackSheetV4', JSON.stringify(snacks));
  localStorage.setItem('snackBasis', basisMode);
  localStorage.setItem('snackHistoryV1', JSON.stringify(history));
  localStorage.setItem('snackTombstonesV1', JSON.stringify(tombstones));
}
function fmt(value) { return value ? Math.round(value).toLocaleString() : '-'; }
function specText(snack) {
  return [snack.brand, snack.weight ? `${snack.weight}g` : '', snack.count ? `${snack.count}개` : '', snack.barcode ? `바코드 ${snack.barcode}` : ''].filter(Boolean).join(' · ') || '규격 미입력';
}
function changeText(snack, storeId) {
  const change = priceChange(history, snack.id, storeId);
  if (!change || !change.amount) return '';
  const sign = change.amount > 0 ? '▲' : '▼';
  return `<div class="source">${sign} ${Math.abs(Math.round(change.amount)).toLocaleString()}원 (${Math.abs(change.percent).toFixed(1)}%)</div>`;
}
function render() {
  els.headRow.innerHTML = '<th class="product">과자 / 규격 / 내 만족도</th>' + stores.map(store =>
    `<th><div class="storehead">${esc(store.name)}${store.fixed ? '' : `<button class="storedelete" onclick="removeStore('${store.id}')">×</button>`}</div></th>`
  ).join('') + '<th>가성비</th>';
  els.rows.innerHTML = '';
  if (!snacks.length) { els.rows.innerHTML = `<tr><td colspan="${stores.length + 2}">과자를 추가해 주세요.</td></tr>`; return; }
  snacks.forEach(snack => {
    const scoreSnack = scoringSnack(snack); const best = bestValue(scoreSnack, stores, basisMode); const rating = ratingOf(snack);
    const row = document.createElement('tr');
    row.innerHTML = `<td class="product"><div class="phead"><div class="pname">${esc(snack.name)}</div><button class="mini" onclick="removeSnack('${snack.id}')">×</button></div><div class="spec">${esc(specText(snack))}</div><button class="edit" onclick="editSpec('${snack.id}')">규격 수정</button><div class="stars">${[1,2,3,4,5].map(n => `<button class="star ${rating >= n ? 'on' : ''}" onclick="rate('${snack.id}',${n})">★</button>`).join('')}</div><div class="source">${esc(currentProfile())}의 별점</div></td>` +
      stores.map(store => {
        const offer = migrateOffer(snack.offers[store.id]); const metrics = calculateMetrics(snack, offer); const value = compareValue(snack, offer, basisMode);
        const bestClass = best && Math.abs(value - best) < .01 ? 'best' : '';
        const source = offer.matchedName ? `<div class="source" title="${esc(offer.sourceUrl)}">↳ ${esc(offer.matchedName)} · 일치 ${offer.matchScore || 0}%</div>` : '';
        const hasHistory = historyFor(history, snack.id, store.id).length > 0;
        return `<td class="pricecell ${bestClass}"><div class="mainprice">${offer.price ? offer.price.toLocaleString() + '원' : '가격 없음'}</div><div class="unit">결제 ${fmt(metrics.total)}원<br>개당 ${fmt(metrics.each)}원 · 100g ${fmt(metrics.g100)}원</div>${source}${changeText(snack, store.id)}<button class="find" onclick="${store.fixed ? `findSimilar('${snack.id}','${store.id}')` : `editOffer('${snack.id}','${store.id}')`}">${store.fixed ? '상품 찾기' : '가격 입력'}</button>${offer.price ? `<button class="edit" onclick="editOffer('${snack.id}','${store.id}')">상세 수정</button>` : ''}${hasHistory ? `<button class="edit" onclick="showHistory('${snack.id}','${store.id}')">가격 이력</button>` : ''}</td>`;
      }).join('') + `<td class="score">${valueScore(scoreSnack, stores, basisMode) ? valueScore(scoreSnack, stores, basisMode) + '점' : '-'}</td>`;
    els.rows.appendChild(row);
  });
  els.cloudStatus.textContent = `${currentProfile()} · ${householdId() ? '공유 설정됨' : '로컬 저장'}`;
}

function setBasis(value) { basisMode = value; save(); render(); }
function addSnack() {
  const name = els.newName.value.trim(); if (name.length < 2) return alert('과자 이름을 2글자 이상 입력하세요.');
  const snack = migrateSnack({ id: String(Date.now()), name }); snacks.unshift(snack); els.newName.value = ''; save(); render(); editSpec(snack.id);
}
function addStore() {
  const name = els.newStore.value.trim(); if (name.length < 2) return alert('마트 이름을 2글자 이상 입력하세요.');
  if (stores.some(store => store.name === name)) return alert('같은 이름이 있습니다.');
  stores.push({ id: 'local_' + Date.now(), name, fixed: false }); els.newStore.value = ''; save(); render();
}
function removeStore(id) {
  const store = stores.find(item => item.id === id); if (!store || store.fixed || !confirm(`“${store.name}” 열을 삭제할까요?`)) return;
  tombstones.stores[id] = nowIso(); stores = stores.filter(item => item.id !== id); snacks.forEach(snack => delete snack.offers[id]); save(); render();
}
function removeSnack(id) {
  const snack = snacks.find(item => item.id === id);
  if (snack && confirm(`“${snack.name}”을 삭제할까요?`)) { tombstones.snacks[id] = nowIso(); snacks = snacks.filter(item => item.id !== id); save(); render(); }
}
function rate(id, rating) { const snack = snacks.find(item => item.id === id); if (snack) { snack.ratings ||= {}; snack.ratings[currentProfile()] = rating; } save(); render(); }
function sortRows() { snacks.sort((a, b) => valueScore(scoringSnack(b), stores, basisMode) - valueScore(scoringSnack(a), stores, basisMode)); save(); render(); }
function resetAll() {
  if (!confirm('상품·동네마트·가격 이력을 초기화할까요? 공유 저장을 누르면 이 삭제 상태도 다른 기기에 반영됩니다.')) return;
  const deletedAt = nowIso();
  snacks.forEach(snack => { tombstones.snacks[snack.id] = deletedAt; });
  stores.filter(store => !store.fixed).forEach(store => { tombstones.stores[store.id] = deletedAt; });
  stores = structuredClone(defaultsStores); snacks = makeDefaultSnacks().map(migrateSnack); history = []; save(); render();
}

function editSpec(id) {
  const snack = snacks.find(item => item.id === id);
  els.modalBody.innerHTML = `<h2>과자 규격</h2><div class="formgrid"><label class="span2">상품명<input id="fName" value="${esc(snack.name)}"></label><label>브랜드<input id="fBrand" value="${esc(snack.brand)}"></label><label>총중량(g)<input id="fWeight" type="number" value="${snack.weight || ''}"></label><label>구성 개수<input id="fCount" type="number" value="${snack.count || ''}"></label><label>바코드<input id="fBarcode" value="${esc(snack.barcode)}"></label></div><div class="foot"><button class="btn primary" onclick="saveSpec('${id}')">저장</button><button class="btn soft" onclick="closeModal()">취소</button></div>`;
  els.modal.classList.add('open');
}
function saveSpec(id) {
  const snack = snacks.find(item => item.id === id); snack.name = $('fName').value.trim() || snack.name; snack.brand = $('fBrand').value.trim(); snack.weight = num($('fWeight').value); snack.count = num($('fCount').value); snack.barcode = $('fBarcode').value.trim(); save(); render(); closeModal();
}
function editOffer(id, storeId) {
  const snack = snacks.find(item => item.id === id); const offer = migrateOffer(snack.offers[storeId]);
  els.modalBody.innerHTML = `<h2>${esc(stores.find(item => item.id === storeId)?.name || storeId)} 가격 상세</h2><div class="formgrid"><label>판매가격<input id="oPrice" type="number" value="${offer.price || ''}"></label><label>판매 묶음 수<input id="oBundles" type="number" step="1" min="1" value="${offer.bundles || 1}"></label><label>배송비<input id="oShipping" type="number" value="${offer.shipping || ''}"></label><label>행사<select id="oPromo"><option value="none">없음</option><option value="1+1">1+1</option><option value="2+1">2+1</option><option value="3+1">3+1</option></select></label><label class="span2">메모<input id="oNote" value="${esc(offer.note)}"></label><label class="span2">상품 URL<input id="oUrl" value="${esc(offer.sourceUrl)}"></label><label>상품 ID<input id="oPid" value="${esc(offer.productId)}"></label><label>선택 상품명<input id="oMatched" value="${esc(offer.matchedName)}"></label></div><div class="foot"><button class="btn primary" onclick="saveOffer('${id}','${storeId}')">저장</button><button class="btn soft" onclick="closeModal()">취소</button></div>`;
  $('oPromo').value = offer.promo; els.modal.classList.add('open');
}
async function recordPrice(snack, storeId, offer) {
  const store = stores.find(item => item.id === storeId); const checkedAt = offer.checkedAt || nowIso();
  const entry = { productId: snack.id, productName: snack.name, storeId, storeName: store?.name || storeId, price: offer.price, promotion: offer.promo || offer.promotion || 'none', checkedAt, sourceUrl: offer.sourceUrl || '', matchedName: offer.matchedName || '', actor: currentProfile() };
  history = addHistory(history, entry); save();
  if (!CONFIG.apiBase || !householdId() || !(offer.price > 0)) return;
  try { await fetch(CONFIG.apiBase.replace(/\/$/, '') + '/api/history?householdId=' + encodeURIComponent(householdId()), { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(entry) }); } catch {}
}
async function saveOffer(id, storeId) {
  const snack = snacks.find(item => item.id === id); const old = migrateOffer(snack.offers[storeId]);
  const offer = { ...old, price:num($('oPrice').value), bundles:num($('oBundles').value)||1, shipping:num($('oShipping').value), promo:$('oPromo').value, note:$('oNote').value.trim(), sourceUrl:$('oUrl').value.trim(), productId:$('oPid').value.trim(), matchedName:$('oMatched').value.trim(), checkedAt:nowIso() };
  snack.offers[storeId] = offer; await recordPrice(snack, storeId, offer); save(); render(); closeModal();
}

function clean(value = '') { return value.replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1|$2').replace(/[*_#>|`]/g,' ').replace(/\s+/g,' ').trim(); }
function parseProducts(text, storeId, snack) {
  const products=[]; const seen=new Set(); const pattern=/([0-9][0-9,]{2,})\s*원/g; let match;
  while ((match=pattern.exec(text)) && products.length<25) {
    const block=text.slice(Math.max(0,match.index-420),match.index); const lines=block.split('\n').map(clean).filter(value=>value.length>2&&value.length<180);
    const raw=[...lines].reverse().find(value=>textSimilarity(`${snack.brand} ${snack.name}`,value)>.25)||''; if(!raw)continue;
    const [name,url='']=raw.split('|'); const price=num(match[1].replace(/,/g,'')); const key=`${name}|${price}`; if(!price||seen.has(key))continue;
    seen.add(key); products.push({store:storeId,price,...extractCandidateMeta(name,url)});
  }
  return rankCandidates(snack,products,snack.offers?.[storeId]?.productId||'');
}
async function searchBackend(snack, storeId) {
  if (!CONFIG.apiBase) return null; const point=load('snackStoreSettings',{}); const url=new URL(CONFIG.apiBase.replace(/\/$/,'')+'/api/search');
  url.searchParams.set('q',`${snack.brand} ${snack.name}`.trim()); url.searchParams.set('retailer',storeId); url.searchParams.set('weight',snack.weight||''); url.searchParams.set('count',snack.count||''); url.searchParams.set('barcode',snack.barcode||''); url.searchParams.set('storeId',point[storeId]?.id||'');
  const response=await fetch(url); if(!response.ok) throw new Error('백엔드 검색 실패'); return response.json();
}
async function findSimilar(id, storeId) {
  const snack=snacks.find(item=>item.id===id); active={id,store:storeId};
  els.modalBody.innerHTML=`<h2>${FIXED[storeId].label} 후보 검색</h2><div class="status" id="status">규격이 비슷한 상품을 찾고 있습니다…</div><div id="candidateList"></div><div class="fallback" id="fallback"></div><button class="btn soft" style="width:100%;margin-top:8px" onclick="closeModal()">닫기</button>`; els.modal.classList.add('open');
  try {
    let items; const remote=await searchBackend(snack,storeId); const remembered=snack.offers?.[storeId]?.productId||'';
    if(remote?.products) items=rankCandidates(snack,remote.products.map(item=>remoteCandidate(item,storeId)),remembered);
    else { const response=await fetch('https://r.jina.ai/'+FIXED[storeId].url(`${snack.brand} ${snack.name}`.trim())); if(!response.ok)throw new Error('fallback search failed'); items=parseProducts(await response.text(),storeId,snack); }
    showCandidates(items.slice(0,12),remembered);
  } catch {
    $('status').textContent='자동 검색에 실패했습니다. 공식 검색 화면에서 확인 후 수동 입력하세요.'; const button=document.createElement('button'); button.className='btn dark'; button.textContent='공식 검색 열기'; button.onclick=()=>window.open(FIXED[storeId].url(snack.name),'_blank','noopener'); $('fallback').appendChild(button);
  }
}
function showCandidates(items, remembered='') {
  $('status').textContent=items.length?`${items.length}개 후보입니다. 규격을 확인하고 직접 선택하세요.`:'후보가 없습니다.'; $('candidateList').innerHTML='';
  items.forEach(candidate=>{ const button=document.createElement('button'); button.className='candidate'; const cls=candidate.score>=80?'good':candidate.score<55?'warn':''; const rememberedBadge=remembered&&candidate.productId===remembered?'<span class="badge">이전 선택</span>':''; button.innerHTML=`<span><strong>${esc(candidate.name)} ${rememberedBadge}</strong><small class="${cls}">일치 ${candidate.score}% · ${candidate.weight?candidate.weight+'g':'중량 미확인'} · ${candidate.count?candidate.count+'개':'수량 미확인'}${candidate.notes?.length?' · '+esc(candidate.notes.join(', ')):''}</small></span><span class="won">${candidate.price.toLocaleString()}원</span>`; button.onclick=()=>chooseCandidate(candidate); $('candidateList').appendChild(button); });
}
async function chooseCandidate(candidate) {
  const snack=snacks.find(item=>item.id===active.id); const old=migrateOffer(snack.offers[active.store]); const offer={...old,price:candidate.price,matchedName:candidate.name,matchScore:candidate.score,sourceUrl:candidate.url||FIXED[active.store].url(candidate.name),productId:candidate.productId||'',candidateWeight:candidate.weight||0,candidateCount:candidate.count||0,promo:candidate.promotion||old.promo,checkedAt:nowIso()};
  snack.offers[active.store]=offer; await recordPrice(snack,active.store,offer); save(); render(); editOffer(snack.id,active.store);
}
async function refreshRememberedPrices() {
  const targets=[];
  for(const snack of snacks){
    for(const store of stores.filter(item=>item.fixed)){
      const offer=migrateOffer(snack.offers[store.id]);
      if(offer.productId||offer.matchedName) targets.push({snack,store,offer});
    }
  }
  if(!targets.length) return alert('먼저 각 판매처에서 상품을 한 번 선택해 주세요.');
  let updated=0,skipped=0,failed=0;
  for(let i=0;i<targets.length;i+=1){
    const {snack,store,offer}=targets[i]; els.cloudStatus.textContent=`가격 갱신 ${i+1}/${targets.length}…`;
    try{
      const remote=await searchBackend(snack,store.id);
      const candidates=rankCandidates(snack,(remote?.products||[]).map(item=>remoteCandidate(item,store.id)),offer.productId||'');
      let candidate=null;
      if(offer.productId) candidate=candidates.find(item=>item.productId&&String(item.productId)===String(offer.productId));
      if(!candidate&&offer.matchedName){
        const expected=offer.matchedName.toLowerCase().replace(/\s+/g,'');
        candidate=candidates.find(item=>item.score>=85&&item.name.toLowerCase().replace(/\s+/g,'')===expected);
      }
      if(!candidate){skipped+=1;continue;}
      const next={...offer,price:candidate.price,matchedName:candidate.name,matchScore:candidate.score,sourceUrl:candidate.url||offer.sourceUrl,productId:candidate.productId||offer.productId,candidateWeight:candidate.weight||offer.candidateWeight,candidateCount:candidate.count||offer.candidateCount,promo:candidate.promotion||offer.promo,checkedAt:nowIso()};
      snack.offers[store.id]=next; await recordPrice(snack,store.id,next); updated+=1;
    }catch{failed+=1;}
  }
  save(); render(); els.cloudStatus.textContent=`갱신 ${updated} · 확인필요 ${skipped} · 실패 ${failed}`;
  alert(`가격 갱신 완료\n업데이트 ${updated}개\n상품 재선택 필요 ${skipped}개\n조회 실패 ${failed}개`);
}
function showHistory(id, storeId) {
  const snack=snacks.find(item=>item.id===id); const store=stores.find(item=>item.id===storeId); const rows=historyFor(history,id,storeId);
  els.modalBody.innerHTML=`<h2>${esc(snack.name)} · ${esc(store?.name||storeId)}</h2><div class="status">최근 ${rows.length}건</div>${rows.length?rows.slice(0,30).map(row=>`<div class="candidate"><span><strong>${Number(row.price).toLocaleString()}원</strong><small>${new Date(row.checkedAt).toLocaleString('ko-KR')} · ${esc(row.actor||'')} ${row.promotion&&row.promotion!=='none'?'· '+esc(row.promotion):''}</small></span><span class="won">${row.matchedName?esc(row.matchedName):''}</span></div>`).join(''):'<div class="tip">기록이 없습니다.</div>'}<button class="btn soft" style="width:100%;margin-top:8px" onclick="closeModal()">닫기</button>`; els.modal.classList.add('open');
}

function openProfileSettings() {
  els.modalBody.innerHTML=`<h2>사용자 / 공유 설정</h2><div class="formgrid"><label>현재 사용자 이름<input id="profileName" value="${esc(currentProfile())}" placeholder="예: 남편"></label><label>공유 가구키<input id="householdKey" value="${esc(householdId())}" placeholder="두 기기에서 같은 값"></label></div><div class="tip">두 분 기기에서 같은 가구키를 쓰고 사용자 이름만 다르게 설정하세요. 별점은 사용자별로 보관되고 상품·가격·이력은 공유됩니다.</div><div class="foot"><button class="btn primary" onclick="saveProfileSettings()">저장</button><button class="btn soft" onclick="closeModal()">취소</button></div>`; els.modal.classList.add('open');
}
function saveProfileSettings() {
  const name=$('profileName').value.trim()||'나'; const key=$('householdKey').value.trim(); localStorage.setItem('snackProfile',name); if(key)localStorage.setItem('snackHouseholdId',key); else localStorage.removeItem('snackHouseholdId'); closeModal(); render();
}
function openStoreSettings() {
  const points=load('snackStoreSettings',{}); els.modalBody.innerHTML=`<h2>기준 점포 설정</h2><div class="formgrid"><label>GS25 점포명<input id="gsName" value="${esc(points.gs25?.name||'')}"></label><label>GS25 점포 ID<input id="gsId" value="${esc(points.gs25?.id||'')}"></label><label>이마트24 점포명<input id="emName" value="${esc(points.emart24?.name||'')}"></label><label>이마트24 점포 ID<input id="emId" value="${esc(points.emart24?.id||'')}"></label></div><div class="tip">점포 ID를 알 수 있을 때만 입력하면 됩니다. 비워도 상품 가격 검색과 수동 입력은 정상 동작합니다.</div><div class="foot"><button class="btn primary" onclick="saveStoreSettings()">저장</button><button class="btn soft" onclick="closeModal()">취소</button></div>`; els.modal.classList.add('open');
}
function saveStoreSettings() { localStorage.setItem('snackStoreSettings',JSON.stringify({gs25:{name:$('gsName').value.trim(),id:$('gsId').value.trim()},emart24:{name:$('emName').value.trim(),id:$('emId').value.trim()}})); closeModal(); els.cloudStatus.textContent='기준 점포 저장됨'; }
async function fetchHousehold() {
  const response=await fetch(CONFIG.apiBase.replace(/\/$/,'')+'/api/household?householdId='+encodeURIComponent(householdId()));
  if(response.status===404)return null; if(!response.ok)throw new Error('공유 데이터 조회 실패'); return response.json();
}
function applyMerged(merged) {
  stores=merged.stores||stores; snacks=(merged.snacks||snacks).map(migrateSnack); basisMode=merged.basisMode||basisMode; history=merged.history||history; tombstones=merged.tombstones||tombstones;
  localStorage.setItem('snackStoreSettings',JSON.stringify(merged.storeSettings||{})); els.basis.value=basisMode; save(); render();
}
async function syncCloud(mode) {
  if(!CONFIG.apiBase){els.cloudStatus.textContent='백엔드 미연결';return alert('백엔드 주소가 없습니다.');}
  if(householdId().length<4){els.cloudStatus.textContent='공유키 필요';return openProfileSettings();}
  try {
    els.cloudStatus.textContent='동기화 중…'; const local={stores,snacks,basisMode,storeSettings:load('snackStoreSettings',{}),history,tombstones};
    if(mode==='push'){
      let remote=null; try{remote=await fetchHousehold();}catch{} const merged=mergeAppStates(local,remote||{});
      const response=await fetch(CONFIG.apiBase.replace(/\/$/,'')+'/api/household?householdId='+encodeURIComponent(householdId()),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...merged,updatedBy:currentProfile(),updatedAt:nowIso()})}); if(!response.ok)throw new Error('저장 실패');
      applyMerged(merged); els.cloudStatus.textContent=`${currentProfile()} · 공유 저장 완료`;
    } else {
      const remote=await fetchHousehold(); if(!remote)throw new Error('공유 데이터 없음'); const merged=mergeAppStates(local,remote); applyMerged(merged); els.cloudStatus.textContent=`${currentProfile()} · 공유 불러오기 완료`;
    }
  } catch(error){els.cloudStatus.textContent='동기화 실패'; alert(error.message||'동기화 실패');}
}
function closeModal(){els.modal.classList.remove('open');}

Object.assign(window,{setBasis,addSnack,addStore,removeStore,removeSnack,rate,sortRows,resetAll,editSpec,saveSpec,editOffer,saveOffer,findSimilar,refreshRememberedPrices,showHistory,openProfileSettings,saveProfileSettings,openStoreSettings,saveStoreSettings,syncCloud,closeModal});
els.newName.addEventListener('keydown',event=>{if(event.key==='Enter')addSnack();}); els.newStore.addEventListener('keydown',event=>{if(event.key==='Enter')addStore();}); els.modal.addEventListener('click',event=>{if(event.target===els.modal)closeModal();});
save(); render();
