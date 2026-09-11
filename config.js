window.SNACK_CONFIG = {
  // 개인용 기본값: `npm start`로 실행한 현재 서버의 /api/* 를 사용합니다.
  // 별도 백엔드를 쓰는 경우에만 전체 URL로 바꾸세요.
  apiBase: window.location.origin
};

// 기존 사용자도 새 고정 판매처 컬럼을 자동으로 받도록 localStorage를 가볍게 마이그레이션합니다.
try {
  const key = 'snackStoresV4';
  const current = JSON.parse(localStorage.getItem(key) || 'null');
  const defaults = [
    { id: 'coupang', name: '쿠팡', fixed: true },
    { id: 'gs25', name: 'GS25', fixed: true },
    { id: 'emart24', name: '이마트24', fixed: true },
    { id: 'cu', name: 'CU', fixed: true },
    { id: 'seven', name: '세븐일레븐', fixed: true }
  ];
  if (Array.isArray(current)) {
    for (const store of defaults) {
      if (!current.some(item => item?.id === store.id)) current.push(store);
    }
    localStorage.setItem(key, JSON.stringify(current));
  } else if (current == null) {
    localStorage.setItem(key, JSON.stringify(defaults));
  }
} catch {}
