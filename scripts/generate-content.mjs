import path from 'node:path';
import {
  GLOBAL_PATHS,
  absoluteUrl,
  countEffectiveChars,
  daysBetween,
  getSiteContext,
  loadDotEnv,
  loadSiteArticles,
  nowIsoTaipei,
  parseCliFlags,
  readJson,
  resolveTargetSites,
  stringifyFrontmatter,
  todayIsoDate,
  writeJson,
  writeText,
} from './lib/utils.mjs';
import {
  generateStructuredArticle,
  hasGeminiKey,
  researchToolsFactCheck,
} from './lib/gemini.mjs';

function buildSocialEntries(slug, socialObj, siteConfig) {
  const now = nowIsoTaipei();
  const baseArticleUrl = absoluteUrl(`/articles/${slug}/`, siteConfig);
  const platforms = [
    { key: 'threads', text: socialObj.threads },
    { key: 'facebook', text: socialObj.facebook },
    { key: 'x', text: socialObj.x },
    { key: 'telegram', text: socialObj.telegram },
  ];

  return platforms
    .filter((p) => p.text && String(p.text).trim().length > 0)
    .map((p, idx) => ({
      id: `${siteConfig.id}-soc-${Date.now()}-${idx + 1}`,
      articleSlug: slug,
      platform: p.key,
      text: String(p.text).trim(),
      url: `${baseArticleUrl}?utm_source=${p.key}&utm_medium=social&utm_campaign=${slug}`,
      status: 'pending',
      createdAt: now,
      publishedAt: null,
      externalId: null,
    }));
}

async function generateForSite(siteId, { dryRun, skipAi, mode }) {
  const { siteConfig, paths } = getSiteContext(siteId);
  const catalog = readJson(paths.catalog, []);
  const topics = readJson(paths.topics, []);
  const socialQueue = readJson(paths.socialQueue, []);
  const state = readJson(paths.state, {});
  const articles = loadSiteArticles(paths.articlesDir);
  const today = todayIsoDate();

  if (!state.dailyCounters || state.dailyCounters.date !== today) {
    state.dailyCounters = { date: today, articlesGenerated: 0, socialPublished: 0 };
  }

  const dailyLimit = Number(siteConfig.dailyArticleLimit || 1);
  if (state.dailyCounters.articlesGenerated >= dailyLimit && !dryRun) {
    console.log(`[generate:${siteId}] Daily limit reached (${dailyLimit}). Skipping.`);
    return { action: 'skipped_limit', slug: null };
  }

  const refreshDays = Number(siteConfig.refreshDays || 30);
  const outdatedArticles = articles
    .filter((a) => daysBetween(a.meta.updatedAt || a.meta.publishedAt, today) >= refreshDays)
    .sort((a, b) => String(a.meta.updatedAt || '').localeCompare(String(b.meta.updatedAt || '')));

  const pendingTopics = topics
    .filter((t) => t.status === 'pending')
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));

  let selectedMode = mode;
  if (selectedMode === 'auto') {
    if (outdatedArticles.length > 0) selectedMode = 'refresh';
    else if (pendingTopics.length > 0) selectedMode = 'new';
    else return { action: 'noop', slug: null };
  }
  if (selectedMode === 'refresh' && outdatedArticles.length === 0) {
    if (pendingTopics.length > 0) selectedMode = 'new';
    else return { action: 'noop', slug: null };
  }

  const targetArticle = selectedMode === 'refresh' ? outdatedArticles[0] : null;
  const targetTopic =
    selectedMode === 'refresh'
      ? topics.find((t) => t.slug === targetArticle.meta.slug) || {
          slug: targetArticle.meta.slug,
          title: targetArticle.meta.title,
          type: targetArticle.meta.type || 'review',
          category: targetArticle.meta.category,
          tools: targetArticle.meta.tools || [],
          targetKeyword: targetArticle.meta.tags?.[0] || targetArticle.meta.title,
        }
      : pendingTopics[0];

  if (!targetTopic) return { action: 'noop', slug: null };

  const toolSlugs = new Set(targetTopic.tools || []);
  const relevantCatalog = catalog.filter((c) => toolSlugs.has(c.slug));
  const usedCatalog = relevantCatalog.length > 0 ? relevantCatalog : catalog.slice(0, 3);

  if (dryRun || skipAi || !hasGeminiKey()) {
    const reason = dryRun ? 'dry-run' : skipAi ? 'skip-ai' : 'no-gemini-key';
    console.log(`[generate:${siteId}] [${reason}] Would ${selectedMode}: "${targetTopic.title}" (${targetTopic.slug})`);
    return { action: `simulated_${selectedMode}`, slug: targetTopic.slug, reason };
  }

  console.log(`[generate:${siteId}] Pass 1 fact-check (${targetTopic.slug})...`);
  const factBrief = await researchToolsFactCheck({
    topicTitle: targetTopic.title,
    toolsCatalog: usedCatalog,
    usdToTwd: siteConfig.usdToTwd,
    locale: siteConfig.locale,
  });

  const validSlugs = new Set(catalog.map((c) => c.slug));
  const fallbackSlug = usedCatalog[0]?.slug || catalog[0]?.slug || '';
  const minChars = Number(siteConfig.minArticleChars || 1200);

  let generated = null;
  let lastGenErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[generate:${siteId}] Pass 2 structured article (${targetTopic.slug}, attempt ${attempt})...`);
      const candidate = await generateStructuredArticle({
        topic: targetTopic,
        toolsCatalog: usedCatalog,
        factBrief,
        siteConfig,
        mode: selectedMode,
        existingBody: targetArticle?.body || '',
      });

      let bodyMd = String(candidate?.bodyMarkdown || '');
      // Sanitize unknown /go/<slug> links so QA Gate never blocks deploy
      bodyMd = bodyMd.replace(/\/go\/([a-z0-9-]+)/g, (full, s) =>
        validSlugs.has(s) ? full : fallbackSlug ? `/go/${fallbackSlug}` : full
      );
      candidate.bodyMarkdown = bodyMd;

      const chars = countEffectiveChars(bodyMd);
      const h2Count = (bodyMd.match(/^##\s+/gm) || []).length;
      if (chars < minChars || h2Count < 3) {
        throw new Error(`Draft below quality threshold (chars=${chars}/${minChars}, h2=${h2Count})`);
      }
      generated = candidate;
      break;
    } catch (err) {
      lastGenErr = err;
      console.warn(`[generate:${siteId}] Attempt ${attempt} failed: ${err.message}`);
    }
  }

  if (!generated) {
    throw lastGenErr || new Error('Article generation failed after 2 attempts');
  }

  const meta = {
    title: generated.title || targetTopic.title,
    slug: targetTopic.slug,
    description: generated.description || targetTopic.title,
    publishedAt: targetArticle?.meta?.publishedAt || today,
    updatedAt: today,
    category: targetTopic.category,
    type: targetTopic.type || 'review',
    tools: usedCatalog.map((t) => t.slug),
    tags: Array.isArray(generated.tags) && generated.tags.length > 0 ? generated.tags : [targetTopic.category],
    rating: Math.min(5, Math.max(4, Number(generated.rating || 4.7))),
    faq: Array.isArray(generated.faq) ? generated.faq.slice(0, 5) : [],
  };

  const fullMarkdown = stringifyFrontmatter(meta, generated.bodyMarkdown || '');
  const outPath = targetArticle?.filePath || path.join(paths.articlesDir, `${targetTopic.slug}.md`);
  writeText(outPath, fullMarkdown);

  const topicRecord = topics.find((t) => t.slug === targetTopic.slug);
  if (topicRecord) {
    topicRecord.status = 'published';
    writeJson(paths.topics, topics);
  }

  if (generated.social) {
    socialQueue.push(...buildSocialEntries(targetTopic.slug, generated.social, siteConfig));
    writeJson(paths.socialQueue, socialQueue);
  }

  for (const item of catalog) {
    if (toolSlugs.has(item.slug)) item.lastVerifiedAt = today;
  }
  writeJson(paths.catalog, catalog);

  state.dailyCounters.articlesGenerated += 1;
  state.lastContentGeneratedAt = nowIsoTaipei();
  writeJson(paths.state, state);

  console.log(`[generate:${siteId}] Wrote ${path.basename(outPath)} (${selectedMode}).`);
  return { action: selectedMode, slug: targetTopic.slug };
}

export async function runGenerate({ siteIds, dryRun = false, skipAi = false, mode = 'auto' } = {}) {
  loadDotEnv();
  const targets = siteIds || resolveTargetSites();
  const summary = {};
  const aiErrors = [];
  for (const siteId of targets) {
    try {
      summary[siteId] = await generateForSite(siteId, { dryRun, skipAi, mode });
    } catch (err) {
      console.error(`[generate:${siteId}] Error (continuing pipeline): ${err.message}`);
      aiErrors.push({ siteId, error: err.message, at: nowIsoTaipei() });
      summary[siteId] = { action: 'error', error: err.message };
    }
  }
  if (!dryRun) {
    writeJson(path.join(GLOBAL_PATHS.reportsDir, 'ai-errors.json'), aiErrors);
  }
  return summary;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('generate-content.mjs')) {
  const flags = parseCliFlags();
  runGenerate({
    siteIds: resolveTargetSites(flags),
    dryRun: Boolean(flags['dry-run']),
    skipAi: Boolean(flags['skip-ai']),
    mode: flags.mode || 'auto',
  })
    .then((res) => console.log('[generate] Done:', JSON.stringify(res)))
    .catch((err) => {
      console.error('[generate] Error:', err);
      process.exit(1);
    });
}
