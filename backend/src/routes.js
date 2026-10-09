'use strict';
const db = require('./db');
const { HttpError, readJson, send } = require('./http');
const { hashPassword, verifyPassword, signToken, verifyToken, DUMMY_HASH } = require('./auth');
const { validateRegister, validateLogin, validateItem, CATEGORIES } = require('./validate');

const SESSION_TTL = 24 * 3600;
const REMEMBER_TTL = 30 * 24 * 3600;

const AUTH_LIMIT = Number(process.env.AUTH_RATE_LIMIT || 30);
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();

function rateLimit(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + AUTH_WINDOW_MS };
    attempts.set(ip, entry);
  }
  entry.count++;
  if (entry.count > AUTH_LIMIT) throw new HttpError(429, 'Too many attempts. Try again later.');
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of attempts) if (e.resetAt < now) attempts.delete(ip);
}, AUTH_WINDOW_MS).unref();

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone });
const iso = (s) => s.replace(' ', 'T') + 'Z';

const ITEM_SELECT = `
  SELECT i.*, u.name AS reporter_name
  FROM items i JOIN users u ON u.id = i.user_id`;

function toItem(row, viewerId) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    category: row.category,
    isCustomCategory: !!row.is_custom_category,
    date: row.date,
    location: row.location,
    contactInfo: row.contact_info,
    description: row.description,
    status: row.status,
    reporter: row.reporter_name,
    mine: row.user_id === viewerId,
    createdAt: iso(row.created_at),
  };
}

function findItem(id) {
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Item not found.');
  const row = db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(Number(id));
  if (!row) throw new HttpError(404, 'Item not found.');
  return row;
}

const routes = [];
function route(method, pattern, opts, handler) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, regex, keys, auth: opts.auth, handler });
}

route('GET', '/api/health', { auth: false }, () => ({ status: 'ok' }));

route('GET', '/api/categories', { auth: false }, () => ({ categories: CATEGORIES }));

route('POST', '/api/auth/register', { auth: false, limited: true }, async ({ body }) => {
  const { errors, value } = validateRegister(body);
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed.', errors);

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(value.email)) {
    throw new HttpError(409, 'An account with this email already exists.', { email: 'Already registered.' });
  }
  const hash = await hashPassword(value.password);
  const info = db
    .prepare('INSERT INTO users (email, name, phone, password_hash) VALUES (?, ?, ?, ?)')
    .run(value.email, value.name, value.phone, hash);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
  return [201, { user: publicUser(user), token: signToken(user.id, SESSION_TTL) }];
});

route('POST', '/api/auth/login', { auth: false, limited: true }, async ({ body }) => {
  const { errors, value } = validateLogin(body);
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed.', errors);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(value.email);
  const ok = await verifyPassword(value.password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Incorrect email or password.');

  const ttl = value.remember ? REMEMBER_TTL : SESSION_TTL;
  return { user: publicUser(user), token: signToken(user.id, ttl) };
});

route('GET', '/api/auth/me', { auth: true }, ({ user }) => ({ user: publicUser(user) }));

route('GET', '/api/items', { auth: true }, ({ query, user }) => {
  const type = query.get('type');
  if (type !== 'lost') throw new HttpError(400, 'type must be "lost".');

  const rows = db
    .prepare(`${ITEM_SELECT} WHERE i.type = ? AND i.status = 'open' ORDER BY i.created_at DESC, i.id DESC LIMIT 200`)
    .all(type);
  return { items: rows.map((r) => toItem(r, user.id)) };
});

route('POST', '/api/items', { auth: true }, ({ body, user }) => {
  const { errors, value } = validateItem(body);
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed.', errors);

  const contact = value.contactInfo || `${user.email} | ${user.phone}`;
  const info = db
    .prepare(
      `INSERT INTO items (type, name, category, is_custom_category, date, location, contact_info, description, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(value.type, value.name, value.category, value.isCustom ? 1 : 0, value.date, value.location, contact, value.description, user.id);

  const row = findItem(String(info.lastInsertRowid));
  return [201, { item: toItem(row, user.id) }];
});

async function handleApi(req, res, url) {
  const match = routes.find((r) => r.method === req.method && r.regex.test(url.pathname));
  if (!match) {
    const pathKnown = routes.some((r) => r.regex.test(url.pathname));
    throw new HttpError(pathKnown ? 405 : 404, pathKnown ? 'Method not allowed.' : 'Route not found.');
  }

  if (match.limited) rateLimit(req);

  let user = null;
  if (match.auth) {
    const header = req.headers.authorization || '';
    const payload = header.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null;
    user = payload ? db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) : null;
    if (!user) throw new HttpError(401, 'Authentication required.');
  }

  const m = url.pathname.match(match.regex);
  const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
  const body = req.method === 'POST' || req.method === 'PATCH' ? await readJson(req) : {};

  const result = await match.handler({ req, params, query: url.searchParams, body, user });
  if (Array.isArray(result)) send(res, result[0], result[1]);
  else send(res, 200, result);
}

module.exports = { handleApi };
