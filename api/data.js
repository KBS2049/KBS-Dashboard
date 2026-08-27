import { kv } from '@vercel/kv';
import { getAccessToken } from './_helpers.js';
import { requireUser } from './_auth.js';

async function safeFetch(url, token) {
  try { const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); return await r.json(); } catch (e) { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res); if (!user) return;
  const { channelId } = req.query;
  const c = await kv.hgetall(`channel:${channelId}`);
  if (!c || c.ownerId !== user.id) { res.status(404).json({ error: 'not found' }); return; }
  const token = await getAccessToken(c.refresh_token);
  if (!token) { res.status(401).json({ error: 'youtube_authorization_expired' }); return; }

  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const A = 'https://youtubeanalytics.googleapis.com/v2/reports';
  const [chData, ad, dailyD, demoD, geoD, devD, subD, srcD, playlistD] = await Promise.all([
    safeFetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}`, token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views,estimatedMinutesWatched,subscribersGained,estimatedRevenue,likes,comments,shares`, token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=day&sort=day`, token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=viewerPercentage&dimensions=ageGroup,gender&sort=-viewerPercentage`, token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=country&sort=-views&maxResults=6`, token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=deviceType&sort=-views`, token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=subscribedStatus&sort=-views`, token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=insightTrafficSourceType&sort=-views&maxResults=6`, token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=playlist&sort=-views&maxResults=5`, token)
  ]);

  const stats = (chData.items && chData.items[0] && chData.items[0].statistics) || {};
  const analytics = { views: 0, estimatedMinutesWatched: 0, subscribersGained: 0, estimatedRevenue: 0, likes: 0, comments: 0, shares: 0 };
  if (ad.rows && ad.rows[0]) { const cols = (ad.columnHeaders || []).map(h => h.name); ad.rows[0].forEach((v,i)=>{ analytics[cols[i]]=v; }); }

  let videos = [];
  try {
    const pd = await safeFetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=6&playlistId=${c.uploadsPlaylist}`, token);
    const ids2 = (pd.items || []).map(i=>i.snippet.resourceId.videoId).join(',');
    if (ids2) {
      const vd = await safeFetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids2}`, token);
      videos = (vd.items || []).sort((a,b)=>new Date(b.snippet.publishedAt)-new Date(a.snippet.publishedAt));
      const byViews=[...videos].sort((a,b)=>(Number(b.statistics?.viewCount)||0)-(Number(a.statistics?.viewCount)||0));
      videos.forEach(v=>{v.rankByViews=byViews.findIndex(x=>x.id===v.id)+1;});
    }
  } catch(e) {}

  res.json({ title:c.title, thumb:c.thumb, subs:stats.subscriberCount, totalViews:stats.viewCount, videoCount:stats.videoCount, analytics, videos, dailyViews:dailyD.rows||[], demographics:demoD.rows||[], countries:geoD.rows||[], devices:devD.rows||[], subscribedStatus:subD.rows||[], trafficSources:srcD.rows||[], playlists:playlistD.rows||[], fetchedAt:Date.now() });
}
