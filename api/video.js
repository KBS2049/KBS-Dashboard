import { kv } from '@vercel/kv';
import { getAccessToken } from './_helpers.js';
import { requireUser } from './_auth.js';

async function safeFetch(url, token) { try { const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}}); return await r.json(); } catch(e){ return {}; } }

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const user=await requireUser(req,res); if(!user)return;
  const {channelId,videoId,publishedAt}=req.query;
  const c=await kv.hgetall(`channel:${channelId}`);
  if(!c||c.ownerId!==user.id){res.status(404).json({error:'not found'});return;}
  const token=await getAccessToken(c.refresh_token);
  if(!token){res.status(401).json({error:'youtube_authorization_expired'});return;}
  const end=new Date().toISOString().slice(0,10),start=(publishedAt||end).slice(0,10),A='https://youtubeanalytics.googleapis.com/v2/reports',F=`filters=video==${videoId}`;
  const [viewsSeriesD,subsSeriesD,watchSeriesD,revSeriesD,sourcesD,extraD,devicesD,geoD,demoD,searchTermsD,externalAppsD]=await Promise.all([
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=day&${F}&sort=day`,token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=subscribersGained&dimensions=day&${F}&sort=day`,token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=estimatedMinutesWatched&dimensions=day&${F}&sort=day`,token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=estimatedRevenue&dimensions=day&${F}&sort=day`,token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=insightTrafficSourceType&${F}&sort=-views&maxResults=6`,token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,shares,comments,likes,estimatedRevenue,estimatedAdRevenue&${F}`,token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=deviceType&${F}&sort=-views`,token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=country&${F}&sort=-views&maxResults=6`,token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=viewerPercentage&dimensions=ageGroup,gender&${F}&sort=-viewerPercentage`,token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=insightTrafficSourceDetail&filters=video==${videoId};insightTrafficSourceType==YT_SEARCH&sort=-views&maxResults=6`,token),
    safeFetch(`${A}?ids=channel==${channelId}&startDate=${start}&endDate=${end}&metrics=views&dimensions=insightTrafficSourceDetail&filters=video==${videoId};insightTrafficSourceType==EXT_URL&sort=-views&maxResults=6`,token)
  ]);
  let extra={};if(extraD.rows&&extraD.rows[0]){const cols=(extraD.columnHeaders||[]).map(h=>h.name);extraD.rows[0].forEach((v,i)=>{extra[cols[i]]=v;});}
  res.json({viewsSeries:viewsSeriesD.rows||[],subsSeries:subsSeriesD.rows||[],watchSeries:watchSeriesD.rows||[],revSeries:revSeriesD.rows||[],sources:sourcesD.rows||[],extra,devices:devicesD.rows||[],countries:geoD.rows||[],demographics:demoD.rows||[],searchTerms:searchTermsD.rows||[],externalApps:externalAppsD.rows||[],fetchedAt:Date.now()});
}
