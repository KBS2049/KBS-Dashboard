import { kv } from '@vercel/kv';
import { requireAdmin, cookie } from './_auth.js';

async function body(req) { if (req.body && typeof req.body === 'object') return req.body; try { return JSON.parse(req.body || '{}'); } catch { return {}; } }

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res); if (!admin) return;
  const { userId } = await body(req);
  if (req.method !== 'POST') { res.status(405).json({ error:'method_not_allowed' }); return; }
  if (!userId || userId === 'admin') {
    res.setHeader('Set-Cookie', cookie('kbs_view_as', '', 0));
    res.json({ ok:true, viewingAs:'admin' }); return;
  }
  const u = await kv.hgetall(`user:${userId}`);
  if (!u?.username) { res.status(404).json({ error:'user_not_found' }); return; }
  res.setHeader('Set-Cookie', cookie('kbs_view_as', userId));
  res.json({ ok:true, viewingAs:userId, username:u.username });
}
