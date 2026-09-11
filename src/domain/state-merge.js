function timestamp(value = '') {
  return Date.parse(value) || 0;
}

export function newerOffer(a, b) {
  if (!a) return b;
  if (!b) return a;
  return timestamp(a.checkedAt) >= timestamp(b.checkedAt) ? a : b;
}

export function mergeTombstones(a = {}, b = {}) {
  const result = { snacks: {}, stores: {} };
  for (const kind of ['snacks', 'stores']) {
    const ids = new Set([...Object.keys(a[kind] || {}), ...Object.keys(b[kind] || {})]);
    for (const id of ids) {
      const left = a[kind]?.[id] || '';
      const right = b[kind]?.[id] || '';
      result[kind][id] = timestamp(left) >= timestamp(right) ? left : right;
    }
  }
  return result;
}

function mergeSnack(local, remote) {
  if (!remote) return structuredClone(local);
  if (!local) return structuredClone(remote);
  const offers = { ...(remote.offers || {}) };
  for (const [storeId, localOffer] of Object.entries(local.offers || {})) {
    offers[storeId] = newerOffer(localOffer, remote.offers?.[storeId]);
  }
  return {
    ...remote,
    ...local,
    ratings: { ...(remote.ratings || {}), ...(local.ratings || {}) },
    offers
  };
}

export function mergeHistoryRows(a = [], b = [], limit = 500) {
  const map = new Map();
  for (const item of [...a, ...b]) {
    const key = item.id || `${item.productId}|${item.storeId}|${item.price}|${item.promotion}|${item.checkedAt}`;
    map.set(key, item);
  }
  return [...map.values()].sort((x, y) => timestamp(y.checkedAt) - timestamp(x.checkedAt)).slice(0, limit);
}

export function mergeAppStates(local = {}, remote = {}) {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);

  const storeMap = new Map((remote.stores || []).map(store => [String(store.id), structuredClone(store)]));
  for (const store of local.stores || []) {
    const id = String(store.id);
    storeMap.set(id, { ...(storeMap.get(id) || {}), ...structuredClone(store) });
  }
  for (const id of Object.keys(tombstones.stores)) storeMap.delete(String(id));

  const snackMap = new Map((remote.snacks || []).map(snack => [String(snack.id), structuredClone(snack)]));
  for (const snack of local.snacks || []) {
    const id = String(snack.id);
    snackMap.set(id, mergeSnack(snack, snackMap.get(id)));
  }
  for (const id of Object.keys(tombstones.snacks)) snackMap.delete(String(id));

  return {
    stores: [...storeMap.values()],
    snacks: [...snackMap.values()],
    basisMode: local.basisMode || remote.basisMode || 'total',
    storeSettings: { ...(remote.storeSettings || {}), ...(local.storeSettings || {}) },
    history: mergeHistoryRows(remote.history || [], local.history || []),
    tombstones
  };
}
