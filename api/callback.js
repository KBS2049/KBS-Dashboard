import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) { res.status(400).send('Missing code'); return; }
  const redirect_uri = `https://${req.headers.host}/api/callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri,
      grant_type: 'authorization_code'
    })
  });
  const tok = await tokenRes.json();
  if (!tok.refresh_token) {
    res.status(400).send('Login failed: no refresh token. Google account > Security > Third-party access > remove KBS Dashboard, then try Add Channel again.');
    return;
  }

  const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true', {
    headers: { Authorization: `Bearer ${tok.access_token}` }
  });
  const chData = await chRes.json();
  const c = chData.items && chData.items[0];
  if (!c) { res.status(400).send('Could not read channel info'); return; }

  await kv.hset(`channel:${c.id}`, {
    refresh_token: tok.refresh_token,
    title: c.snippet.title,
    thumb: c.snippet.thumbnails.default.url,
    uploadsPlaylist: c.contentDetails.relatedPlaylists.uploads
  });
  await kv.sadd('channels', c.id);

  res.writeHead(302, { Location: '/' });
  res.end();
}
