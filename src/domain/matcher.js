import { num } from './price-calculator.js';

export function tokens(value = '') {
  return value
    .toLowerCase()
    .replace(/[^0-9a-z가-힣 ]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1);
}

export function textSimilarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.length) return 0;
  const hits = left.filter(x => right.some(y => y.includes(x) || x.includes(y))).length;
  return hits / left.length;
}

export function extractCandidateMeta(name = '', url = '') {
  const weightMatch = name.match(/(\d+(?:\.\d+)?)\s*g/i);
  const countMatch = name.match(/(\d+)\s*(?:개|입|p|pack)/i);
  const idMatch = url.match(/(?:products\/|itemId=|vendorItemId=)([\w-]+)/i);
  return {
    name,
    weight: weightMatch ? num(weightMatch[1]) : 0,
    count: countMatch ? num(countMatch[1]) : 0,
    barcode: '',
    url,
    productId: idMatch?.[1] || ''
  };
}

export function matchCandidate(product, candidate) {
  if (product?.barcode && candidate?.barcode && product.barcode === candidate.barcode) {
    return { score: 100, notes: ['바코드 일치'] };
  }

  let points = textSimilarity(`${product?.brand || ''} ${product?.name || ''}`, candidate?.name || '') * 55;
  const notes = [];

  if (product?.brand) {
    if ((candidate?.name || '').toLowerCase().includes(product.brand.toLowerCase())) points += 15;
    else notes.push('브랜드 미확인');
  }

  if (num(product?.weight)) {
    if (num(candidate?.weight)) {
      const diff = Math.abs(product.weight - candidate.weight) / product.weight;
      points += Math.max(0, 15 * (1 - diff));
      if (diff > 0.1) notes.push(`중량 ${candidate.weight}g`);
    } else notes.push('중량 미확인');
  }

  if (num(product?.count)) {
    if (num(candidate?.count)) {
      const diff = Math.abs(product.count - candidate.count) / product.count;
      points += Math.max(0, 15 * (1 - diff));
      if (diff > 0.1) notes.push(`수량 ${candidate.count}개`);
    } else notes.push('수량 미확인');
  }

  return { score: Math.min(100, Math.round(points)), notes };
}

export function rankCandidates(product, candidates = []) {
  return candidates
    .map(candidate => ({ ...candidate, ...matchCandidate(product, candidate) }))
    .sort((a, b) => b.score - a.score);
}
