const EXTRA_RETAILERS = {
  cu: {
    label: 'CU',
    url: q => `https://cu.bgfretail.com/product/search.do?searchText=${encodeURIComponent(q)}`
  },
  seven: {
    label: '세븐일레븐',
    url: () => 'https://pyony.com/brands/seven/'
  }
};

const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
const num = value => Number(value) || 0;

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
      ? `${items.length}개 후보입니다. 규격을 확인하고 선택하세요.`
      : `${retailer.label}에서 현재 검색 가능한 상품을 찾지 못했습니다.`;

    for (const candidate of items) {
      const button = document.createElement('button');
      button.className = 'candidate';
      button.innerHTML = `<span><strong>${esc(candidate.name)}</strong><small>일치 ${candidate.score}% · ${candidate.weight ? candidate.weight + 'g' : '중량 미확인'} · ${candidate.promotion || '일반가격'}</small></span><span class="won">${num(candidate.price).toLocaleString()}원</span>`;
      button.onclick = () => {
        saveCandidate(snackId, storeId, candidate);
        window.location.reload();
      };
      list.appendChild(button);
    }

    if (!items.length) {
      const link = document.createElement('button');
      link.className = 'btn dark';
      link.textContent = `${retailer.label} 검색 화면 열기`;
      link.onclick = () => window.open(retailer.url(snack.name || ''), '_blank', 'noopener');
      document.getElementById('extraFallback').appendChild(link);
    }
  } catch (error) {
    document.getElementById('extraStatus').textContent = `자동 검색 실패: ${error.message || 'unknown error'}`;
    const link = document.createElement('button');
    link.className = 'btn dark';
    link.textContent = `${retailer.label} 검색 화면 열기`;
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

if (!installBridge()) {
  const timer = setInterval(() => {
    if (installBridge()) clearInterval(timer);
  }, 50);
  setTimeout(() => clearInterval(timer), 5000);
}
