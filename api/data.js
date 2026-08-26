import { kv } from '@vercel/kv';
import { getAccessToken } from './_helpers.js';

export default async function handler(req, res) {
  const { channelId } = req.query;
  const c = await kv.hgetall(`channel:${channelId}`);
  if (!c) { res.status(404).json({ error: 'not found' }); return; }
  const token = await getAccessToken(c.refresh_token);

  const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}`, { headers: { Authorization: `Bearer ${token}` } });
  const chData = await chRes.json();
  const stats = (chData.items && chData.items[0] && chData.items[0].statistics) || {};

  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  let analytics = { views: 0, estimatedMinutesWatched: 0, subscribersGained: 0, estimatedRevenue: 0 };
  try {
    const ar = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views,estimatedMinutesWatched,subscribersGained,estimatedRevenue`, { headers: { Authorization: `Bearer ${token}` } });
    const ad = await ar.json();
    if (ad.rows && ad.rows[0]) {
      const row = ad.rows[0];
      analytics = { views: row[0], estimatedMinutesWatched: row[1], subscribersGained: row[2], estimatedRevenue: row[3] };
    }
  } catch (e) {}

  let videos = [];
  try {
    const pr = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=6&playlistId=${c.uploadsPlaylist}`, { headers: { Authorization: `Bearer ${token}` } });
    const pd = await pr.json();
    const ids2 = (pd.items || []).map(i => i.snippet.resourceId.videoId).join(',');
    if (ids2) {
      const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids2}`, { headers: { Authorization: `Bearer ${token}` } });
      const vd = await vr.json();
      // chronological order: newest first (matches upload order)
      videos = (vd.items || []).sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));
      // rank = position by views among this same set (1 = highest views)
      const byViews = [...videos].sort((a, b) => b.statistics.viewCount - a.statistics.viewCount);
      videos.forEach(v => { v.rankByViews = byViews.findIndex(x => x.id === v.id) + 1; });
    }
  } catch (e) {}

  res.json({ title: c.title, thumb: c.thumb, subs: stats.subscriberCount, totalViews: stats.viewCount, analytics, videos });
}
