import path from 'node:path';
import {
  absoluteUrl,
  getSiteContext,
  getSiteEnv,
  loadDotEnv,
  loadSiteArticles,
  parseCliFlags,
  resolveTargetSites,
  writeText,
} from './lib/utils.mjs';

export async function runPingSearchEngines({ siteIds, dryRun = false } = {}) {
  loadDotEnv();
  const targets = siteIds || resolveTargetSites();
  const summary = {};

  for (const siteId of targets) {
    const key = getSiteEnv(siteId, 'INDEXNOW_KEY');
    if (!key) {
      console.log(`[ping:${siteId}] INDEXNOW_KEY not configured; skipping.`);
      summary[siteId] = { submitted: false, reason: 'unconfigured' };
      continue;
    }

    const { siteConfig, paths } = getSiteContext(siteId);
    const articles = loadSiteArticles(paths.articlesDir);
    const urlList = [
      absoluteUrl('/', siteConfig),
      absoluteUrl('/tools/', siteConfig),
      absoluteUrl('/calculators/', siteConfig),
      ...articles.slice(0, 10).map((a) => absoluteUrl(`/articles/${a.meta.slug}/`, siteConfig)),
    ];

    writeText(path.join(paths.distDir, `${key}.txt`), key);

    if (dryRun) {
      summary[siteId] = { submitted: false, reason: 'dry-run', count: urlList.length };
      continue;
    }

    const host = new URL(siteConfig.siteUrl).host;
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key,
        keyLocation: absoluteUrl(`/${key}.txt`, siteConfig),
        urlList,
      }),
    });
    summary[siteId] = { submitted: res.ok, status: res.status, count: urlList.length };
  }

  return summary;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('ping-search-engines.mjs')) {
  const flags = parseCliFlags();
  runPingSearchEngines({
    siteIds: resolveTargetSites(flags),
    dryRun: Boolean(flags['dry-run']),
  })
    .then((res) => console.log('[ping] Done:', JSON.stringify(res)))
    .catch((err) => {
      console.error('[ping] Error:', err);
      process.exit(1);
    });
}
