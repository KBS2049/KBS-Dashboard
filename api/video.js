import { kv } from '@vercel/kv';
import { getAccessToken } from './_helpers.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
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

  let extra = {};
  try {
    const r3 = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,shares,comments,likes,dislikes,estimatedRevenue&filters=video==${videoId}`, { headers: { Authorization: `Bearer ${token}` } });
    const d3 = await r3.json();
    if (d3.rows && d3.rows[0]) {
      const cols = d3.columnHeaders.map(c => c.name);
      d3.rows[0].forEach((v, i) => { extra[cols[i]] = v; });
    }
  } catch (e) {}

  let devices = [];
  try {
    const r4 = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=deviceType&filters=video==${videoId}&sort=-views`, { headers: { Authorization: `Bearer ${token}` } });
    const d4 = await r4.json();
    devices = d4.rows || [];
  } catch (e) {}

  res.json({ series, sources, extra, devices, fetchedAt: Date.now() });
}
