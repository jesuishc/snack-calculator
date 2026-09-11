import { searchCuDirect } from '../../src/server/retailer-mcp.js';

export async function searchCu({ q, storeId = '' }) {
  const products = await searchCuDirect(q);
  return {
    retailer: 'cu',
    sourceUrl: products[0]?.url || `https://mcp.aka.page/api/cu/inventory?keyword=${encodeURIComponent(q)}&size=20&storeCheck=false`,
    products: products.map(item => ({ ...item, storeId }))
  };
}
