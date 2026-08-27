import { kv } from '@vercel/kv';
import { requireAdmin, hashPassword } from './_auth.js';
import { randomBytes } from 'node:crypto';

async function body(req) { if (req.body && typeof req.body === 'object') return req.body; try { return JSON.parse(req.body || '{}'); } catch { return {}; } }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const admin = await requireAdmin(req, res); if (!admin) return;
  if (req.method === 'GET') {
    const ids = (await kv.smembers('users')) || [];
    const users = [];
    for (const id of ids) {
      const u = await kv.hgetall(`user:${id}`);
      if (u?.username) {
        const channels = (await kv.smembers(`user:${id}:channels`)) || [];
        users.push({ id, username: u.username, active: u.active !== 'false', channels: channels.length });
      }
    }
    users.sort((a,b)=>a.username.localeCompare(b.username));
    res.json(users); return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error:'method_not_allowed' }); return; }
  const { username, password } = await body(req);
  const normalized = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(normalized) || String(password || '').length < 8) { res.status(400).json({ error:'username_3_32_and_password_8_required' }); return; }
  if (normalized === 'admin' || await kv.exists(`userByUsername:${normalized}`)) { res.status(409).json({ error:'username_exists' }); return; }
  const id = randomBytes(12).toString('hex');
  await kv.hset(`user:${id}`, { username: normalized, role:'user', active:'true', passwordHash:hashPassword(password), createdAt:Date.now() });
  await kv.hset(`userByUsername:${normalized}`, { userId:id });
  await kv.sadd('users', id);
  res.status(201).json({ id, username:normalized });
}
