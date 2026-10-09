'use strict';
process.env.DB_PATH = ':memory:';
process.env.AUTH_RATE_LIMIT = '1000';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server');

let base;
before(async () => {
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function api(method, url, { body, token } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const today = new Date().toISOString().slice(0, 10);
const alice = { email: 'alice.25bce10001@vitbhopal.ac.in', name: 'Alice', password: 'password123', phone: '9876543210' };
const bob = { email: 'bob.25bce10002@vitbhopal.ac.in', name: 'Bob', password: 'password456', phone: '9123456780' };
let aliceToken, bobToken, lostId, foundId;

test('register validates input', async () => {
  let r = await api('POST', '/api/auth/register', { body: { ...alice, email: 'x@gmail.com' } });
  assert.equal(r.status, 400);
  assert.ok(r.data.details.email);
  r = await api('POST', '/api/auth/register', { body: { ...alice, password: 'short', phone: '123' } });
  assert.equal(r.status, 400);
  assert.ok(r.data.details.password && r.data.details.phone);
});

test('register, duplicate, login', async () => {
  let r = await api('POST', '/api/auth/register', { body: alice });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.phone, '+919876543210');
  assert.equal(r.data.user.password_hash, undefined);
  aliceToken = r.data.token;

  r = await api('POST', '/api/auth/register', { body: { ...alice, email: alice.email.toUpperCase() } });
  assert.equal(r.status, 409);

  r = await api('POST', '/api/auth/register', { body: bob });
  bobToken = r.data.token;

  r = await api('POST', '/api/auth/login', { body: { email: alice.email, password: 'wrong-pass' } });
  assert.equal(r.status, 401);
  r = await api('POST', '/api/auth/login', { body: { email: 'nobody@vitbhopal.ac.in', password: 'whatever1' } });
  assert.equal(r.status, 401);
  r = await api('POST', '/api/auth/login', { body: { email: alice.email, password: alice.password, remember: true } });
  assert.equal(r.status, 200);
  aliceToken = r.data.token;

  r = await api('GET', '/api/auth/me', { token: aliceToken });
  assert.equal(r.data.user.email, alice.email);
});

test('items require auth and reject forged tokens', async () => {
  assert.equal((await api('GET', '/api/items')).status, 401);
  assert.equal((await api('GET', '/api/items', { token: 'abc.def' })).status, 401);
  const forged = aliceToken.split('.')[0] + '.' + 'A'.repeat(43);
  assert.equal((await api('GET', '/api/items', { token: forged })).status, 401);
});

test('create lost item (with and without contact) and validation', async () => {
  let r = await api('POST', '/api/items', { token: aliceToken, body: { type: 'lost', name: 'Blue Leather Wallet', category: 'Documents & Cards', date: today, location: 'Main Library', description: 'Has my ID card' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.item.contactInfo, `${alice.email} | +919876543210`);
  assert.equal(r.data.item.mine, true);
  lostId = r.data.item.id;

  r = await api('POST', '/api/items', { token: aliceToken, body: { type: 'lost', name: 'x', category: 'Custom', date: today, location: 'y' } });
  assert.equal(r.status, 400);
  assert.ok(r.data.details.customCategory);

  r = await api('POST', '/api/items', { token: aliceToken, body: { type: 'lost', name: 'x', category: 'Custom', customCategory: 'Umbrella', date: '2999-01-01', location: 'y' } });
  assert.equal(r.status, 400);
  assert.ok(r.data.details.date);

  r = await api('POST', '/api/items', { token: aliceToken, body: { type: 'lost', name: 'Umbrella', category: 'Custom', customCategory: 'Umbrella', date: today, location: 'Canteen', contactInfo: 'WhatsApp 99999' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.item.isCustomCategory, true);
  assert.equal(r.data.item.contactInfo, 'WhatsApp 99999');
});

test('found item auto-matches the lost one', async () => {
  const r = await api('POST', '/api/items', { token: bobToken, body: { type: 'found', name: 'Blue wallet', category: 'Documents & Cards', date: today, location: 'Library', description: 'ID card inside' } });
  assert.equal(r.status, 201);
  foundId = r.data.item.id;
  assert.equal(r.data.matches.length, 1);
  assert.equal(r.data.matches[0].id, lostId);

  const m = await api('GET', `/api/items/${lostId}/matches`, { token: aliceToken });
  assert.equal(m.data.matches[0].id, foundId);
});

test('list shows possible matches next to items', async () => {
  const lost = await api('GET', '/api/items?type=lost', { token: aliceToken });
  const wallet = lost.data.items.find((i) => i.id === lostId);
  assert.equal(wallet.matches.length, 1);
  assert.equal(wallet.matches[0].id, foundId);
  // Umbrella has no similar found item, so no badge data.
  assert.equal(lost.data.items.find((i) => i.name === 'Umbrella').matches.length, 0);

  const found = await api('GET', '/api/items?type=found', { token: bobToken });
  assert.equal(found.data.items[0].matches[0].id, lostId);
});

test('list, filter, search, mine flag', async () => {
  let r = await api('GET', '/api/items?type=lost', { token: bobToken });
  assert.equal(r.data.items.length, 2);
  assert.ok(r.data.items.every((i) => i.type === 'lost' && i.mine === false));

  r = await api('GET', '/api/items?q=WALLET', { token: bobToken });
  assert.equal(r.data.items.length, 2);

  r = await api('GET', '/api/items?q=%25', { token: bobToken });
  assert.equal(r.data.items.length, 0);

  r = await api('GET', '/api/items?mine=1', { token: bobToken });
  assert.equal(r.data.items.length, 1);

  assert.equal((await api('GET', '/api/items?type=bogus', { token: bobToken })).status, 400);
});

test('only the owner can resolve or delete', async () => {
  assert.equal((await api('DELETE', `/api/items/${lostId}`, { token: bobToken })).status, 403);
  assert.equal((await api('PATCH', `/api/items/${lostId}/resolve`, { token: bobToken })).status, 403);

  let r = await api('PATCH', `/api/items/${lostId}/resolve`, { token: aliceToken });
  assert.equal(r.data.item.status, 'resolved');
  r = await api('GET', '/api/items?type=lost', { token: aliceToken });
  assert.ok(!r.data.items.some((i) => i.id === lostId));
  r = await api('GET', '/api/items?type=lost&status=all', { token: aliceToken });
  assert.ok(r.data.items.some((i) => i.id === lostId));

  assert.equal((await api('DELETE', `/api/items/${foundId}`, { token: bobToken })).data.deleted, true);
  assert.equal((await api('GET', `/api/items/${foundId}`, { token: bobToken })).status, 404);
});

test('misc: bad json, unknown route, static serving, traversal', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(res.status, 400);
  assert.equal((await api('GET', '/api/nope')).status, 404);
  assert.equal((await api('DELETE', '/api/auth/login')).status, 405);
  const page = await fetch(base + '/index.html');
  assert.equal(page.status, 200);
  assert.equal((await fetch(base + '/pages/home.html')).status, 200);
  assert.equal((await fetch(base + '/assets/js/api.js')).status, 200);
  const trav = await fetch(base + '/..%2f..%2fbackend%2fserver.js');
  assert.notEqual(trav.status, 200);
  const raw = await new Promise((resolve) => {
    require('node:http').get({ port: server.address().port, path: '/../backend/server.js' }, (r) => resolve(r.statusCode));
  });
  assert.notEqual(raw, 200);
});
