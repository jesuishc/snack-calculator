import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const file = process.env.SNACK_DATA_FILE || join(root, 'data', 'snack-data.json');
let writeQueue = Promise.resolve();

async function readData() {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    return { households: value.households || {}, history: value.history || [] };
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return { households: {}, history: [] };
    throw error;
  }
}
async function writeData(data) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
  await rename(temp, file);
}
async function mutate(mutator) {
  let result;
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const data = await readData();
    result = await mutator(data);
    await writeData(data);
  });
  await writeQueue;
  return result;
}

export async function getLocalHousehold(householdId) {
  const data = await readData();
  return data.households[householdId] || null;
}
export async function putLocalHousehold(householdId, payload) {
  return mutate(data => {
    data.households[householdId] = { payload, updated_at: new Date().toISOString() };
  });
}
export async function listLocalHistory({ householdId, productId = '', storeId = '', limit = 200 }) {
  const data = await readData();
  return data.history.filter(row => row.household_id === householdId && (!productId || row.product_id === productId) && (!storeId || row.store_id === storeId))
    .sort((a, b) => new Date(b.checked_at) - new Date(a.checked_at)).slice(0, Math.min(500, Math.max(1, Number(limit) || 200)));
}
export async function appendLocalHistory(entry) {
  return mutate(data => {
    const row = { id: Date.now() + Math.floor(Math.random() * 1000), ...entry };
    const duplicate = data.history.some(old => old.household_id === row.household_id && old.product_id === row.product_id && old.store_id === row.store_id && old.price === row.price && old.promotion === row.promotion && old.checked_at === row.checked_at);
    if (!duplicate) data.history.push(row);
    if (data.history.length > 5000) data.history = data.history.slice(-5000);
    return [row];
  });
}
