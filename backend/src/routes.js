'use strict';
const db = require('./db');
const { HttpError, readJson, send } = require('./http');
const { hashPassword, verifyPassword, signToken, verifyToken, DUMMY_HASH, generateCode, hashCode, codesMatch } = require('./auth');
const { sendMail, verificationEmail } = require('./mailer');
const { validateRegister, validateLogin, validateVerify, validateResend, validateItem, CATEGORIES } = require('./validate');
const { rankMatches } = require('./matching');

const SESSION_TTL = 24 * 3600;
const REMEMBER_TTL = 30 * 24 * 3600;

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

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

function matchesFor(row, viewerId) {
  const opposite = row.type === 'lost' ? 'found' : 'lost';
  const candidates = db
    .prepare(`${ITEM_SELECT} WHERE i.type = ? AND i.status = 'open' AND i.user_id != ?`)
    .all(opposite, row.user_id)
    .map((r) => toItem(r, viewerId));
  const subject = { name: row.name, category: row.category, location: row.location, description: row.description, date: row.date };
  return rankMatches(subject, candidates);
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function issueCode(user) {
  const now = Date.now();
  const wait = Math.ceil((user.code_sent_at + CODE_COOLDOWN_MS - now) / 1000);
  if (wait > 0) throw new HttpError(429, `Please wait ${wait} seconds before requesting another code.`);

  const code = generateCode();
  db.prepare('UPDATE users SET code_hash = ?, code_expires = ?, code_attempts = 0, code_sent_at = ? WHERE id = ?')
    .run(hashCode(user.email, code), now + CODE_TTL_MS, now, user.id);

  try {
    await sendMail({ to: user.email, ...verificationEmail(user.name, code) });
  } catch (err) {
    db.prepare('UPDATE users SET code_sent_at = 0 WHERE id = ?').run(user.id);
    throw err;
  }
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

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(value.email);
  if (existing && existing.verified) {
    throw new HttpError(409, 'An account with this email already exists.', { email: 'Already registered.' });
  }

  const hash = await hashPassword(value.password);
  let user;
  if (existing) {
    db.prepare('UPDATE users SET name = ?, phone = ?, password_hash = ? WHERE id = ?')
      .run(value.name, value.phone, hash, existing.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
  } else {
    const info = db
      .prepare('INSERT INTO users (email, name, phone, password_hash, verified) VALUES (?, ?, ?, ?, 0)')
      .run(value.email, value.name, value.phone, hash);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
  }

  await issueCode(user);
  return [201, { pendingVerification: true, email: user.email }];
});

route('POST', '/api/auth/verify', { auth: false, limited: true }, ({ body }) => {
  const { errors, value } = validateVerify(body);
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed.', errors);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(value.email);
  const invalid = new HttpError(400, 'Invalid or expired code.');
  if (!user) throw invalid;
  if (user.verified) throw new HttpError(400, 'This email is already verified. Please log in.');
  if (!user.code_hash || user.code_expires < Date.now()) throw invalid;
  if (user.code_attempts >= MAX_CODE_ATTEMPTS) {
    throw new HttpError(429, 'Too many wrong attempts. Request a new code.');
  }

  db.prepare('UPDATE users SET code_attempts = code_attempts + 1 WHERE id = ?').run(user.id);
  if (!codesMatch(user.email, value.code, user.code_hash)) throw invalid;

  db.prepare('UPDATE users SET verified = 1, code_hash = NULL, code_expires = 0, code_attempts = 0 WHERE id = ?').run(user.id);
  return { user: publicUser(user), token: signToken(user.id, SESSION_TTL) };
});

route('POST', '/api/auth/resend', { auth: false, limited: true }, async ({ body }) => {
  const { errors, value } = validateResend(body);
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed.', errors);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(value.email);
  if (user && !user.verified) await issueCode(user);
  return { sent: true };
});

route('POST', '/api/auth/login', { auth: false, limited: true }, async ({ body }) => {
  const { errors, value } = validateLogin(body);
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed.', errors);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(value.email);
  const ok = await verifyPassword(value.password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Incorrect email or password.');
  if (!user.verified) {
    throw new HttpError(403, 'Please verify your email first. Enter the code we sent you.', undefined, 'EMAIL_NOT_VERIFIED');
  }

  const ttl = value.remember ? REMEMBER_TTL : SESSION_TTL;
  return { user: publicUser(user), token: signToken(user.id, ttl) };
});

route('GET', '/api/auth/me', { auth: true }, ({ user }) => ({ user: publicUser(user) }));

route('GET', '/api/items', { auth: true }, ({ query, user }) => {
  const where = [];
  const params = [];

  const type = query.get('type');
  if (type) {
    if (type !== 'lost' && type !== 'found') throw new HttpError(400, 'type must be "lost" or "found".');
    where.push('i.type = ?');
    params.push(type);
  }

  const status = query.get('status') || 'open';
  if (status !== 'all') {
    if (status !== 'open' && status !== 'resolved') throw new HttpError(400, 'status must be open, resolved or all.');
    where.push('i.status = ?');
    params.push(status);
  }

  const category = query.get('category');
  if (category) {
    where.push('i.category = ?');
    params.push(category);
  }

  if (query.get('mine') === '1') {
    where.push('i.user_id = ?');
    params.push(user.id);
  }

  const q = (query.get('q') || '').trim().slice(0, 100);
  if (q) {
    const like = `%${escapeLike(q.toLowerCase())}%`;
    where.push(`(lower(i.name) LIKE ? ESCAPE '\\' OR lower(i.category) LIKE ? ESCAPE '\\' OR lower(i.location) LIKE ? ESCAPE '\\' OR lower(i.description) LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like);
  }

  const limit = Math.min(Math.max(parseInt(query.get('limit'), 10) || 100, 1), 200);
  const offset = Math.max(parseInt(query.get('offset'), 10) || 0, 0);

  const sql = `${ITEM_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...params, limit, offset);
  return { items: rows.map((r) => toItem(r, user.id)), limit, offset };
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
  return [201, { item: toItem(row, user.id), matches: matchesFor(row, user.id) }];
});

route('GET', '/api/items/:id', { auth: true }, ({ params, user }) => ({ item: toItem(findItem(params.id), user.id) }));

route('GET', '/api/items/:id/matches', { auth: true }, ({ params, user }) => {
  const row = findItem(params.id);
  return { matches: matchesFor(row, user.id) };
});

route('PATCH', '/api/items/:id/resolve', { auth: true }, ({ params, user }) => {
  const row = findItem(params.id);
  if (row.user_id !== user.id) throw new HttpError(403, 'You can only update your own entries.');
  db.prepare("UPDATE items SET status = 'resolved' WHERE id = ?").run(row.id);
  return { item: toItem(findItem(params.id), user.id) };
});

route('DELETE', '/api/items/:id', { auth: true }, ({ params, user }) => {
  const row = findItem(params.id);
  if (row.user_id !== user.id) throw new HttpError(403, 'You can only delete your own entries.');
  db.prepare('DELETE FROM items WHERE id = ?').run(row.id);
  return { deleted: true };
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
    user = payload ? db.prepare('SELECT * FROM users WHERE id = ? AND verified = 1').get(payload.sub) : null;
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
