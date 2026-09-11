import { searchCompareService } from './mcp.js';

export async function searchSeven({ q, storeId = '' }) {
  return searchCompareService({ q, retailer: 'seven', service: 'seveneleven', storeId });
}
