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
    const adminUser = await kv.hgetall('user:admin');
    if (adminUser?.username) {
      const adminChannels = (await kv.smembers('user:admin:channels')) || [];
      users.push({ id:'admin', username:adminUser.username, active:true, channels:adminChannels.length, isAdmin:true });
    }
    for (const id of ids) {
      if (id === 'admin') continue;
      const u = await kv.hgetall(`user:${id}`);
      if (u?.username) {
        const channels = (await kv.smembers(`user:${id}:channels`)) || [];
        users.push({ id, username:u.username, active:u.active !== 'false', channels:channels.length, isAdmin:false });
      }
    }
    users.sort((a,b)=>a.isAdmin ? -1 : b.isAdmin ? 1 : a.username.localeCompare(b.username));
    res.json(users); return;
  }

  if (req.method === 'DELETE' || req.method === 'POST') {
    const input = await body(req);
    if (input.action === 'delete' || req.method === 'DELETE') {
      const userId = String(input.userId || '').trim();
      if (!userId || userId === 'admin') { res.status(400).json({ error:'cannot_delete_admin' }); return; }
      const u = await kv.hgetall(`user:${userId}`);
      if (!u?.username) { res.status(404).json({ error:'user_not_found' }); return; }
      const channels = (await kv.smembers(`user:${userId}:channels`)) || [];
      for (const channelId of channels) {
        await kv.srem('channels', channelId);
        await kv.del(`channel:${channelId}`);
      }
      await kv.del(`user:${userId}`);
      await kv.del(`userByUsername:${u.username}`);
      await kv.del(`user:${userId}:channels`);
      await kv.srem('users', userId);
      res.json({ ok:true, id:userId, username:u.username }); return;
    }

    const { username, password } = input;
    const normalized = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(normalized) || String(password || '').length < 8) { res.status(400).json({ error:'username_3_32_and_password_8_required' }); return; }
    if (normalized === 'admin' || await kv.exists(`userByUsername:${normalized}`)) { res.status(409).json({ error:'username_exists' }); return; }
    const id = randomBytes(12).toString('hex');
    await kv.hset(`user:${id}`, { username:normalized, role:'user', active:'true', passwordHash:hashPassword(password), createdAt:Date.now() });
    await kv.hset(`userByUsername:${normalized}`, { userId:id });
    await kv.sadd('users', id);
    res.status(201).json({ id, username:normalized }); return;
  }

  res.status(405).json({ error:'method_not_allowed' });
}
