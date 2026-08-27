import { kv } from '@Vercel/kv';
import { createSession, cookie, hashPassword } from './_auth.js';
import { randomBytes } from 'node:crypto';

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { username, password } = await body(req);
  const normalized = String(username || '').trim().toLowerCase();
  const pass = String(password || '');

  if (!/^[a-z0-9._-]{3,32}$/.test(normalized) || pass.length < 8) {
    res.status(400).json({ error: 'username_3_32_and_password_8_required' });
    return;
  }

  if (normalized === 'admin' || await kv.exists(`userByUsername:${normalized}`)) {
    res.status(409).json({ error: 'username_exists' });
    return;
  }

  const id = randomBytes(12).toString('hex');
  await kv.hset(`user:${id}`, {
    username: normalized,
    role: 'user',
    active: 'true',
    passwordHash: hashPassword(pass),
    createdAt: Date.now()
  });
  await kv.hset(`userByUsername:${normalized}`, { userId: id });
  await kv.sadd('users', id);

  const session = await createSession(id);
  res.setHeader('Set-Cookie', [cookie('kbs_session', session), cookie('kbs_view_as', '', 0)]);
  res.status(201).json({ ok: true, user: { id, username: normalized, role: 'user' } });
}
