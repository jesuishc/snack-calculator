import { searchRetailer } from '../api/search.js';

const query = process.env.SMOKE_QUERY || '버터링';
const retailers = ['coupang', 'daiso', 'gs25', 'cu', 'seven', 'emart24'];
const summary = [];

for (const retailer of retailers) {
  const started = Date.now();
  try {
    const result = await searchRetailer({ q: query, retailer, storeId: '' });
    const products = Array.isArray(result?.products) ? result.products : [];
    const top = products[0] || null;
    summary.push({
      retailer,
      status: products.length ? 'products_found' : 'no_products',
      count: products.length,
      ms: Date.now() - started,
      top: top ? {
        name: top.name,
        price: top.price,
        productId: top.productId,
        promotion: top.promotion,
        stock: top.stock
      } : null,
      sourceUrl: result?.sourceUrl || ''
    });
  } catch (error) {
    summary.push({ retailer, status: 'source_error', count: 0, ms: Date.now() - started, error: error?.message || String(error) });
  }
}

console.log('LIVE_RETAILER_SMOKE=' + JSON.stringify({ query, checkedAt: new Date().toISOString(), summary }));

const sourceErrors = summary.filter(item => item.status === 'source_error');
if (sourceErrors.length) {
  console.error('Retailer source errors: ' + sourceErrors.map(item => item.retailer).join(', '));
}
