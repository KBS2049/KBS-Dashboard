import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const ids = (await kv.smembers('channels')) || [];
  const list = [];
  for (const id of ids) {
    const c = await kv.hgetall(`channel:${id}`);
    if (c) list.push({ id, title: c.title, thumb: c.thumb });
  }
  res.json(list);
}
