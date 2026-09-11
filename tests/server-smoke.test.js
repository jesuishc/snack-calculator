import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const port = 39000 + (process.pid % 1000);
const dataFile = join(tmpdir(), `snack-server-${process.pid}-${Date.now()}.json`);
const base = `http://127.0.0.1:${port}`;
let child;

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try { const response = await fetch(base + '/'); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('server did not start');
}

test.before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), SNACK_DATA_FILE: dataFile, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await waitForServer();
});

test('serves the app shell', async () => {
  const response = await fetch(base + '/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /과자 가격 비교표/);
});

test('persists and reads household data without Supabase', async () => {
  const put = await fetch(base + '/api/household?householdId=cihome', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snacks: [{ id: 'p1', name: '몽쉘' }] })
  });
  assert.equal(put.status, 204);
  const get = await fetch(base + '/api/household?householdId=cihome');
  assert.equal(get.status, 200);
  const body = await get.json();
  assert.equal(body.snacks[0].name, '몽쉘');
});

test('persists price history without Supabase', async () => {
  const post = await fetch(base + '/api/history?householdId=cihome', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId:'p1', productName:'몽쉘', storeId:'gs25', storeName:'GS25', price:3000, promotion:'1+1', actor:'tester' })
  });
  assert.equal(post.status, 201);
  const get = await fetch(base + '/api/history?householdId=cihome&productId=p1&storeId=gs25');
  const body = await get.json();
  assert.equal(body.history.length, 1);
  assert.equal(body.history[0].price, 3000);
});

test.after(async () => {
  child?.kill('SIGTERM');
  await rm(dataFile, { force: true });
});
