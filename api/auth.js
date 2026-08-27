import { kv } from '@vercel/kv';
import { createSession, cookie, ensureAdmin, hashPassword, verifyPassword, getSession } from './_auth.js';

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const user = await getSession(req);
    res.json(user ? { authenticated: true, user: { id: user.id, username: user.username, role: user.role } } : { authenticated: false });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const { action, username, password } = await body(req);
  if (action === 'logout') {
    res.setHeader('Set-Cookie', cookie('kbs_session', '', 0));
    res.setHeader('Set-Cookie', [cookie('kbs_session', '', 0), cookie('kbs_view_as', '', 0)]);
    res.json({ ok: true });
    return;
  }

  if (action === 'bootstrap') {
    const existing = await kv.hgetall('user:admin');
    if (!existing?.username) {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) { res.status(500).json({ error: 'ADMIN_PASSWORD is not configured' }); return; }
      const a = ensureAdmin();
      await kv.hset('user:admin', { username: a.username, role: 'admin', passwordHash: hashPassword(adminPassword), createdAt: Date.now() });
    }
    res.json({ ok: true });
    return;
  }

  if (!username || !password) { res.status(400).json({ error: 'username_and_password_required' }); return; }
  const normalized = String(username).trim().toLowerCase();
  let user = null;
  const admin = await kv.hgetall('user:admin');
  if (admin?.username === normalized && verifyPassword(password, admin.passwordHash)) user = { id: 'admin', ...admin };
  if (!user) {
    const index = await kv.hgetall(`userByUsername:${normalized}`);
    if (index?.userId) {
      const u = await kv.hgetall(`user:${index.userId}`);
      if (u?.username && u.active !== 'false' && verifyPassword(password, u.passwordHash)) user = { id: index.userId, ...u };
    }
  }
  if (!user) { res.status(401).json({ error: 'invalid_login' }); return; }
  const session = await createSession(user.id);
  res.setHeader('Set-Cookie', [cookie('kbs_session', session), cookie('kbs_view_as', '', 0)]);
  res.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
}
