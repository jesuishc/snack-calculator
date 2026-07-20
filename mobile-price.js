(() => {
  const nativeLookup = window.lookupPrice;
  const JINA = 'https://r.jina.ai/';

  function clean(value = '') {
    return value
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_#>|`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseProducts(text, source, query) {
    const products = [];
    const seen = new Set();
    const pricePattern = /([0-9][0-9,]{2,})\s*원/g;
    let match;

    while ((match = pricePattern.exec(text)) && products.length < 12) {
      const start = Math.max(0, match.index - 260);
      const context = text.slice(start, match.index);
      const lines = context.split('\n').map(clean).filter(Boolean);
      const queryLine = [...lines].reverse().find(line =>
        line.toLowerCase().includes(query.toLowerCase()) &&
        line.length >= 2 && line.length <= 120
      );
      const name = queryLine || lines.at(-1) || query;
      const price = Number(match[1].replace(/,/g, ''));
      const key = `${name}|${price}`;
      if (!price || seen.has(key)) continue;
      seen.add(key);
      products.push({ retailer: source, name, price, promotion: '' });
    }
    return products;
  }

  async function readPage(targetUrl) {
    const response = await fetch(`${JINA}${targetUrl}`, {
      headers: { Accept: 'text/plain' }
    });
    if (!response.ok) throw new Error(`가격 페이지 응답 오류 ${response.status}`);
    return response.text();
  }

  async function githubPagesLookup(query, selectedRetailer) {
    const jobs = [];
    if (selectedRetailer === 'all' || selectedRetailer === 'coupang') {
      const url = `https://www.coupang.com/np/search?q=${encodeURIComponent(query)}`;
      jobs.push(readPage(url).then(text => parseProducts(text, 'coupang', query)));
    }
    if (selectedRetailer === 'all' || selectedRetailer === 'gs25') {
      const url = 'https://gs25.gsretail.com/gscvs/ko/products/event-goods';
      jobs.push(readPage(url).then(text => parseProducts(text, 'gs25', query)));
    }
    const settled = await Promise.allSettled(jobs);
    const products = settled
      .filter(item => item.status === 'fulfilled')
      .flatMap(item => item.value)
      .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 12);
    return products;
  }

  function renderResults(items) {
    lookupResults.innerHTML = '';
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'result';
      el.innerHTML = `<div><strong>${item.name}</strong><small>${item.retailer.toUpperCase()} ${item.promotion || ''}</small></div><span class="price">${item.price.toLocaleString()}원</span><button class="apply">가격 적용</button>`;
      el.querySelector('button').onclick = () => applyResult(item);
      lookupResults.appendChild(el);
    });
  }

  function renderFallbackLinks(query) {
    lookupResults.innerHTML = '';
    const links = [
      ['쿠팡에서 직접 검색', `https://www.coupang.com/np/search?q=${encodeURIComponent(query)}`],
      ['GS25 행사상품 열기', 'https://gs25.gsretail.com/gscvs/ko/products/event-goods'],
      ['네이버쇼핑에서 검색', `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(query)}`]
    ];
    links.forEach(([label, url]) => {
      const button = document.createElement('button');
      button.className = 'apply';
      button.style.cssText = 'width:100%;margin-top:7px;padding:11px';
      button.textContent = label;
      button.onclick = () => window.open(url, '_blank', 'noopener');
      lookupResults.appendChild(button);
    });
  }

  window.lookupPrice = async function lookupPriceMobile() {
    const q = query.value.trim();
    if (q.length < 2) return alert('상품명을 2글자 이상 입력하세요.');
    lookupStatus.textContent = '가격을 조회하고 있습니다…';
    lookupResults.innerHTML = '';

    if (!location.hostname.endsWith('github.io')) {
      try {
        await nativeLookup();
        if (!lookupStatus.textContent.startsWith('조회 실패')) return;
      } catch (_) {}
    }

    try {
      const items = await githubPagesLookup(q, retailer.value);
      if (items.length) {
        renderResults(items);
        lookupStatus.textContent = `${items.length}개 결과 · 모바일 웹 조회`;
      } else {
        lookupStatus.textContent = '자동 가격을 찾지 못했습니다. 아래 판매처 검색 버튼으로 확인할 수 있습니다.';
        renderFallbackLinks(q);
      }
    } catch (error) {
      lookupStatus.textContent = '자동 조회가 일시적으로 제한되었습니다. 아래 판매처 검색 버튼을 이용하세요.';
      renderFallbackLinks(q);
    }
  };
})();