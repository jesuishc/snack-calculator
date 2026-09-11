import { searchGs25Direct } from '../../src/server/retailer-mcp.js';

export async function searchGs25({ q, storeId = '' }) {
  const products = await searchGs25Direct(q);
  return {
    retailer: 'gs25',
    sourceUrl: products[0]?.url || `https://mcp.aka.page/api/gs25/products?keyword=${encodeURIComponent(q)}&limit=12`,
    products: products.map(item => ({ ...item, storeId }))
  };
}
