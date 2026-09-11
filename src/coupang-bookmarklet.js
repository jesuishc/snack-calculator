const PENDING_KEY = 'snackPendingRetailerClipboardV2';
const SHEET_KEY = 'snackSheetV4';

const esc = (value = '') => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
const num = value => Number(String(value ?? '').replace(/[^0-9]/g, '')) || 0;

function readPending() {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    if (!value || value.storeId !== 'coupang' || Date.now() - Number(value.createdAt || 0) > 30 * 60 * 1000) return null;
    return value;
  } catch { return null; }
}

function readSnacks() {
  try { return JSON.parse(localStorage.getItem(SHEET_KEY) || '[]'); }
  catch { return []; }
}

function showModal(title, html) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  if (!modal || !body) return;
  body.innerHTML = `<h2>${esc(title)}</h2>${html}<div class="foot"><button class="btn soft" onclick="closeModal()">닫기</button></div>`;
  modal.classList.add('open');
}

function saveCapturedProduct(pending, captured) {
  const snacks = readSnacks();
  const snack = snacks.find(item => String(item.id) === String(pending.snackId));
  if (!snack) throw new Error('저장할 과자 행을 찾지 못했습니다.');
  snack.offers ||= {};
  const old = snack.offers.coupang || {};
  snack.offers.coupang = {
    ...old,
    price: captured.price,
    matchedName: captured.name || pending.query || snack.name || '',
    sourceUrl: captured.sourceUrl || '',
    productId: captured.productId || '',
    promo: old.promo || 'none',
    checkedAt: new Date().toISOString()
  };
  localStorage.setItem(SHEET_KEY, JSON.stringify(snacks));
  localStorage.removeItem(PENDING_KEY);
}

function consumeCoupangCapture() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (params.get('coupangCapture') !== '1') return false;
  const pending = readPending();
  const captured = {
    price: num(params.get('price')),
    name: params.get('name') || '',
    productId: params.get('productId') || '',
    sourceUrl: params.get('sourceUrl') || ''
  };
  history.replaceState({}, '', location.pathname + location.search);
  if (!pending) {
    showModal('쿠팡 가격 저장 실패', '<div class="status">어떤 과자에 저장할지 확인하지 못했습니다. 과자 행에서 쿠팡 상품 찾기를 다시 시작해 주세요.</div>');
    return true;
  }
  if (!(captured.price > 0)) {
    showModal('쿠팡 가격 저장 실패', '<div class="status">선택한 가격을 확인하지 못했습니다. 쿠팡 상품 페이지에서 가격 선택 도구를 다시 실행해 주세요.</div>');
    return true;
  }
  try {
    saveCapturedProduct(pending, captured);
    showModal('쿠팡 가격 저장 완료', `<div class="status"><strong>${esc(captured.name || pending.query)}</strong><br>${captured.price.toLocaleString()}원으로 저장했습니다.</div>`);
    setTimeout(() => location.reload(), 900);
  } catch (error) {
    showModal('쿠팡 가격 저장 실패', `<div class="status">${esc(error.message || '저장하지 못했습니다.')}</div>`);
  }
  return true;
}

function coupangBookmarkletRuntime(appOrigin) {
  try {
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const host = location.hostname.toLowerCase();
    if (!(host === 'coupang.com' || host.endsWith('.coupang.com'))) {
      alert('쿠팡 상품 상세페이지에서 실행해 주세요.');
      return;
    }

    const title = clean(
      document.querySelector('h1')?.innerText ||
      document.querySelector('meta[property="og:title"]')?.content ||
      document.title.replace(/\s*[-|]\s*쿠팡.*$/i, '')
    );
    const sourceUrl = location.href;
    const productId = (sourceUrl.match(/\/vp\/products\/(\d+)/i) || [])[1] || '';
    const candidates = new Map();
    const badContext = text => /(?:10g당|100g당|1g당|kg당|개당|1개당|월\s*[0-9,]+\s*원|적립|캐시|배송비|쿠폰|카드할인)/i.test(text);
    const add = (rawPrice, context = '', score = 0) => {
      const price = Number(String(rawPrice || '').replace(/[^0-9]/g, ''));
      const label = clean(context).slice(0, 100);
      if (!Number.isFinite(price) || price < 100 || price > 10000000 || badContext(label)) return;
      const prev = candidates.get(price);
      const entry = { price, label, score };
      if (!prev || entry.score > prev.score) candidates.set(price, entry);
    };

    const visitJson = value => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visitJson); return; }
      const type = String(value['@type'] || '').toLowerCase();
      if (type.includes('offer') || type.includes('aggregateoffer')) {
        add(value.price, '상품 구조화 가격', 120);
        add(value.lowPrice, '상품 구조화 최저가', 115);
        add(value.highPrice, '상품 구조화 최고가', 80);
      }
      Object.values(value).forEach(visitJson);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try { visitJson(JSON.parse(script.textContent || 'null')); } catch {}
    });

    const preferredSelectors = [
      '[class*="total-price"]', '[class*="final-price"]', '[class*="sale-price"]',
      '[class*="prod-sale-price"]', '[class*="price-value"]', '[data-testid*="price"]'
    ];
    preferredSelectors.forEach((selector, index) => {
      document.querySelectorAll(selector).forEach(element => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const text = clean(element.innerText || element.textContent || '');
        const match = text.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,7})\s*원/);
        if (match) add(match[1], text, 100 - index * 4);
      });
    });

    const lines = String(document.body?.innerText || '').split(/\n+/).map(clean).filter(Boolean);
    for (const line of lines) {
      const matches = [...line.matchAll(/(?:^|[^0-9])([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,7})\s*원/g)];
      for (const match of matches) {
        let score = 20;
        if (/(?:판매가|할인가|와우|쿠팡가|가격)/i.test(line)) score += 35;
        if (line.length < 45) score += 10;
        add(match[1], line, score);
      }
    }

    const ranked = [...candidates.values()]
      .sort((a, b) => b.score - a.score || a.price - b.price)
      .slice(0, 8);

    document.getElementById('__snackPricePicker')?.remove();
    const overlay = document.createElement('div');
    overlay.id = '__snackPricePicker';
    overlay.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#111827;color:white;border-radius:18px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.45);font-family:system-ui,-apple-system,sans-serif;max-height:70vh;overflow:auto';
    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:18px;font-weight:800;margin-bottom:6px';
    heading.textContent = '과자가격 · 현재 판매가 선택';
    overlay.appendChild(heading);
    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:13px;opacity:.8;margin-bottom:12px';
    subtitle.textContent = title || '현재 쿠팡 상품';
    overlay.appendChild(subtitle);

    const send = price => {
      const params = new URLSearchParams({
        coupangCapture: '1',
        price: String(price),
        name: title,
        productId,
        sourceUrl
      });
      location.href = `${appOrigin}/#${params.toString()}`;
    };

    if (!ranked.length) {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:14px;margin-bottom:10px';
      note.textContent = '자동으로 가격 후보를 찾지 못했습니다. 아래에 현재 판매가 숫자만 입력해 주세요.';
      overlay.appendChild(note);
    } else {
      ranked.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.style.cssText = 'display:block;width:100%;text-align:left;background:#fff;color:#111827;border:0;border-radius:12px;padding:12px;margin:8px 0;font-size:17px;font-weight:800';
        button.textContent = `${item.price.toLocaleString()}원`;
        if (item.label && item.label !== '상품 구조화 가격') button.title = item.label;
        button.onclick = () => send(item.price);
        overlay.appendChild(button);
      });
    }

    const manualRow = document.createElement('div');
    manualRow.style.cssText = 'display:flex;gap:8px;margin-top:10px';
    const input = document.createElement('input');
    input.inputMode = 'numeric';
    input.placeholder = '가격 직접 입력';
    input.style.cssText = 'min-width:0;flex:1;border:0;border-radius:10px;padding:11px;font-size:16px';
    const manualButton = document.createElement('button');
    manualButton.type = 'button';
    manualButton.textContent = '확인';
    manualButton.style.cssText = 'border:0;border-radius:10px;padding:11px 15px;font-size:15px;font-weight:800;background:#2563eb;color:white';
    manualButton.onclick = () => {
      const price = Number(String(input.value || '').replace(/[^0-9]/g, ''));
      if (price > 0) send(price); else input.focus();
    };
    manualRow.append(input, manualButton);
    overlay.appendChild(manualRow);

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '닫기';
    close.style.cssText = 'width:100%;border:0;background:transparent;color:#cbd5e1;padding:10px;margin-top:4px;font-size:14px';
    close.onclick = () => overlay.remove();
    overlay.appendChild(close);
    document.body.appendChild(overlay);
  } catch (error) {
    alert(`가격 선택 도구 실행 실패: ${error?.message || error}`);
  }
}

export function buildCoupangBookmarklet(appOrigin = location.origin) {
  return `javascript:(${coupangBookmarkletRuntime.toString()})(${JSON.stringify(appOrigin)});void 0`;
}

function copyText(text, textarea) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  return Promise.resolve();
}

function openBookmarkletSetup() {
  const code = buildCoupangBookmarklet(location.origin);
  showModal('쿠팡 가격 선택 도구 설치', `
    <div class="status">처음 한 번만 북마크로 저장하면 Chrome과 Whale에서 계속 사용할 수 있습니다.</div>
    <div class="tip">① 아래 <strong>코드 복사</strong> → ② 브라우저에서 아무 북마크 하나 추가 → ③ 북마크 이름을 <strong>과자가격 가져오기</strong>로 변경 → ④ URL을 지우고 복사한 코드로 교체.<br><br>이후 쿠팡 상품 상세페이지에서 그 북마크를 실행하면 작은 가격 선택창이 뜹니다.</div>
    <textarea id="bookmarkletCode" readonly style="width:100%;height:92px;box-sizing:border-box;margin:10px 0;padding:10px;font-size:12px">${esc(code)}</textarea>
    <button class="btn primary" style="width:100%" id="copyBookmarkletCode">북마클릿 코드 복사</button>
  `);
  const textarea = document.getElementById('bookmarkletCode');
  const button = document.getElementById('copyBookmarkletCode');
  if (button && textarea) {
    button.onclick = async () => {
      try {
        await copyText(code, textarea);
        button.textContent = '복사 완료 ✓';
      } catch {
        textarea.focus();
        textarea.select();
        button.textContent = '코드를 선택했습니다 · 복사해 주세요';
      }
    };
  }
}

function injectSetupButton() {
  const body = document.getElementById('modalBody');
  if (!body || body.querySelector('#coupangBookmarkletSetup')) return;
  const heading = body.querySelector('h2');
  if (!heading || !/쿠팡 상품 선택/.test(heading.textContent || '')) return;
  const target = body.querySelector('#openCoupangSearch');
  if (!target) return;
  const button = document.createElement('button');
  button.id = 'coupangBookmarkletSetup';
  button.className = 'btn soft';
  button.style.cssText = 'width:100%;margin:4px 0 10px';
  button.textContent = '📌 가격 선택 도구 처음 설치하기';
  button.onclick = openBookmarkletSetup;
  target.insertAdjacentElement('beforebegin', button);

  const tip = body.querySelector('.tip');
  if (tip) tip.innerHTML = '<strong>추천 방식:</strong> 쿠팡 상품을 연 뒤 저장해둔 <strong>과자가격 가져오기</strong> 북마크를 실행 → 화면에 뜬 실제 판매가를 한 번 선택하면 자동 저장됩니다.';
}

function boot() {
  const consumed = consumeCoupangCapture();
  if (consumed) return;
  const modalBody = document.getElementById('modalBody');
  if (modalBody) new MutationObserver(injectSetupButton).observe(modalBody, { childList: true, subtree: true });
  injectSetupButton();
}

boot();
