import {
  GLOBAL_PATHS,
  countEffectiveChars,
  getSiteContext,
  isValidSlug,
  loadSiteArticles,
  nowIsoTaipei,
  parseCliFlags,
  readJson,
  resolveTargetSites,
  writeJson,
} from './lib/utils.mjs';

const FORBIDDEN_PATTERNS = [/TODO/i, /FIXME/i, /\[待補\]/, /Lorem ipsum/i, /\bundefined\b/];

async function checkHttpStatus(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ToolLabTW-LinkChecker/2.0)' },
    });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ToolLabTW-LinkChecker/2.0)' },
      });
    }
    return { ok: res.status < 400 || res.status === 403 || res.status === 429, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function checkSite(siteId, { checkUrls }) {
  const { siteConfig, paths } = getSiteContext(siteId);
  const catalog = readJson(paths.catalog, []);
  const articles = loadSiteArticles(paths.articlesDir);
  const minChars = Number(siteConfig.minArticleChars || 1200);

  const errors = [];
  const warnings = [];
  const urlResults = [];

  const catalogSlugs = new Set();
  for (const tool of catalog) {
    if (!isValidSlug(tool.slug)) errors.push(`[${siteId}] Catalog invalid slug: "${tool.slug}"`);
    if (catalogSlugs.has(tool.slug)) errors.push(`[${siteId}] Catalog duplicate slug: "${tool.slug}"`);
    catalogSlugs.add(tool.slug);

    if (!tool.name || !String(tool.officialUrl || '').startsWith('https://')) {
      errors.push(`[${siteId}] Catalog "${tool.slug}" missing valid name or https officialUrl`);
    }
    if (tool.affiliateUrl && !String(tool.affiliateUrl).startsWith('https://')) {
      errors.push(`[${siteId}] Catalog "${tool.slug}" affiliateUrl must start with https://`);
    }
    if (Number(tool.rating) < 1 || Number(tool.rating) > 5) {
      errors.push(`[${siteId}] Catalog "${tool.slug}" rating out of range: ${tool.rating}`);
    }
  }

  if (checkUrls) {
    console.log(`[qa:${siteId}] Checking ${catalog.length} catalog URLs...`);
    for (const tool of catalog) {
      const targetUrl = tool.affiliateUrl || tool.officialUrl;
      const check = await checkHttpStatus(targetUrl);
      urlResults.push({ slug: tool.slug, url: targetUrl, ...check });
      if (!check.ok) {
        warnings.push(`[${siteId}] URL check warning for "${tool.slug}" (${targetUrl}): status=${check.status}`);
      }
    }
  }

  const articleSlugs = new Set();
  const articleTitles = new Set();
  if (articles.length === 0) errors.push(`[${siteId}] No articles found`);

  for (const art of articles) {
    const { meta, body, file } = art;
    const prefix = `[${siteId}/${file}]`;

    if (!meta.title || !meta.slug || !meta.description || !meta.publishedAt || !meta.updatedAt || !meta.category) {
      errors.push(`${prefix} missing required frontmatter fields`);
    }
    if (!isValidSlug(meta.slug)) errors.push(`${prefix} invalid slug: "${meta.slug}"`);
    if (articleSlugs.has(meta.slug)) errors.push(`${prefix} duplicate slug: "${meta.slug}"`);
    articleSlugs.add(meta.slug);

    if (articleTitles.has(meta.title)) errors.push(`${prefix} duplicate title`);
    articleTitles.add(meta.title);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meta.publishedAt || ''))) {
      errors.push(`${prefix} invalid publishedAt: "${meta.publishedAt}"`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meta.updatedAt || ''))) {
      errors.push(`${prefix} invalid updatedAt: "${meta.updatedAt}"`);
    }

    const charCount = countEffectiveChars(body);
    if (charCount < minChars) errors.push(`${prefix} too short (${charCount} chars < ${minChars})`);

    const h2Count = (body.match(/^##\s+/gm) || []).length;
    if (h2Count < 3) errors.push(`${prefix} must have at least 3 ## headings`);

    const hasTableOrList = /^\|.+\|/m.test(body) || /^\s*[-*]\s+/m.test(body) || /^\s*\d+\.\s+/m.test(body);
    if (!hasTableOrList) errors.push(`${prefix} must include at least one table or list`);

    if (!Array.isArray(meta.faq) || meta.faq.length === 0) warnings.push(`${prefix} has no FAQ entries`);

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(body) || pattern.test(meta.title || '')) {
        errors.push(`${prefix} contains forbidden placeholder matching ${pattern}`);
      }
    }

    const goMatches = body.matchAll(/\/go\/([a-z0-9-]+)/g);
    let goCount = 0;
    for (const m of goMatches) {
      goCount++;
      if (!catalogSlugs.has(m[1])) {
        errors.push(`${prefix} references unknown /go/${m[1]} not in catalog.json`);
      }
    }
    if (goCount === 0) warnings.push(`${prefix} has no /go/<slug> CTA links`);
  }

  const report = {
    siteId,
    checkedAt: nowIsoTaipei(),
    passed: errors.length === 0,
    articleCount: articles.length,
    catalogCount: catalog.length,
    errors,
    warnings,
    urlResults,
  };
  writeJson(paths.qaReport, report);
  return report;
}

export async function runQualityGate({ siteIds, checkUrls = false } = {}) {
  const targets = siteIds || resolveTargetSites();
  const reports = [];
  for (const siteId of targets) {
    const r = await checkSite(siteId, { checkUrls });
    reports.push(r);
    if (r.passed) {
      console.log(`[qa:${siteId}] PASSED (${r.articleCount} articles, ${r.catalogCount} tools, ${r.warnings.length} warnings).`);
    } else {
      console.error(`[qa:${siteId}] FAILED (${r.errors.length} errors):`, r.errors);
    }
  }

  const summary = {
    checkedAt: nowIsoTaipei(),
    passed: reports.every((r) => r.passed),
    totalArticles: reports.reduce((s, r) => s + r.articleCount, 0),
    totalTools: reports.reduce((s, r) => s + r.catalogCount, 0),
    sites: reports,
  };
  writeJson(GLOBAL_PATHS.qaSummary, summary);
  return summary;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('quality-gate.mjs')) {
  const flags = parseCliFlags();
  runQualityGate({
    siteIds: resolveTargetSites(flags),
    checkUrls: Boolean(flags['check-urls']),
  })
    .then((summary) => {
      if (!summary.passed) process.exit(1);
    })
    .catch((err) => {
      console.error('[qa] Error:', err);
      process.exit(1);
    });
}
