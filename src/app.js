import {
  num,
  emptyOffer,
  migrateOffer,
  calculateMetrics,
  compareValue,
  bestValue,
  valueScore
} from './domain/price-calculator.js';
import { extractCandidateMeta, matchCandidate, rankCandidates, textSimilarity } from './domain/matcher.js';

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
const defaultsSnacks = ['몽쉘 딸기', '버터링 초코', '오예스 쿠앤크'].map((name, i) => ({
  id: String(Date.now() + i), name, brand: '', weight: 0, count: 0, barcode: '', rating: 0, offers: {}
}));

const $ = id => document.getElementById(id);
const els = {
  basis: $('basis'), headRow: $('headRow'), rows: $('rows'), modal: $('modal'), modalBody: $('modalBody'),
  newName: $('newName'), newStore: $('newStore'), cloudStatus: $('cloudStatus')
};

function load(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}
function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function migrateSnack(source = {}) {
  const offers = {};
  Object.entries(source.offers || source.prices || {}).forEach(([key, value]) => { offers[key] = migrateOffer(value); });
  return {
    id: String(source.id || Date.now() + Math.random()),
    name: source.name || '이름 없음', brand: source.brand || '', weight: num(source.weight), count: num(source.count),
    barcode: source.barcode || '', rating: num(source.rating), offers
  };
}

let stores = load('snackStoresV4', defaultsStores);
let snacks = load('snackSheetV4', null);
let basisMode = localStorage.getItem('snackBasis') || 'total';
let active = null;
if (!snacks) snacks = load('snackSheetV3', defaultsSnacks).map(migrateSnack);
else snacks = snacks.map(migrateSnack);
els.basis.value = basisMode;

function save() {
  localStorage.setItem('snackStoresV4', JSON.stringify(stores));
  localStorage.setItem('snackSheetV4', JSON.stringify(snacks));
  localStorage.setItem('snackBasis', basisMode);
}
function fmt(value) { return value ? Math.round(value).toLocaleString() : '-'; }
function specText(snack) {
  return [snack.brand, snack.weight ? `${snack.weight}g` : '', snack.count ? `${snack.count}개` : '', snack.barcode ? `바코드 ${snack.barcode}` : '']
    .filter(Boolean).join(' · ') || '규격 미입력';
}

function render() {
  els.headRow.innerHTML = '<th class="product">과자 / 규격 / 만족도</th>' + stores.map(store =>
    `<th><div class="storehead">${esc(store.name)}${store.fixed ? '' : `<button class="storedelete" onclick="removeStore('${store.id}')">×</button>`}</div></th>`
  ).join('') + '<th>가성비</th>';
  els.rows.innerHTML = '';
  if (!snacks.length) {
    els.rows.innerHTML = `<tr><td colspan="${stores.length + 2}">과자를 추가해 주세요.</td></tr>`;
    return;
  }
  snacks.forEach(snack => {
    const best = bestValue(snack, stores, basisMode);
    const row = document.createElement('tr');
    row.innerHTML = `<td class="product"><div class="phead"><div class="pname">${esc(snack.name)}</div><button class="mini" onclick="removeSnack('${snack.id}')">×</button></div><div class="spec">${esc(specText(snack))}</div><button class="edit" onclick="editSpec('${snack.id}')">규격 수정</button><div class="stars">${[1,2,3,4,5].map(n => `<button class="star ${snack.rating >= n ? 'on' : ''}" onclick="rate('${snack.id}',${n})">★</button>`).join('')}</div></td>` +
      stores.map(store => {
        const offer = migrateOffer(snack.offers[store.id]);
        const metrics = calculateMetrics(snack, offer);
        const value = compareValue(snack, offer, basisMode);
        const bestClass = best && Math.abs(value - best) < .01 ? 'best' : '';
        const source = offer.matchedName ? `<div class="source" title="${esc(offer.sourceUrl)}">↳ ${esc(offer.matchedName)} · 일치 ${offer.matchScore || 0}%</div>` : '';
        return `<td class="pricecell ${bestClass}"><div class="mainprice">${offer.price ? offer.price.toLocaleString() + '원' : '가격 없음'}</div><div class="unit">결제 ${fmt(metrics.total)}원<br>개당 ${fmt(metrics.each)}원 · 100g ${fmt(metrics.g100)}원</div>${source}<button class="find" onclick="${store.fixed ? `findSimilar('${snack.id}','${store.id}')` : `editOffer('${snack.id}','${store.id}')`}">${store.fixed ? '상품 찾기' : '가격 입력'}</button>${offer.price ? `<button class="edit" onclick="editOffer('${snack.id}','${store.id}')">상세 수정</button>` : ''}</td>`;
      }).join('') + `<td class="score">${valueScore(snack, stores, basisMode) ? valueScore(snack, stores, basisMode) + '점' : '-'}</td>`;
    els.rows.appendChild(row);
  });
}

function setBasis(value) { basisMode = value; save(); render(); }
function addSnack() {
  const name = els.newName.value.trim();
  if (name.length < 2) return alert('과자 이름을 2글자 이상 입력하세요.');
  const snack = migrateSnack({ id: String(Date.now()), name });
  snacks.unshift(snack); els.newName.value = ''; save(); render(); editSpec(snack.id);
}
function addStore() {
  const name = els.newStore.value.trim();
  if (name.length < 2) return alert('마트 이름을 2글자 이상 입력하세요.');
  if (stores.some(store => store.name === name)) return alert('같은 이름이 있습니다.');
  stores.push({ id: 'local_' + Date.now(), name, fixed: false }); els.newStore.value = ''; save(); render();
}
function removeStore(id) {
  const store = stores.find(item => item.id === id);
  if (!store || store.fixed || !confirm(`“${store.name}” 열을 삭제할까요?`)) return;
  stores = stores.filter(item => item.id !== id); snacks.forEach(snack => delete snack.offers[id]); save(); render();
}
function removeSnack(id) {
  const snack = snacks.find(item => item.id === id);
  if (snack && confirm(`“${snack.name}”을 삭제할까요?`)) { snacks = snacks.filter(item => item.id !== id); save(); render(); }
}
function rate(id, rating) { const snack = snacks.find(item => item.id === id); if (snack) snack.rating = rating; save(); render(); }
function sortRows() { snacks.sort((a, b) => valueScore(b, stores, basisMode) - valueScore(a, stores, basisMode)); save(); render(); }
function resetAll() {
  if (!confirm('모든 데이터를 초기화할까요?')) return;
  stores = structuredClone(defaultsStores); snacks = structuredClone(defaultsSnacks).map(migrateSnack); save(); render();
}

function editSpec(id) {
  const snack = snacks.find(item => item.id === id);
  els.modalBody.innerHTML = `<h2>과자 규격</h2><div class="formgrid"><label class="span2">상품명<input id="fName" value="${esc(snack.name)}"></label><label>브랜드<input id="fBrand" value="${esc(snack.brand)}"></label><label>총중량(g)<input id="fWeight" type="number" value="${snack.weight || ''}"></label><label>구성 개수<input id="fCount" type="number" value="${snack.count || ''}"></label><label>바코드<input id="fBarcode" value="${esc(snack.barcode)}"></label></div><div class="foot"><button class="btn primary" onclick="saveSpec('${id}')">저장</button><button class="btn soft" onclick="closeModal()">취소</button></div>`;
  els.modal.classList.add('open');
}
function saveSpec(id) {
  const snack = snacks.find(item => item.id === id);
  snack.name = $('fName').value.trim() || snack.name; snack.brand = $('fBrand').value.trim();
  snack.weight = num($('fWeight').value); snack.count = num($('fCount').value); snack.barcode = $('fBarcode').value.trim();
  save(); render(); closeModal();
}
function editOffer(id, storeId) {
  const snack = snacks.find(item => item.id === id);
  const offer = migrateOffer(snack.offers[storeId]);
  els.modalBody.innerHTML = `<h2>${esc(stores.find(item => item.id === storeId)?.name || storeId)} 가격 상세</h2><div class="formgrid"><label>판매가격<input id="oPrice" type="number" value="${offer.price || ''}"></label><label>판매 묶음 수<input id="oBundles" type="number" value="${offer.bundles || 1}"></label><label>배송비<input id="oShipping" type="number" value="${offer.shipping || ''}"></label><label>행사<select id="oPromo"><option value="none">없음</option><option value="1+1">1+1</option><option value="2+1">2+1</option><option value="3+1">3+1</option></select></label><label class="span2">메모<input id="oNote" value="${esc(offer.note)}"></label><label class="span2">상품 URL<input id="oUrl" value="${esc(offer.sourceUrl)}"></label><label>상품 ID<input id="oPid" value="${esc(offer.productId)}"></label><label>선택 상품명<input id="oMatched" value="${esc(offer.matchedName)}"></label></div><div class="foot"><button class="btn primary" onclick="saveOffer('${id}','${storeId}')">저장</button><button class="btn soft" onclick="closeModal()">취소</button></div>`;
  $('oPromo').value = offer.promo; els.modal.classList.add('open');
}
function saveOffer(id, storeId) {
  const snack = snacks.find(item => item.id === id); const old = migrateOffer(snack.offers[storeId]);
  snack.offers[storeId] = { ...old, price: num($('oPrice').value), bundles: num($('oBundles').value) || 1, shipping: num($('oShipping').value), promo: $('oPromo').value, note: $('oNote').value.trim(), sourceUrl: $('oUrl').value.trim(), productId: $('oPid').value.trim(), matchedName: $('oMatched').value.trim(), checkedAt: new Date().toISOString() };
  save(); render(); closeModal();
}

function clean(value = '') { return value.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1|$2').replace(/[*_#>|`]/g, ' ').replace(/\s+/g, ' ').trim(); }
function parseProducts(text, storeId, snack) {
  const products = []; const seen = new Set(); const pattern = /([0-9][0-9,]{2,})\s*원/g; let match;
  while ((match = pattern.exec(text)) && products.length < 25) {
    const block = text.slice(Math.max(0, match.index - 420), match.index);
    const lines = block.split('\n').map(clean).filter(value => value.length > 2 && value.length < 180);
    const raw = [...lines].reverse().find(value => textSimilarity(`${snack.brand} ${snack.name}`, value) > .25) || '';
    if (!raw) continue;
    const [name, url = ''] = raw.split('|'); const price = num(match[1].replace(/,/g, '')); const key = `${name}|${price}`;
    if (!price || seen.has(key)) continue;
    seen.add(key); products.push({ store: storeId, price, ...extractCandidateMeta(name, url) });
  }
  return rankCandidates(snack, products);
}
async function searchBackend(snack, storeId) {
  if (!CONFIG.apiBase) return null;
  const point = load('snackStoreSettings', {});
  const url = new URL(CONFIG.apiBase.replace(/\/$/, '') + '/api/search');
  url.searchParams.set('q', `${snack.brand} ${snack.name}`.trim()); url.searchParams.set('retailer', storeId);
  url.searchParams.set('weight', snack.weight || ''); url.searchParams.set('count', snack.count || ''); url.searchParams.set('barcode', snack.barcode || ''); url.searchParams.set('storeId', point[storeId]?.id || '');
  const response = await fetch(url); if (!response.ok) throw new Error('백엔드 검색 실패'); return response.json();
}
async function findSimilar(id, storeId) {
  const snack = snacks.find(item => item.id === id); active = { id, store: storeId };
  els.modalBody.innerHTML = `<h2>${FIXED[storeId].label} 후보 검색</h2><div class="status" id="status">규격이 비슷한 상품을 찾고 있습니다…</div><div id="candidateList"></div><div class="fallback" id="fallback"></div><button class="btn soft" style="width:100%;margin-top:8px" onclick="closeModal()">닫기</button>`; els.modal.classList.add('open');
  try {
    let items; const remote = await searchBackend(snack, storeId);
    if (remote?.products) items = rankCandidates(snack, remote.products.map(item => ({ store: storeId, ...item, ...extractCandidateMeta(item.name, item.url) })));
    else {
      const response = await fetch('https://r.jina.ai/' + FIXED[storeId].url(`${snack.brand} ${snack.name}`.trim()));
      if (!response.ok) throw new Error('fallback search failed'); items = parseProducts(await response.text(), storeId, snack);
    }
    showCandidates(items.slice(0, 12), snack);
  } catch {
    $('status').textContent = '자동 검색에 실패했습니다. 공식 검색 화면에서 확인 후 수동 입력하세요.';
    const button = document.createElement('button'); button.className = 'btn dark'; button.textContent = '공식 검색 열기';
    button.onclick = () => window.open(FIXED[storeId].url(snack.name), '_blank', 'noopener'); $('fallback').appendChild(button);
  }
}
function showCandidates(items) {
  $('status').textContent = items.length ? `${items.length}개 후보입니다. 규격을 확인하고 직접 선택하세요.` : '후보가 없습니다.'; $('candidateList').innerHTML = '';
  items.forEach(candidate => {
    const button = document.createElement('button'); button.className = 'candidate'; const cls = candidate.score >= 80 ? 'good' : candidate.score < 55 ? 'warn' : '';
    button.innerHTML = `<span><strong>${esc(candidate.name)}</strong><small class="${cls}">일치 ${candidate.score}% · ${candidate.weight ? candidate.weight + 'g' : '중량 미확인'} · ${candidate.count ? candidate.count + '개' : '수량 미확인'}${candidate.notes?.length ? ' · ' + esc(candidate.notes.join(', ')) : ''}</small></span><span class="won">${candidate.price.toLocaleString()}원</span>`;
    button.onclick = () => chooseCandidate(candidate); $('candidateList').appendChild(button);
  });
}
function chooseCandidate(candidate) {
  const snack = snacks.find(item => item.id === active.id); const old = migrateOffer(snack.offers[active.store]);
  snack.offers[active.store] = { ...old, price: candidate.price, matchedName: candidate.name, matchScore: candidate.score, sourceUrl: candidate.url || FIXED[active.store].url(candidate.name), productId: candidate.productId || '', candidateWeight: candidate.weight || 0, candidateCount: candidate.count || 0, checkedAt: new Date().toISOString() };
  save(); render(); editOffer(snack.id, active.store);
}

function openStoreSettings() {
  const points = load('snackStoreSettings', {});
  els.modalBody.innerHTML = `<h2>기준 점포 설정</h2><div class="formgrid"><label>GS25 점포명<input id="gsName" value="${esc(points.gs25?.name || '')}"></label><label>GS25 점포 ID<input id="gsId" value="${esc(points.gs25?.id || '')}"></label><label>이마트24 점포명<input id="emName" value="${esc(points.emart24?.name || '')}"></label><label>이마트24 점포 ID<input id="emId" value="${esc(points.emart24?.id || '')}"></label></div><div class="tip">현재 공개 웹검색은 점포별 재고를 보장하지 않습니다. 백엔드 어댑터가 연결되면 이 점포 ID를 검색 요청에 사용합니다.</div><div class="foot"><button class="btn primary" onclick="saveStoreSettings()">저장</button><button class="btn soft" onclick="closeModal()">취소</button></div>`; els.modal.classList.add('open');
}
function saveStoreSettings() {
  localStorage.setItem('snackStoreSettings', JSON.stringify({ gs25: { name: $('gsName').value.trim(), id: $('gsId').value.trim() }, emart24: { name: $('emName').value.trim(), id: $('emId').value.trim() } }));
  closeModal(); els.cloudStatus.textContent = '기준 점포 저장됨';
}
async function syncCloud(mode) {
  if (!CONFIG.apiBase) { els.cloudStatus.textContent = '백엔드 미연결'; return alert('config.js에 apiBase를 설정해야 합니다.'); }
  const userId = localStorage.getItem('snackUserId') || crypto.randomUUID(); localStorage.setItem('snackUserId', userId);
  try {
    const url = CONFIG.apiBase.replace(/\/$/, '') + '/api/snapshot?userId=' + encodeURIComponent(userId);
    if (mode === 'push') {
      const response = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stores, snacks, basisMode, storeSettings: load('snackStoreSettings', {}) }) });
      if (!response.ok) throw new Error('sync failed'); els.cloudStatus.textContent = '클라우드 저장 완료';
    } else {
      const response = await fetch(url); if (!response.ok) throw new Error('sync failed'); const data = await response.json();
      stores = data.stores || stores; snacks = (data.snacks || snacks).map(migrateSnack); basisMode = data.basisMode || basisMode;
      localStorage.setItem('snackStoreSettings', JSON.stringify(data.storeSettings || {})); els.basis.value = basisMode; save(); render(); els.cloudStatus.textContent = '클라우드 불러오기 완료';
    }
  } catch { els.cloudStatus.textContent = '동기화 실패'; }
}
function closeModal() { els.modal.classList.remove('open'); }

Object.assign(window, { setBasis, addSnack, addStore, removeStore, removeSnack, rate, sortRows, resetAll, editSpec, saveSpec, editOffer, saveOffer, findSimilar, openStoreSettings, saveStoreSettings, syncCloud, closeModal });
els.newName.addEventListener('keydown', event => { if (event.key === 'Enter') addSnack(); });
els.newStore.addEventListener('keydown', event => { if (event.key === 'Enter') addStore(); });
els.modal.addEventListener('click', event => { if (event.target === els.modal) closeModal(); });
save(); render();
