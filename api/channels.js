import { kv } from '@vercel/kv';
import { requireUser } from './_auth.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  const ids = (await kv.smembers(`user:${user.id}:channels`)) || [];
  const list = [];
  for (const id of ids) {
    const c = await kv.hgetall(`channel:${id}`);
    if (c) list.push({ id, title: c.title, thumb: c.thumb });
  }
  res.setHeader('Cache-Control','no-store');
  res.json(list);
}
