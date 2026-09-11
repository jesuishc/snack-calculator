export function num(value) {
  return Math.max(0, Number(value) || 0);
}

export function emptyOffer(value = 0) {
  return {
    price: num(value),
    bundles: 1,
    shipping: 0,
    promo: 'none',
    note: '',
    checkedAt: '',
    sourceUrl: '',
    productId: '',
    matchedName: '',
    matchScore: 0,
    candidateWeight: 0,
    candidateCount: 0
  };
}

export function migrateOffer(value) {
  if (typeof value === 'number') return emptyOffer(value);
  const source = value || {};
  return {
    ...emptyOffer(),
    ...source,
    price: num(source.price),
    bundles: num(source.bundles) || 1,
    shipping: num(source.shipping),
    candidateWeight: num(source.candidateWeight),
    candidateCount: num(source.candidateCount)
  };
}

export function receivedBundles(offer) {
  const bundles = num(offer?.bundles) || 1;
  switch (offer?.promo) {
    case '1+1': return bundles * 2;
    case '2+1': return bundles * 1.5;
    case '3+1': return bundles * (4 / 3);
    default: return bundles;
  }
}

export function calculateMetrics(product, rawOffer) {
  const offer = migrateOffer(rawOffer);
  if (!offer.price) return { total: 0, each: 0, g100: 0 };

  const total = offer.price * offer.bundles + offer.shipping;
  const received = receivedBundles(offer);
  const pieces = (num(product?.count) || 1) * received;
  const grams = num(product?.weight) * received;

  return {
    total,
    each: pieces ? total / pieces : 0,
    g100: grams ? (total / grams) * 100 : 0
  };
}

export function compareValue(product, offer, basis = 'total') {
  const metrics = calculateMetrics(product, offer);
  if (basis === 'each') return metrics.each;
  if (basis === '100g') return metrics.g100;
  return metrics.total;
}

export function bestValue(product, stores, basis = 'total') {
  const values = stores
    .map(store => compareValue(product, product?.offers?.[store.id], basis))
    .filter(value => value > 0);
  return values.length ? Math.min(...values) : 0;
}

export function valueScore(product, stores, basis = 'total') {
  const best = bestValue(product, stores, basis);
  const rating = num(product?.rating);
  return best && rating ? Number(((rating / best) * 1000).toFixed(2)) : 0;
}
