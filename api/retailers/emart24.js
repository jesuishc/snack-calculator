import { searchCompareService } from './mcp.js';

export async function searchEmart24({ q, storeId = '' }) {
  return searchCompareService({ q, retailer: 'emart24', service: 'emart24', storeId });
}
