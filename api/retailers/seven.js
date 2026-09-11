import { searchSevenDirect } from '../../src/server/retailer-mcp.js';

export async function searchSeven({ q, storeId = '' }) {
  const products = await searchSevenDirect(q);
  return {
    retailer: 'seven',
    sourceUrl: products[0]?.url || `https://mcp.aka.page/api/seveneleven/products?query=${encodeURIComponent(q)}&size=12`,
    products: products.map(item => ({ ...item, storeId }))
  };
}
