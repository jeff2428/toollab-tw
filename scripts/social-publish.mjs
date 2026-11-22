import crypto from 'node:crypto';
import {
  getSiteContext,
  getSiteEnv,
  loadDotEnv,
  nowIsoTaipei,
  parseCliFlags,
  readJson,
  resolveTargetSites,
  todayIsoDate,
  writeJson,
} from './lib/utils.mjs';

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function buildOAuth1Header({ method, url, consumerKey, consumerSecret, token, tokenSecret }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };

  const parsed = new URL(url);
  const allParams = [];
  for (const [k, v] of parsed.searchParams.entries()) allParams.push([percentEncode(k), percentEncode(v)]);
  for (const [k, v] of Object.entries(oauthParams)) allParams.push([percentEncode(k), percentEncode(v)]);
  allParams.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  const paramString = allParams.map(([k, v]) => `${k}=${v}`).join('&');
  const baseUrl = `${parsed.origin}${parsed.pathname}`;
  const signatureBase = `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');

  const headerParams = { ...oauthParams, oauth_signature: signature };
  return (
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
      .join(', ')
  );
}

async function publishToThreads(siteId, post) {
  const userId = getSiteEnv(siteId, 'THREADS_USER_ID');
  const accessToken = getSiteEnv(siteId, 'THREADS_ACCESS_TOKEN');
  if (!userId || !accessToken) return { status: 'skipped', reason: 'unconfigured' };

  const fullText = `${post.text}\n\n${post.url}`;
  const payload = {
    media_type: post.imageUrl ? 'IMAGE' : 'TEXT',
    text: fullText,
    access_token: accessToken,
  };
  if (post.imageUrl) payload.image_url = post.imageUrl;

  const createRes = await fetch(`https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(payload),
  });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.id) {
    throw new Error(`Threads create failed (${createRes.status}): ${JSON.stringify(createData)}`);
  }

  await new Promise((r) => setTimeout(r, 3000));

  const pubRes = await fetch(`https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: createData.id, access_token: accessToken }),
  });
  const pubData = await pubRes.json();
  if (!pubRes.ok || !pubData.id) {
    throw new Error(`Threads publish failed (${pubRes.status}): ${JSON.stringify(pubData)}`);
  }
  return { status: 'published', externalId: pubData.id };
}

async function publishToFacebook(siteId, post) {
  const pageId = getSiteEnv(siteId, 'FB_PAGE_ID');
  const pageToken = getSiteEnv(siteId, 'FB_PAGE_ACCESS_TOKEN');
  if (!pageId || !pageToken) return { status: 'skipped', reason: 'unconfigured' };

  const res = await fetch(`https://graph.facebook.com/v22.0/${encodeURIComponent(pageId)}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message: post.text, link: post.url, access_token: pageToken }),
  });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`Facebook publish failed (${res.status}): ${JSON.stringify(data)}`);
  return { status: 'published', externalId: data.id };
}

async function publishToX(siteId, post) {
  const consumerKey = getSiteEnv(siteId, 'X_API_KEY');
  const consumerSecret = getSiteEnv(siteId, 'X_API_SECRET');
  const token = getSiteEnv(siteId, 'X_ACCESS_TOKEN');
  const tokenSecret = getSiteEnv(siteId, 'X_ACCESS_SECRET');
  if (!consumerKey || !consumerSecret || !token || !tokenSecret) {
    return { status: 'skipped', reason: 'unconfigured' };
  }

  const endpoint = 'https://api.x.com/2/tweets';
  const authHeader = buildOAuth1Header({
    method: 'POST',
    url: endpoint,
    consumerKey,
    consumerSecret,
    token,
    tokenSecret,
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `${post.text}\n${post.url}` }),
  });
  const data = await res.json();
  if (!res.ok || !data?.data?.id) throw new Error(`X publish failed (${res.status}): ${JSON.stringify(data)}`);
  return { status: 'published', externalId: data.data.id };
}

async function publishToTelegram(siteId, post) {
  const botToken = getSiteEnv(siteId, 'TELEGRAM_BOT_TOKEN');
  const channelId = getSiteEnv(siteId, 'TELEGRAM_CHANNEL_ID');
  if (!botToken || !channelId) return { status: 'skipped', reason: 'unconfigured' };

  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: channelId, text: `${post.text}\n\n${post.url}` }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(`Telegram publish failed (${res.status}): ${JSON.stringify(data)}`);
  return { status: 'published', externalId: String(data.result?.message_id || '') };
}

export async function refreshThreadsTokens(siteIds) {
  loadDotEnv();
  const seenTokens = new Set();
  const results = [];
  for (const siteId of siteIds) {
    const token = getSiteEnv(siteId, 'THREADS_ACCESS_TOKEN');
    if (!token || seenTokens.has(token)) continue;
    seenTokens.add(token);

    const url = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(`Threads token refresh failed (${siteId}, ${res.status}): ${JSON.stringify(data)}`);
    }
    const { paths } = getSiteContext(siteId);
    const state = readJson(paths.state, {});
    state.lastThreadsTokenRefresh = nowIsoTaipei();
    writeJson(paths.state, state);
    results.push({ siteId, refreshed: true, expiresInSeconds: data.expires_in });
  }
  return results;
}

async function publishForSite(siteId, { dryRun }) {
  const { siteConfig, paths } = getSiteContext(siteId);
  const queue = readJson(paths.socialQueue, []);
  const state = readJson(paths.state, {});
  const today = todayIsoDate();

  if (!state.dailyCounters || state.dailyCounters.date !== today) {
    state.dailyCounters = { date: today, articlesGenerated: 0, socialPublished: 0 };
  }

  const dailyLimit = Number(siteConfig.dailySocialLimit || 2);
  let remaining = Math.max(0, dailyLimit - Number(state.dailyCounters.socialPublished || 0));
  const pending = queue.filter((item) => item.status === 'pending');
  const results = [];

  for (const post of pending) {
    if (remaining <= 0 && !dryRun) break;
    if (dryRun) {
      console.log(`[social:${siteId}] [dry-run] Would publish to ${post.platform}: "${post.text.slice(0, 50)}..."`);
      results.push({ id: post.id, platform: post.platform, status: 'dry-run' });
      if (results.length >= dailyLimit) break;
      continue;
    }

    try {
      let outcome;
      if (post.platform === 'threads') outcome = await publishToThreads(siteId, post);
      else if (post.platform === 'facebook') outcome = await publishToFacebook(siteId, post);
      else if (post.platform === 'x') outcome = await publishToX(siteId, post);
      else if (post.platform === 'telegram') outcome = await publishToTelegram(siteId, post);
      else outcome = { status: 'skipped', reason: 'unknown_platform' };

      if (outcome.status === 'published') {
        post.status = 'published';
        post.publishedAt = nowIsoTaipei();
        post.externalId = outcome.externalId;
        state.dailyCounters.socialPublished += 1;
        remaining -= 1;
      } else {
        post.note = `skipped (${outcome.reason})`;
      }
      results.push({ id: post.id, platform: post.platform, ...outcome });
    } catch (err) {
      post.note = `error: ${err.message}`;
      results.push({ id: post.id, platform: post.platform, status: 'error', error: err.message });
    }
  }

  if (!dryRun) {
    writeJson(paths.socialQueue, queue);
    writeJson(paths.state, state);
  }
  return results;
}

export async function runSocialPublish({ siteIds, dryRun = false, refreshTokens = false } = {}) {
  loadDotEnv();
  const targets = siteIds || resolveTargetSites();
  if (refreshTokens && !dryRun) {
    const ref = await refreshThreadsTokens(targets);
    console.log('[social] Token refresh:', JSON.stringify(ref));
  }
  const summary = {};
  for (const siteId of targets) {
    summary[siteId] = await publishForSite(siteId, { dryRun });
  }
  return summary;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('social-publish.mjs')) {
  const flags = parseCliFlags();
  runSocialPublish({
    siteIds: resolveTargetSites(flags),
    dryRun: Boolean(flags['dry-run']),
    refreshTokens: Boolean(flags['refresh-tokens']),
  })
    .then((res) => console.log('[social] Done:', JSON.stringify(res)))
    .catch((err) => {
      console.error('[social] Error:', err);
      process.exit(1);
    });
}
