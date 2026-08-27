import { kv } from '@vercel/kv';
import { getSession } from './_auth.js';

export default async function handler(req, res) {
  const user = await getSession(req);
  if (!user) { res.status(401).send('Please log in to KBS Studio before connecting YouTube.'); return; }
  const { code } = req.query;
  if (!code) { res.status(400).send('Missing code'); return; }
  const redirect_uri = `https://${req.headers.host}/api/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri, grant_type: 'authorization_code' })
  });
  const tok = await tokenRes.json();
  if (!tok.access_token || !tok.refresh_token) { res.status(400).send('Login failed: Google did not return a refresh token. Remove KBS Studio from your Google account third-party access and try again.'); return; }

  const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true&maxResults=50', { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const chData = await chRes.json();
  const items = chData.items || [];
  if (!items.length) { res.status(400).send('Could not read YouTube channel info'); return; }

  for (const c of items) {
    await kv.hset(`channel:${c.id}`, {
      ownerId: user.id,
      refresh_token: tok.refresh_token,
      title: c.snippet?.title || 'YouTube Channel',
      thumb: c.snippet?.thumbnails?.default?.url || '',
      uploadsPlaylist: c.contentDetails?.relatedPlaylists?.uploads || ''
    });
    await kv.sadd(`user:${user.id}:channels`, c.id);
    await kv.sadd('channels', c.id);
  }
  res.writeHead(302, { Location: '/' }); res.end();
}
