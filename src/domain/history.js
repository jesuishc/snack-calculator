export function addHistory(history = [], entry = {}, limit = 500) {
  const next = {
    id: entry.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    productId: String(entry.productId || ''),
    productName: String(entry.productName || ''),
    storeId: String(entry.storeId || ''),
    storeName: String(entry.storeName || ''),
    price: Math.max(0, Number(entry.price) || 0),
    promotion: String(entry.promotion || 'none'),
    checkedAt: entry.checkedAt || new Date().toISOString(),
    sourceUrl: String(entry.sourceUrl || ''),
    matchedName: String(entry.matchedName || ''),
    actor: String(entry.actor || '')
  };
  if (!next.productId || !next.storeId || !next.price) return history;
  const duplicate = history[0] && history[0].productId === next.productId && history[0].storeId === next.storeId && history[0].price === next.price && history[0].promotion === next.promotion;
  if (duplicate) return history;
  return [next, ...history].slice(0, limit);
}

export function historyFor(history = [], productId, storeId = '') {
  return history.filter(item => item.productId === String(productId) && (!storeId || item.storeId === String(storeId)))
    .sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt));
}

export function priceChange(history = [], productId, storeId) {
  const rows = historyFor(history, productId, storeId);
  if (rows.length < 2) return null;
  const [latest, previous] = rows;
  return { amount: latest.price - previous.price, percent: previous.price ? ((latest.price - previous.price) / previous.price) * 100 : 0 };
}
