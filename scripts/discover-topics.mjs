import {
  GLOBAL_PATHS,
  getSiteContext,
  isValidSlug,
  loadDotEnv,
  nowIsoTaipei,
  parseCliFlags,
  readJson,
  resolveTargetSites,
  writeJson,
} from './lib/utils.mjs';
import { generateTopicIdeas, hasGeminiKey } from './lib/gemini.mjs';

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ToolLabTW-MatrixBot/2.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function extractRssTitles(xmlText, maxItems = 5) {
  const titles = [];
  const itemMatches = xmlText.matchAll(/<(?:item|entry)\b[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>[\s\S]*?<\/(?:item|entry)>/gi);
  for (const m of itemMatches) {
    const clean = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (clean) titles.push(clean);
    if (titles.length >= maxItems) break;
  }
  return titles;
}

async function fetchGlobalExchangeRateAndTrends(sources, dryRun) {
  let latestUsdToTwd = null;
  const trendHeadlines = [];

  if (dryRun) {
    return { latestUsdToTwd, trendHeadlines };
  }

  if (sources.exchangeRateApi) {
    try {
      const res = await fetchWithTimeout(sources.exchangeRateApi, 6000);
      const data = await res.json();
      const twd = Number(data?.rates?.TWD);
      if (twd > 20 && twd < 50) {
        latestUsdToTwd = Math.round(twd * 100) / 100;
        console.log(`[discover] Global USD/TWD rate: ${latestUsdToTwd}`);
      }
    } catch (err) {
      console.warn(`[discover] Exchange rate fetch skipped: ${err.message}`);
    }
  }

  for (const feed of sources.rssFeeds || []) {
    try {
      const res = await fetchWithTimeout(feed.url, 6000);
      const xml = await res.text();
      for (const t of extractRssTitles(xml, 4)) {
        trendHeadlines.push(`[${feed.name}] ${t}`);
      }
    } catch (err) {
      console.warn(`[discover] RSS skipped (${feed.name}): ${err.message}`);
    }
  }

  return { latestUsdToTwd, trendHeadlines };
}

export async function runDiscover({ siteIds, dryRun = false } = {}) {
  loadDotEnv();
  const sources = readJson(GLOBAL_PATHS.sourcesConfig, { rssFeeds: [] });
  const targets = siteIds || resolveTargetSites();
  const { latestUsdToTwd, trendHeadlines } = await fetchGlobalExchangeRateAndTrends(sources, dryRun);

  const summary = {};
  for (const siteId of targets) {
    const { siteConfig, paths } = getSiteContext(siteId);
    const catalog = readJson(paths.catalog, []);
    const topics = readJson(paths.topics, []);
    const state = readJson(paths.state, {});

    if (latestUsdToTwd && !dryRun) {
      const rawSite = readJson(paths.siteConfig, {});
      rawSite.usdToTwd = latestUsdToTwd;
      writeJson(paths.siteConfig, rawSite);
      state.lastExchangeRateUpdate = nowIsoTaipei();
    }

    const pendingTopics = topics.filter((t) => t.status === 'pending');
    let addedTopics = 0;

    if (pendingTopics.length < 8) {
      if (dryRun) {
        console.log(`[discover:${siteId}] [dry-run] Pending (${pendingTopics.length}) < 8; would generate new topics.`);
      } else if (!hasGeminiKey()) {
        console.log(`[discover:${siteId}] Pending (${pendingTopics.length}) < 8, no GEMINI_API_KEY; skipping AI topics.`);
      } else {
        try {
          const existingSlugs = topics.map((t) => t.slug);
          const catalogSlugs = new Set(catalog.map((c) => c.slug));
          const ideas = await generateTopicIdeas({
            trendHeadlines: siteConfig.niche === 'ai-saas' ? trendHeadlines : [],
            catalog,
            existingSlugs,
            siteConfig,
            count: 4,
          });

          let nextNum = topics.length + 1;
          for (const idea of ideas || []) {
            if (!idea?.slug || !isValidSlug(idea.slug) || existingSlugs.includes(idea.slug)) continue;
            const validTools = (idea.tools || []).filter((slug) => catalogSlugs.has(slug));
            if (validTools.length === 0) continue;

            topics.push({
              id: `${siteId}-topic-${String(nextNum++).padStart(3, '0')}`,
              slug: idea.slug,
              title: String(idea.title || '').trim(),
              type: ['review', 'comparison', 'roundup', 'tutorial'].includes(idea.type) ? idea.type : 'review',
              category: String(idea.category || catalog[0]?.category || 'Reviews').trim(),
              tools: validTools,
              targetKeyword: String(idea.targetKeyword || idea.title).trim(),
              priority: Number(idea.priority || 70),
              status: 'pending',
            });
            existingSlugs.push(idea.slug);
            addedTopics++;
          }
          if (addedTopics > 0) writeJson(paths.topics, topics);
        } catch (err) {
          console.warn(`[discover:${siteId}] AI topic generation failed: ${err.message}`);
        }
      }
    } else {
      console.log(`[discover:${siteId}] Topic queue healthy (${pendingTopics.length} pending).`);
    }

    if (!dryRun) writeJson(paths.state, state);
    summary[siteId] = {
      usdToTwd: latestUsdToTwd || siteConfig.usdToTwd,
      addedTopics,
      pendingCount: topics.filter((t) => t.status === 'pending').length,
    };
  }

  return summary;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('discover-topics.mjs')) {
  const flags = parseCliFlags();
  runDiscover({ siteIds: resolveTargetSites(flags), dryRun: Boolean(flags['dry-run']) })
    .then((res) => console.log('[discover] Done:', JSON.stringify(res)))
    .catch((err) => {
      console.error('[discover] Error:', err);
      process.exit(1);
    });
}
