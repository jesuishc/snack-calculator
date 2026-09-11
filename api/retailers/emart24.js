import { searchEmart24Direct } from '../../src/server/retailer-mcp.js';

export async function searchEmart24({ q, storeId = '' }) {
  const products = await searchEmart24Direct(q);
  return {
    retailer: 'emart24',
    sourceUrl: products[0]?.url || `https://mcp.aka.page/api/emart24/products?keyword=${encodeURIComponent(q)}&pageSize=12`,
    products: products.map(item => ({ ...item, storeId }))
  };
}
