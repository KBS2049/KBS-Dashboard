import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { kv } from '@vercel/kv';

const SESSION_TTL = 60 * 60 * 24 * 7;

function b64(v) { return Buffer.from(v).toString('base64url'); }
function unb64(v) { return Buffer.from(v, 'base64url').toString(); }

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hex] = String(stored).split(':');
    const actual = scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hex, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not configured');
  return value;
}

function sign(id) {
  return createHmac('sha256', secret()).update(id).digest('base64url');
}

export function cookie(name, value, maxAge = SESSION_TTL) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
}

export async function createSession(userId) {
  const id = randomBytes(32).toString('hex');
  await kv.set(`session:${id}`, { userId }, { ex: SESSION_TTL });
  return `${b64(id)}.${sign(id)}`;
}

export async function getSession(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)kbs_session=([^;]+)/);
  if (!match) return null;
  try {
    const token = decodeURIComponent(match[1]);
    const [encoded, sig] = token.split('.');
    const id = unb64(encoded);
    if (!id || sign(id) !== sig) return null;
    const s = await kv.get(`session:${id}`);
    if (!s?.userId) return null;
    const user = await kv.hgetall(`user:${s.userId}`);
    if (!user?.username) return null;
    return { id: s.userId, ...user };
  } catch { return null; }
}

export async function getEffectiveUser(req) {
  const user = await getSession(req);
  if (!user) return null;
  if (user.role !== 'admin') return user;
  const raw = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)kbs_view_as=([^;]+)/);
  if (!match) return user;
  const viewAs = decodeURIComponent(match[1]);
  if (viewAs === user.id) return user;
  const target = await kv.hgetall(`user:${viewAs}`);
  return target?.username ? { id: viewAs, ...target, viewingAs: true, adminId: user.id } : user;
}

export async function requireUser(req, res) {
  const user = await getEffectiveUser(req);
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return null; }
  return user;
}

export async function requireAdmin(req, res) {
  const user = await getSession(req);
  if (!user || user.role !== 'admin') { res.status(403).json({ error: 'admin_only' }); return null; }
  return user;
}

export function ensureAdmin() {
  return {
    id: 'admin',
    username: process.env.ADMIN_USERNAME || 'admin',
    role: 'admin'
  };
}
