import { randomBytes } from 'node:crypto';
import { kv } from '@vercel/kv';
import { getSession } from './_auth.js';

export default async function handler(req,res){
  const user=await getSession(req);
  if(!user){res.writeHead(302,{Location:'/'});res.end();return;}
  const state=randomBytes(24).toString('hex');
  await kv.set(`oauth_state:${state}`,{userId:user.id}, {ex:600});
  const params=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:`https://${req.headers.host}/api/callback`,response_type:'code',access_type:'offline',prompt:'consent',state,scope:['https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/yt-analytics.readonly','https://www.googleapis.com/auth/yt-analytics-monetary.readonly'].join(' ')});
  res.writeHead(302,{Location:`https://accounts.google.com/o/oauth2/v2/auth?${params}`});res.end();
}
