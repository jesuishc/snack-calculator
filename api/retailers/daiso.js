import { searchDaisoDirect } from '../../src/server/retailer-mcp.js';

export async function searchDaiso({ q, storeId = '' }) {
  const products = await searchDaisoDirect(q);
  return {
    retailer: 'daiso',
    sourceUrl: products[0]?.url || `https://mcp.aka.page/api/daiso/products?q=${encodeURIComponent(q)}&pageSize=12`,
    products: products.map(item => ({ ...item, storeId }))
  };
}
