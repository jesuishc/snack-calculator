const EXTRA_RETAILERS = {
  coupang: {
    label: '쿠팡',
    url: q => `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}`
  },
  gs25: {
    label: 'GS25',
    url: q => `https://gs25.gsretail.com/gscvs/ko/products/event-goods?searchWord=${encodeURIComponent(q)}`
  },
  cu: {
    label: 'CU',
    url: q => `https://cu.bgfretail.com/product/search.do?searchText=${encodeURIComponent(q)}`
  },
  seven: {
    label: '세븐일레븐',
    url: q => `https://www.7-eleven.co.kr/?search=${encodeURIComponent(q)}`
  }
};

const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
const num = value => Number(value) || 0;
const PENDING_SHARE_KEY = 'snackPendingRetailerShareV1';

function ensureRetailerColumns() {
  const key = 'snackStoresV4';
  let stores;
  try { stores = JSON.parse(localStorage.getItem(key) || '[]'); } catch { stores = []; }
  if (!Array.isArray(stores) || !stores.length) return false;
  let changed = false;
  for (const [id, retailer] of Object.entries(EXTRA_RETAILERS)) {
    if (!stores.some(store => store.id === id)) {
      stores.push({ id, name: retailer.label, fixed: true });
      changed = true;
    }
  }
  if (changed) localStorage.setItem(key, JSON.stringify(stores));
  return changed;
}

function getSnacks() {
  try { return JSON.parse(localStorage.getItem('snackSheetV4') || '[]'); }
  catch { return []; }
}

function saveCandidate(snackId, storeId, candidate) {
  const snacks = getSnacks();
  const snack = snacks.find(item => String(item.id) === String(snackId));
  if (!snack) return;
  snack.offers ||= {};
  const old = snack.offers[storeId] || {};
  snack.offers[storeId] = {
    ...old,
    price: num(candidate.price),
    matchedName: candidate.name || '',
    sourceUrl: candidate.url || EXTRA_RETAILERS[storeId].url(candidate.name || snack.name),
    productId: candidate.productId || '',
    candidateWeight: num(candidate.weight),
    candidateCount: num(candidate.count),
    promo: candidate.promotion || old.promo || 'none',
    checkedAt: new Date().toISOString()
  };
  localStorage.setItem('snackSheetV4', JSON.stringify(snacks));
}

function scoreCandidate(snack, item) {
  const query = `${snack.brand || ''} ${snack.name || ''}`.toLowerCase().trim();
  const name = String(item.name || '').toLowerCase();
  const tokens = query.split(/\s+/).filter(token => token.length > 1);
  const hits = tokens.filter(token => name.includes(token)).length;
  return tokens.length ? Math.round((hits / tokens.length) * 100) : 50;
}

function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('이 브라우저는 위치 정보를 지원하지 않습니다.'));
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => reject(new Error('GS25 가격 확인을 위해 위치 권한을 허용해 주세요.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

async function enrichGs25Candidate(snack, candidate, status) {
  status.textContent = '현재 위치 기준 GS25 매장 가격을 확인하고 있습니다…';
  const location = await getBrowserLocation();
  const url = new URL((window.SNACK_CONFIG?.apiBase || window.location.origin).replace(/\/$/, '') + '/api/search');
  url.searchParams.set('q', `${snack.brand || ''} ${snack.name || ''}`.trim());
  url.searchParams.set('retailer', 'gs25');
  url.searchParams.set('productId', candidate.productId || '');
  url.searchParams.set('lat', String(location.lat));
  url.searchParams.set('lng', String(location.lng));
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  const enriched = payload.products?.[0];
  if (!enriched || !(num(enriched.price) > 0)) throw new Error('인근 GS25 매장에서 가격을 확인하지 못했습니다.');
  return { ...candidate, ...enriched };
}

function rememberPendingShare(snackId, storeId, query) {
  localStorage.setItem(PENDING_SHARE_KEY, JSON.stringify({ snackId, storeId, query, createdAt: Date.now() }));
}

function readPendingShare() {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_SHARE_KEY) || 'null');
    if (!value || Date.now() - Number(value.createdAt || 0) > 30 * 60 * 1000) return null;
    return value;
  } catch { return null; }
}

function extractSharedUrl(params) {
  const direct = params.get('url') || '';
  if (/^https?:\/\//i.test(direct)) return direct.trim();
  const combined = `${params.get('text') || ''} ${params.get('title') || ''}`;
  return (combined.match(/https?:\/\/[^\s]+/i) || [])[0] || '';
}

async function consumeSharedProduct() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('shared') !== '1') return false;

  const pending = readPendingShare();
  const sharedUrl = extractSharedUrl(params);
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  modal.classList.add('open');

  if (!pending || !sharedUrl) {
    body.innerHTML = `<h2>공유 상품 확인 실패</h2><div class="status">어떤 과자에 저장할지 확인하지 못했습니다. 과자가격 앱에서 다시 상품 찾기를 눌러 시작해 주세요.</div><div class="foot"><button class="btn soft" onclick="closeModal()">닫기</button></div>`;
    history.replaceState({}, '', '/');
    return true;
  }

  body.innerHTML = `<h2>${esc(EXTRA_RETAILERS[pending.storeId]?.label || pending.storeId)} 가격 확인</h2><div class="status" id="shareStatus">선택한 상품 상세페이지에서 판매가격을 읽고 있습니다…</div>`;
  try {
    const url = new URL((window.SNACK_CONFIG?.apiBase || window.location.origin).replace(/\/$/, '') + '/api/search');
    url.searchParams.set('q', pending.query || '상품');
    url.searchParams.set('retailer', pending.storeId);
    url.searchParams.set('sourceUrl', sharedUrl);
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    const product = payload.products?.[0];
    if (!product || !(num(product.price) > 0)) throw new Error('선택한 상품의 판매가격을 읽지 못했습니다.');

    saveCandidate(pending.snackId, pending.storeId, product);
    localStorage.removeItem(PENDING_SHARE_KEY);
    history.replaceState({}, '', '/');
    document.getElementById('shareStatus').textContent = `${product.name || pending.query} · ${num(product.price).toLocaleString()}원 저장 완료`;
    setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    history.replaceState({}, '', '/');
    document.getElementById('shareStatus').textContent = `가격 자동 추출 실패: ${error.message || 'unknown error'}`;
    const foot = document.createElement('div');
    foot.className = 'foot';
    foot.innerHTML = '<button class="btn soft" onclick="closeModal()">닫기</button>';
    body.appendChild(foot);
  }
  return true;
}

function openCoupangShareFlow(snackId) {
  const snack = getSnacks().find(item => String(item.id) === String(snackId));
  if (!snack) return;
  const retailer = EXTRA_RETAILERS.coupang;
  const query = `${snack.brand || ''} ${snack.name || ''}`.trim();
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <h2>쿠팡 상품 선택</h2>
    <div class="status">원하는 상품을 연 뒤 쿠팡의 공유 버튼에서 <strong>과자가격</strong>을 선택하면 가격이 자동 저장됩니다.</div>
    <div class="tip">① 쿠팡 검색 열기 → ② 원하는 상품 상세페이지 열기 → ③ 공유 → 과자가격 선택. URL이나 가격을 직접 입력할 필요가 없습니다.</div>
    <button class="btn dark" style="width:100%;margin:10px 0" id="openCoupangSearch">쿠팡에서 “${esc(query)}” 검색</button>
    <div class="foot"><button class="btn soft" onclick="closeModal()">취소</button></div>`;
  modal.classList.add('open');
  document.getElementById('openCoupangSearch').onclick = () => {
    rememberPendingShare(snackId, 'coupang', query);
    window.open(retailer.url(query), '_blank', 'noopener');
  };
}

async function findExtraRetailer(snackId, storeId) {
  if (storeId === 'coupang') return openCoupangShareFlow(snackId);

  const retailer = EXTRA_RETAILERS[storeId];
  const snack = getSnacks().find(item => String(item.id) === String(snackId));
  if (!retailer || !snack) return;

  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  body.innerHTML = `<h2>${retailer.label} 후보 검색</h2><div class="status" id="extraStatus">상품 데이터를 조회하고 있습니다…</div><div id="extraCandidates"></div><div class="fallback" id="extraFallback"></div><button class="btn soft" style="width:100%;margin-top:8px" onclick="closeModal()">닫기</button>`;
  modal.classList.add('open');

  try {
    const url = new URL((window.SNACK_CONFIG?.apiBase || window.location.origin).replace(/\/$/, '') + '/api/search');
    url.searchParams.set('q', `${snack.brand || ''} ${snack.name || ''}`.trim());
    url.searchParams.set('retailer', storeId);
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    const items = (payload.products || [])
      .map(item => ({ ...item, score: scoreCandidate(snack, item) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const status = document.getElementById('extraStatus');
    const list = document.getElementById('extraCandidates');
    status.textContent = items.length
      ? (storeId === 'gs25'
        ? `${items.length}개 후보입니다. 상품을 누르면 현재 위치 기준 GS25 가격을 확인합니다.`
        : `${items.length}개 후보입니다. 상품을 누르면 가격과 상품 정보가 자동 입력됩니다.`)
      : `${retailer.label}에서 현재 상품을 찾지 못했습니다.`;

    for (const candidate of items) {
      const button = document.createElement('button');
      button.className = 'candidate';
      const priceText = num(candidate.price) > 0 ? `${num(candidate.price).toLocaleString()}원` : (storeId === 'gs25' ? '선택 후 가격확인' : '가격 미확인');
      button.innerHTML = `<span><strong>${esc(candidate.name)}</strong><small>일치 ${candidate.score}% · ${candidate.weight ? candidate.weight + 'g' : '중량 미확인'} · ${candidate.promotion || '일반가격'}</small></span><span class="won">${priceText}</span>`;
      button.onclick = async () => {
        button.disabled = true;
        try {
          const selected = storeId === 'gs25' ? await enrichGs25Candidate(snack, candidate, status) : candidate;
          saveCandidate(snackId, storeId, selected);
          window.location.reload();
        } catch (error) {
          button.disabled = false;
          status.textContent = `가격 확인 실패: ${error.message || 'unknown error'}`;
        }
      };
      list.appendChild(button);
    }

    if (!items.length) {
      const link = document.createElement('button');
      link.className = 'btn dark';
      link.textContent = `${retailer.label} 공식 화면 열기`;
      link.onclick = () => window.open(retailer.url(snack.name || ''), '_blank', 'noopener');
      document.getElementById('extraFallback').appendChild(link);
    }
  } catch (error) {
    document.getElementById('extraStatus').textContent = `자동 검색 실패: ${error.message || 'unknown error'}`;
    const link = document.createElement('button');
    link.className = 'btn dark';
    link.textContent = `${retailer.label} 공식 화면 열기`;
    link.onclick = () => window.open(retailer.url(snack.name || ''), '_blank', 'noopener');
    document.getElementById('extraFallback').appendChild(link);
  }
}

function installBridge() {
  if (typeof window.findSimilar !== 'function') return false;
  const original = window.findSimilar;
  window.findSimilar = (id, storeId) => EXTRA_RETAILERS[storeId]
    ? findExtraRetailer(id, storeId)
    : original(id, storeId);
  return true;
}

async function bootRetailerExtension() {
  if (ensureRetailerColumns()) {
    window.location.reload();
    return;
  }
  await consumeSharedProduct();
  if (!installBridge()) {
    const timer = setInterval(() => {
      if (installBridge()) clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 5000);
  }
}

bootRetailerExtension();
