import { num } from './price-calculator.js';

export function tokens(value = '') {
  return String(value).toLowerCase().replace(/[^0-9a-z가-힣 ]/g, ' ').split(/\s+/).filter(token => token.length > 1);
}

export function textSimilarity(a, b) {
  const left = tokens(a); const right = tokens(b);
  if (!left.length) return 0;
  const hits = left.filter(x => right.some(y => y === x || y.includes(x) || x.includes(y))).length;
  return hits / left.length;
}

export function parseSpec(name = '') {
  const text = String(name).toLowerCase();
  const weightFirst = text.match(/(\d+(?:\.\d+)?)\s*(g|kg|그램)\s*[x×*]\s*(\d+)\s*(?:개입|개|입|ea|p|팩|pack)?/i);
  const countFirst = text.match(/(\d+)\s*(?:개입|개|입|ea|p|팩|pack)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(g|kg|그램)/i);
  let weight = 0; let count = 0;
  if (weightFirst) {
    const each = num(weightFirst[1]) * (/kg/i.test(weightFirst[2]) ? 1000 : 1);
    count = num(weightFirst[3]); weight = each * count;
  } else if (countFirst) {
    count = num(countFirst[1]);
    const each = num(countFirst[2]) * (/kg/i.test(countFirst[3]) ? 1000 : 1);
    weight = each * count;
  }
  if (!weight) {
    const total = text.match(/(?:총\s*)?(\d+(?:\.\d+)?)\s*(kg|g|그램)(?:\s|$|[,/])/i) || text.match(/(?:총\s*)?(\d+(?:\.\d+)?)\s*(kg|g|그램)/i);
    if (total) weight = num(total[1]) * (/kg/i.test(total[2]) ? 1000 : 1);
  }
  if (!count) {
    const c = text.match(/(\d+)\s*(?:개입|개|입|ea|팩|pack|p)(?:\s|$|[,/])/i) || text.match(/(\d+)\s*(?:개입|개|입|ea|팩|pack|p)/i);
    if (c) count = num(c[1]);
  }
  return { weight, count };
}

export function extractCandidateMeta(name = '', url = '') {
  const spec = parseSpec(name);
  const idMatch = String(url).match(/(?:products\/|itemId=|vendorItemId=|goodsNo=)([\w-]+)/i);
  return { name, ...spec, barcode: '', url, productId: idMatch?.[1] || '' };
}

function closeness(expected, actual) {
  if (!num(expected) || !num(actual)) return 0;
  const diff = Math.abs(expected - actual) / expected;
  return Math.max(0, 1 - diff);
}

export function matchCandidate(product, candidate, rememberedProductId = '') {
  const remembered = Boolean(rememberedProductId && candidate?.productId && String(candidate.productId) === String(rememberedProductId));
  if (remembered) return { score: 100, notes: ['이전에 선택한 상품'], remembered: true };
  if (product?.barcode && candidate?.barcode && product.barcode === candidate.barcode) return { score: 100, notes: ['바코드 일치'], remembered: false };

  const notes = [];
  let points = textSimilarity(`${product?.brand || ''} ${product?.name || ''}`, candidate?.name || '') * 50;
  if (product?.brand) {
    if ((candidate?.name || '').toLowerCase().includes(product.brand.toLowerCase())) points += 15;
    else notes.push('브랜드 미확인');
  }
  if (num(product?.weight)) {
    if (num(candidate?.weight)) { const close = closeness(product.weight, candidate.weight); points += 20 * close; if (close < .9) notes.push(`중량 ${candidate.weight}g`); }
    else notes.push('중량 미확인');
  }
  if (num(product?.count)) {
    if (num(candidate?.count)) { const close = closeness(product.count, candidate.count); points += 15 * close; if (close < .9) notes.push(`수량 ${candidate.count}개`); }
    else notes.push('수량 미확인');
  }
  return { score: Math.min(100, Math.round(points)), notes, remembered: false };
}

export function rankCandidates(product, candidates = [], rememberedProductId = '') {
  return candidates.map(candidate => ({ ...candidate, ...matchCandidate(product, candidate, rememberedProductId) }))
    .sort((a, b) => Number(b.remembered) - Number(a.remembered) || b.score - a.score || Number(a.price || Infinity) - Number(b.price || Infinity));
}
