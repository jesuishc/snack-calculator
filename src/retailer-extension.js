const EXTRA_RETAILERS = {
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

async function findExtraRetailer(snackId, storeId) {
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

if (ensureRetailerColumns()) {
  window.location.reload();
} else if (!installBridge()) {
  const timer = setInterval(() => {
    if (installBridge()) clearInterval(timer);
  }, 50);
  setTimeout(() => clearInterval(timer), 5000);
}
