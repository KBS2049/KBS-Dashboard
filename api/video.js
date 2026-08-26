import { kv } from '@vercel/kv';
import { getAccessToken } from './_helpers.js';

export default async function handler(req, res) {
  const { channelId, videoId, publishedAt } = req.query;
  const c = await kv.hgetall(`channel:${channelId}`);
  if (!c) { res.status(404).json({ error: 'not found' }); return; }
  const token = await getAccessToken(c.refresh_token);

  const end = new Date().toISOString().slice(0, 10);
  const start = (publishedAt || end).slice(0, 10);

  let series = [];
  try {
    const r1 = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=day&filters=video==${videoId}&sort=day`, { headers: { Authorization: `Bearer ${token}` } });
    const d1 = await r1.json();
    series = d1.rows || [];
  } catch (e) {}

  let sources = [];
  try {
    const r2 = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=insightTrafficSourceType&filters=video==${videoId}&sort=-views&maxResults=5`, { headers: { Authorization: `Bearer ${token}` } });
    const d2 = await r2.json();
    sources = d2.rows || [];
  } catch (e) {}

  res.json({ series, sources });
}
