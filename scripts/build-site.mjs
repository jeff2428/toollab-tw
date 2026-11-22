import path from 'node:path';
import {
  GLOBAL_PATHS,
  absoluteUrl,
  daysBetween,
  ensureDir,
  escapeHtml,
  escapeXml,
  getSiteContext,
  loadMatrixConfig,
  loadSiteArticles,
  parseCliFlags,
  readJson,
  resolveTargetSites,
  todayIsoDate,
  usdToTwd,
  withBasePath,
  writeText,
} from './lib/utils.mjs';
import { renderMarkdown } from './lib/markdown.mjs';
import { getUiStrings } from './lib/i18n.mjs';
import { buildCalculatorsPageContent } from './lib/calculators.mjs';

function buildAnalyticsHead(siteConfig) {
  const parts = [];
  if (siteConfig.ga4MeasurementId) {
    const id = escapeHtml(siteConfig.ga4MeasurementId);
    parts.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');</script>`);
  }
  if (siteConfig.cloudflareToken) {
    const token = escapeHtml(siteConfig.cloudflareToken);
    parts.push(`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${token}"}'></script>`);
  }
  return parts.join('\n');
}

function buildLayout({
  title,
  description,
  canonicalPath,
  ogImageFile = 'default.svg',
  ogType = 'website',
  jsonLd = [],
  bodyHtml,
  siteConfig,
  ui,
  isArticle = false,
}) {
  const bp = siteConfig.basePath;
  const canonicalUrl = absoluteUrl(canonicalPath, siteConfig);
  const ogImageUrl = absoluteUrl(`/og/${ogImageFile}`, siteConfig);
  const rssUrl = absoluteUrl('/rss.xml', siteConfig);
  const analyticsHtml = buildAnalyticsHead(siteConfig);
  const jsonLdScripts = jsonLd
    .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
    .join('\n  ');
  const badgeText = escapeHtml(siteConfig.brandEnglish.slice(0, 2).toUpperCase());

  const matrixLink = siteConfig.isPrimary && !siteConfig.standalone
    ? `<a href="${escapeHtml(withBasePath('/matrix/', bp))}">${escapeHtml(ui.navMatrix)}</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(ui.htmlLang)}" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(siteConfig.brandName)} RSS" href="${escapeHtml(rssUrl)}" />
  <meta property="og:type" content="${escapeHtml(ogType)}" />
  <meta property="og:locale" content="${escapeHtml(ui.ogLocale)}" />
  <meta property="og:site_name" content="${escapeHtml(siteConfig.brandName)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${escapeHtml(withBasePath('/assets/style.css', bp))}" />
  ${analyticsHtml}
  ${jsonLdScripts}
</head>
<body>
  ${isArticle ? '<div id="read-progress" class="read-progress"></div>' : ''}
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="${escapeHtml(withBasePath('/', bp))}">
        <span class="brand-badge">${badgeText}</span>
        <span>
          <strong>${escapeHtml(siteConfig.brandName)}</strong>
          <small>${escapeHtml(siteConfig.brandEnglish)}</small>
        </span>
      </a>
      <nav class="main-nav" aria-label="Main Navigation">
        <a href="${escapeHtml(withBasePath('/', bp))}">${escapeHtml(ui.navReviews)}</a>
        <a href="${escapeHtml(withBasePath('/tools/', bp))}">${escapeHtml(ui.navTools)}</a>
        <a href="${escapeHtml(withBasePath('/calculators/', bp))}">${escapeHtml(ui.navCalculators)}</a>
        <a href="${escapeHtml(withBasePath('/newsletter/', bp))}">${escapeHtml(ui.navNewsletter)}</a>
        <a href="${escapeHtml(withBasePath('/status/', bp))}">${escapeHtml(ui.navStatus)}</a>
        ${matrixLink}
        <button id="theme-toggle" class="theme-btn" type="button" aria-label="Toggle Theme">◐</button>
      </nav>
    </div>
  </header>

  <main>
    ${bodyHtml}
  </main>

  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <strong>${escapeHtml(siteConfig.brandName)} (${escapeHtml(siteConfig.brandEnglish)})</strong>
        <p class="muted">${escapeHtml(siteConfig.description)}</p>
      </div>
      <div class="footer-links">
        <a href="${escapeHtml(withBasePath('/calculators/', bp))}">${escapeHtml(ui.navCalculators)}</a>
        <a href="${escapeHtml(withBasePath('/newsletter/', bp))}">${escapeHtml(ui.navNewsletter)}</a>
        <a href="${escapeHtml(withBasePath('/disclosure/', bp))}">${escapeHtml(ui.footerDisclosureLink)}</a>
        <a href="${escapeHtml(withBasePath('/privacy/', bp))}">${escapeHtml(ui.footerPrivacyLink)}</a>
        <a href="${escapeHtml(withBasePath('/status/', bp))}">${escapeHtml(ui.footerStatusLink)}</a>
        <a href="${escapeHtml(withBasePath('/rss.xml', bp))}">${escapeHtml(ui.footerRssLink)}</a>
      </div>
    </div>
    <div class="container footer-bottom">
      <p>© ${new Date().getFullYear()} ${escapeHtml(siteConfig.brandName)} · ${escapeHtml(siteConfig.disclosureShort)}</p>
    </div>
  </footer>

  <script src="${escapeHtml(withBasePath('/assets/app.js', bp))}" defer></script>
</body>
</html>`;
}

function buildCss() {
  return `:root {
  --bg: #0b1120;
  --surface: #111827;
  --surface-2: #1e293b;
  --border: #334155;
  --text: #f1f5f9;
  --muted: #94a3b8;
  --primary: #818cf8;
  --primary-strong: #6366f1;
  --accent: #10b981;
  --accent-soft: rgba(16, 185, 129, 0.14);
  --radius: 14px;
  --shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
}

html[data-theme="light"] {
  --bg: #f8fafc;
  --surface: #ffffff;
  --surface-2: #f1f5f9;
  --border: #e2e8f0;
  --text: #0f172a;
  --muted: #475569;
  --primary: #4f46e5;
  --primary-strong: #4338ca;
  --accent: #059669;
  --accent-soft: rgba(5, 150, 105, 0.1);
  --shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Noto Sans TC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.75;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--primary); text-decoration: none; }
a:hover { text-decoration: underline; }
.container { max-width: 1140px; margin: 0 auto; padding: 0 20px; }
.muted { color: var(--muted); }

.read-progress {
  position: fixed; top: 0; left: 0; height: 3px; width: 0%;
  background: linear-gradient(90deg, var(--primary), var(--accent));
  z-index: 100; transition: width 0.1s linear;
}

.site-header {
  position: sticky; top: 0; z-index: 50;
  background: rgba(11, 17, 32, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}
html[data-theme="light"] .site-header { background: rgba(248, 250, 252, 0.88); }

.header-inner {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 68px; gap: 16px; flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 12px; color: var(--text); text-decoration: none; }
.brand:hover { text-decoration: none; }
.brand-badge {
  width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center;
  background: linear-gradient(135deg, var(--primary-strong), var(--accent));
  color: #fff; font-weight: 800; font-size: 14px;
}
.brand small { display: block; font-size: 11px; color: var(--muted); letter-spacing: 0.06em; }
.main-nav { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.main-nav a { color: var(--text); font-size: 14px; font-weight: 500; }
.theme-btn {
  border: 1px solid var(--border); background: var(--surface-2); color: var(--text);
  border-radius: 8px; padding: 5px 10px; cursor: pointer; font-size: 15px;
}

.hero {
  padding: 56px 0 40px;
  background: radial-gradient(circle at 85% 15%, rgba(99, 102, 241, 0.18), transparent 45%),
              radial-gradient(circle at 15% 85%, rgba(16, 185, 129, 0.12), transparent 40%);
  border-bottom: 1px solid var(--border);
}
.hero-tag {
  display: inline-block; padding: 4px 12px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 700;
}
.hero h1 { font-size: clamp(28px, 4vw, 42px); line-height: 1.3; margin: 14px 0 12px; }
.hero p { max-width: 720px; font-size: 17px; color: var(--muted); margin: 0 0 24px; }
.hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 14px;
  border: 1px solid transparent; cursor: pointer; text-decoration: none;
}
.btn:hover { text-decoration: none; opacity: 0.92; }
.btn-primary { background: var(--primary-strong); color: #fff; }
.btn-accent { background: var(--accent); color: #042f2e; }
.btn-outline { border-color: var(--border); background: var(--surface); color: var(--text); }

.section { padding: 44px 0; }
.section-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.section-head h2 { margin: 0; font-size: 24px; }

.grid-3 { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; }

.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 22px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 12px;
}
.card-meta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); gap: 8px; flex-wrap: wrap; }
.pill {
  display: inline-block; padding: 3px 10px; border-radius: 999px;
  background: var(--surface-2); border: 1px solid var(--border); font-size: 12px; color: var(--text);
}
.pill-accent { background: var(--accent-soft); border-color: rgba(16, 185, 129, 0.35); color: var(--accent); }
.card h3 { margin: 0; font-size: 19px; line-height: 1.4; }
.card h3 a { color: var(--text); }
.card p { margin: 0; font-size: 14px; color: var(--muted); }
.card-footer { margin-top: auto; padding-top: 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }

.filter-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 22px; align-items: center; }
.input, .select {
  background: var(--surface); color: var(--text); border: 1px solid var(--border);
  border-radius: 10px; padding: 9px 14px; font-size: 14px; font-family: inherit;
}
.input { min-width: 240px; flex: 1; max-width: 380px; }

.disclosure-banner {
  background: var(--surface-2); border: 1px solid var(--border); border-left: 4px solid var(--accent);
  border-radius: 10px; padding: 12px 16px; font-size: 13px; color: var(--muted); margin-bottom: 24px;
}

.article-layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 32px; padding: 36px 0 60px; }
@media (max-width: 960px) { .article-layout { grid-template-columns: 1fr; } }

.article-header h1 { font-size: clamp(26px, 3.5vw, 36px); line-height: 1.35; margin: 12px 0; }
.article-body h2 { font-size: 24px; margin: 36px 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border); scroll-margin-top: 84px; }
.article-body h3 { font-size: 19px; margin: 26px 0 10px; scroll-margin-top: 84px; }
.article-body p, .article-body ul, .article-body ol { margin: 0 0 16px; font-size: 16px; }
.article-body ul, .article-body ol { padding-left: 22px; }
.article-body li { margin-bottom: 6px; }
.article-body blockquote {
  margin: 18px 0; padding: 14px 18px; background: var(--surface-2);
  border-left: 4px solid var(--primary); border-radius: 8px;
}
.article-body pre {
  background: #020617; color: #e2e8f0; padding: 16px; border-radius: 10px; overflow-x: auto; font-size: 13px;
}
.article-body code { background: var(--surface-2); padding: 2px 6px; border-radius: 5px; font-size: 0.9em; }
.article-body pre code { background: none; padding: 0; }

.table-wrap { overflow-x: auto; margin: 20px 0; border: 1px solid var(--border); border-radius: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; background: var(--surface); }
th, td { padding: 12px 14px; border-bottom: 1px solid var(--border); text-align: left; }
th { background: var(--surface-2); font-weight: 700; white-space: nowrap; }
tr:last-child td { border-bottom: none; }

.sidebar-box {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 18px; margin-bottom: 20px;
}
.sidebar-sticky { position: sticky; top: 88px; }
.toc-list { list-style: none; padding: 0; margin: 10px 0 0; font-size: 14px; }
.toc-list li { margin-bottom: 8px; }
.toc-list li.toc-h3 { padding-left: 14px; font-size: 13px; }
.toc-list a { color: var(--muted); }
.toc-list a:hover { color: var(--primary); }

.faq-item { border: 1px solid var(--border); border-radius: 10px; padding: 14px 18px; margin-bottom: 12px; background: var(--surface); }
.faq-item summary { font-weight: 700; cursor: pointer; }
.faq-item p { margin: 10px 0 0; color: var(--muted); font-size: 15px; }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; }
.stat-card strong { display: block; font-size: 28px; margin-top: 6px; color: var(--accent); }

.site-footer { border-top: 1px solid var(--border); background: var(--surface); padding: 40px 0 28px; margin-top: 40px; }
.footer-grid { display: flex; justify-content: space-between; gap: 28px; flex-wrap: wrap; }
.footer-grid > div:first-child { max-width: 480px; }
.footer-links { display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
.footer-bottom { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
`;
}

function buildJs() {
  return `(() => {
  const html = document.documentElement;
  const saved = localStorage.getItem('toollab-theme');
  if (saved === 'light' || saved === 'dark') html.setAttribute('data-theme', saved);

  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('toollab-theme', next);
    });
  }

  const bar = document.getElementById('read-progress');
  if (bar) {
    window.addEventListener('scroll', () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, Math.round((window.scrollY / docHeight) * 100)) : 0;
      bar.style.width = pct + '%';
    }, { passive: true });
  }

  const searchInput = document.getElementById('tool-search');
  const categorySelect = document.getElementById('tool-category');
  const freeOnlyCheckbox = document.getElementById('tool-free-only');
  const toolCards = Array.from(document.querySelectorAll('[data-tool-card]'));

  function applyToolFilters() {
    if (toolCards.length === 0) return;
    const q = (searchInput?.value || '').trim().toLowerCase();
    const cat = categorySelect?.value || 'all';
    const freeOnly = Boolean(freeOnlyCheckbox?.checked);

    for (const card of toolCards) {
      const name = (card.getAttribute('data-name') || '').toLowerCase();
      const category = card.getAttribute('data-category') || '';
      const hasFree = card.getAttribute('data-free') === 'true';
      const matchQ = !q || name.includes(q) || category.toLowerCase().includes(q);
      const matchCat = cat === 'all' || category === cat;
      const matchFree = !freeOnly || hasFree;
      card.style.display = matchQ && matchCat && matchFree ? '' : 'none';
    }
  }

  searchInput?.addEventListener('input', applyToolFilters);
  categorySelect?.addEventListener('change', applyToolFilters);
  freeOnlyCheckbox?.addEventListener('change', applyToolFilters);

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-go-link="true"]');
    if (!link) return;
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'affiliate_click', {
        link_url: link.getAttribute('href'),
        page_path: location.pathname,
      });
    }
  });
})();
`;
}

function buildNewsletterCardHtml(siteConfig, ui) {
  const bp = siteConfig.basePath;
  const nl = siteConfig.newsletter || {};
  const formHtml = nl.formActionUrl
    ? `<form action="${escapeHtml(nl.formActionUrl)}" method="post" target="_blank" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <input class="input" type="email" name="email" required placeholder="${escapeHtml(ui.newsletterFormPlaceholder)}" />
        <button class="btn btn-primary" type="submit">${escapeHtml(ui.newsletterSubmit)}</button>
      </form>`
    : '';

  const tgBtn = nl.telegramChannelUrl
    ? `<a class="btn btn-accent" href="${escapeHtml(nl.telegramChannelUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ui.newsletterTelegramBtn)}</a>`
    : '';

  return `<div class="card" style="margin-top:28px;background:var(--surface-2);">
  <span class="pill pill-accent">${escapeHtml(ui.navNewsletter)}</span>
  <h3>${escapeHtml(nl.title || ui.newsletterBoxTitle)}</h3>
  <p>${escapeHtml(nl.description || siteConfig.description)}</p>
  ${formHtml}
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">
    ${tgBtn}
    <a class="btn btn-outline" href="${escapeHtml(withBasePath('/newsletter/latest.html', bp))}">${escapeHtml(ui.newsletterArchiveBtn)}</a>
    <a class="btn btn-outline" href="${escapeHtml(withBasePath('/rss.xml', bp))}">${escapeHtml(ui.newsletterRssBtn)}</a>
  </div>
</div>`;
}

function buildToolCardHtml(tool, siteConfig, ui) {
  const bp = siteConfig.basePath;
  const isEn = siteConfig.locale === 'en-US';
  const twd = usdToTwd(tool.startingPriceUsd, siteConfig.usdToTwd);
  const priceText = isEn
    ? `${ui.startingAt} <strong>$${tool.startingPriceUsd}${ui.perMonth}</strong>`
    : `${ui.startingAt}<strong>$${tool.startingPriceUsd}${ui.perMonth}</strong>（約 NT$${twd}）`;

  return `<article class="card" data-tool-card="true" data-name="${escapeHtml(tool.name + ' ' + tool.tagline)}" data-category="${escapeHtml(tool.category)}" data-free="${tool.hasFreePlan ? 'true' : 'false'}">
  <div class="card-meta">
    <span class="pill">${escapeHtml(tool.category)}</span>
    <span class="pill pill-accent">★ ${Number(tool.rating).toFixed(1)}</span>
  </div>
  <h3>${escapeHtml(tool.name)}</h3>
  <p>${escapeHtml(tool.tagline)}</p>
  <div class="muted" style="font-size:13px;">
    ${priceText} · ${tool.hasFreePlan ? ui.freePlanTag : ui.paidPlanTag}
  </div>
  <div class="card-footer">
    <span class="muted" style="font-size:12px;">${escapeHtml(ui.bestFor)}: ${escapeHtml(tool.bestFor)}</span>
    <a class="btn btn-accent" href="${escapeHtml(withBasePath(`/go/${tool.slug}/`, bp))}" rel="sponsored noopener noreferrer" data-go-link="true">${escapeHtml(ui.visitOfficial)}</a>
  </div>
</article>`;
}

function buildHomePage(articles, catalog, siteConfig, ui) {
  const bp = siteConfig.basePath;
  const categories = [...new Set(catalog.map((c) => c.category))];

  const articleCards = articles
    .map(
      (a) => `<article class="card">
      <div class="card-meta">
        <span class="pill">${escapeHtml(a.meta.category)}</span>
        <span>${escapeHtml(a.meta.updatedAt)}</span>
      </div>
      <h3><a href="${escapeHtml(withBasePath(`/articles/${a.meta.slug}/`, bp))}">${escapeHtml(a.meta.title)}</a></h3>
      <p>${escapeHtml(a.meta.description)}</p>
      <div class="card-footer">
        <span class="pill pill-accent">★ ${Number(a.meta.rating || 4.7).toFixed(1)}</span>
        <a href="${escapeHtml(withBasePath(`/articles/${a.meta.slug}/`, bp))}">${escapeHtml(ui.readMore)}</a>
      </div>
    </article>`
    )
    .join('\n');

  const featuredTools = catalog.slice(0, 6).map((t) => buildToolCardHtml(t, siteConfig, ui)).join('\n');

  const bodyHtml = `
<section class="hero">
  <div class="container">
    <span class="hero-tag">${escapeHtml(siteConfig.tagline)}</span>
    <h1>${escapeHtml(siteConfig.brandName)}</h1>
    <p>${escapeHtml(siteConfig.description)}</p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="#latest-articles">${escapeHtml(ui.heroBrowse)}</a>
      <a class="btn btn-accent" href="${escapeHtml(withBasePath('/calculators/', bp))}">${escapeHtml(ui.heroCalc)}</a>
      <a class="btn btn-outline" href="${escapeHtml(withBasePath('/tools/', bp))}">${escapeHtml(ui.heroCompare(catalog.length))}</a>
    </div>
  </div>
</section>

<section id="latest-articles" class="section">
  <div class="container">
    <div class="section-head">
      <div>
        <h2>${escapeHtml(ui.latestTitle)}</h2>
        <p class="muted" style="margin:4px 0 0;">${escapeHtml(ui.latestSub(siteConfig.refreshDays))}</p>
      </div>
    </div>
    <div class="grid-2">${articleCards}</div>
  </div>
</section>

<section class="section" style="border-top: 1px solid var(--border);">
  <div class="container">
    <div class="section-head">
      <div>
        <h2>${escapeHtml(ui.dirTitle)}</h2>
      </div>
      <a href="${escapeHtml(withBasePath('/tools/', bp))}">${escapeHtml(ui.dirViewAll(catalog.length))}</a>
    </div>
    <div class="filter-bar">
      <input id="tool-search" class="input" type="search" placeholder="${escapeHtml(ui.searchPlaceholder)}" />
      <select id="tool-category" class="select">
        <option value="all">${escapeHtml(ui.allCategories)}</option>
        ${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
      </select>
      <label style="font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input id="tool-free-only" type="checkbox" /> ${escapeHtml(ui.freeOnly)}
      </label>
    </div>
    <div class="grid-3">${featuredTools}</div>
    ${buildNewsletterCardHtml(siteConfig, ui)}
  </div>
</section>`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteConfig.brandName,
      alternateName: siteConfig.brandEnglish,
      url: absoluteUrl('/', siteConfig),
      description: siteConfig.description,
      inLanguage: siteConfig.locale || 'zh-TW',
    },
  ];

  return buildLayout({
    title: `${siteConfig.brandName}｜${siteConfig.tagline}`,
    description: siteConfig.description,
    canonicalPath: '/',
    ogImageFile: 'default.svg',
    jsonLd,
    bodyHtml,
    siteConfig,
    ui,
  });
}

function buildArticlePage(article, allArticles, catalogMap, ogManifest, carouselManifest, siteConfig, ui) {
  const bp = siteConfig.basePath;
  const isEn = siteConfig.locale === 'en-US';
  const { meta, body } = article;
  const { html: contentHtml, toc } = renderMarkdown(body, { basePath: bp });
  const ogFile = ogManifest[meta.slug] || ogManifest.default || 'default.svg';
  const cKit = carouselManifest[meta.slug];

  const articleTools = (meta.tools || []).map((slug) => catalogMap.get(slug)).filter(Boolean);
  const relatedArticles = allArticles.filter((a) => a.meta.slug !== meta.slug).slice(0, 3);

  const faqHtml =
    Array.isArray(meta.faq) && meta.faq.length > 0
      ? `<section class="section" style="padding:24px 0 0;">
          <h2>${escapeHtml(ui.faqTitle)}</h2>
          ${meta.faq
            .map(
              (f) => `<details class="faq-item">
              <summary>${escapeHtml(f.q)}</summary>
              <p>${escapeHtml(f.a)}</p>
            </details>`
            )
            .join('')}
        </section>`
      : '';

  const tocHtml =
    toc.length > 0
      ? `<div class="sidebar-box">
          <strong>${escapeHtml(ui.tocTitle)}</strong>
          <ul class="toc-list">
            ${toc.map((t) => `<li class="toc-h${t.level}"><a href="#${escapeHtml(t.id)}">${escapeHtml(t.text)}</a></li>`).join('')}
          </ul>
        </div>`
      : '';

  const toolsSidebarHtml =
    articleTools.length > 0
      ? `<div class="sidebar-box">
          <strong>${escapeHtml(ui.testedToolsTitle)}</strong>
          <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px;">
            ${articleTools
              .map((t) => {
                const twd = usdToTwd(t.startingPriceUsd, siteConfig.usdToTwd);
                const priceLine = isEn
                  ? `$${t.startingPriceUsd}/mo`
                  : `$${t.startingPriceUsd}/月起（約 NT$${twd}）`;
                return `<div style="border-top:1px solid var(--border);padding-top:10px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <strong>${escapeHtml(t.name)}</strong>
                    <span class="pill pill-accent">★ ${Number(t.rating).toFixed(1)}</span>
                  </div>
                  <div class="muted" style="font-size:12px;margin:4px 0 8px;">${priceLine}</div>
                  <a class="btn btn-accent" style="width:100%;padding:7px 12px;font-size:13px;" href="${escapeHtml(withBasePath(`/go/${t.slug}/`, bp))}" rel="sponsored noopener noreferrer" data-go-link="true">${escapeHtml(ui.goOfficialBtn(t.name))}</a>
                </div>`;
              })
              .join('')}
          </div>
        </div>`
      : '';

  const carouselBoxHtml = cKit
    ? `<div class="sidebar-box">
        <strong>${escapeHtml(ui.carouselBoxTitle)}</strong>
        <p class="muted" style="font-size:13px;margin:6px 0 10px;">${escapeHtml(ui.carouselBoxDesc)}</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <a class="btn btn-outline" style="font-size:13px;padding:7px 12px;" href="${escapeHtml(withBasePath(`/carousel/${meta.slug}/${cKit.slides[0]}`, bp))}" target="_blank">${escapeHtml(ui.carouselViewSlide)}</a>
          <a class="btn btn-outline" style="font-size:13px;padding:7px 12px;" href="${escapeHtml(withBasePath(`/shorts/${cKit.srt}`, bp))}" download>${escapeHtml(ui.shortsDownload)}</a>
        </div>
      </div>`
    : '';

  const relatedHtml =
    relatedArticles.length > 0
      ? `<section class="section" style="border-top:1px solid var(--border);">
          <h2>${escapeHtml(ui.relatedTitle)}</h2>
          <div class="grid-3">
            ${relatedArticles
              .map(
                (r) => `<article class="card">
                <div class="card-meta"><span class="pill">${escapeHtml(r.meta.category)}</span><span>${escapeHtml(r.meta.updatedAt)}</span></div>
                <h3><a href="${escapeHtml(withBasePath(`/articles/${r.meta.slug}/`, bp))}">${escapeHtml(r.meta.title)}</a></h3>
              </article>`
              )
              .join('')}
          </div>
        </section>`
      : '';

  const bodyHtml = `
<div class="container">
  <div class="article-layout">
    <article class="article-main">
      <div class="article-header">
        <div class="card-meta" style="justify-content:flex-start;">
          <a href="${escapeHtml(withBasePath('/', bp))}">${escapeHtml(ui.homeCrumb)}</a> /
          <span class="pill">${escapeHtml(meta.category)}</span>
          <span>${escapeHtml(ui.publishedLabel)}: ${escapeHtml(meta.publishedAt)}</span>
          <span>${escapeHtml(ui.updatedLabel)}: ${escapeHtml(meta.updatedAt)}</span>
        </div>
        <h1>${escapeHtml(meta.title)}</h1>
        <p class="muted">${escapeHtml(meta.description)}</p>
      </div>

      <div class="disclosure-banner">${escapeHtml(siteConfig.disclosureShort)}</div>

      <div class="article-body">${contentHtml}</div>

      ${faqHtml}
      ${buildNewsletterCardHtml(siteConfig, ui)}
      ${relatedHtml}
    </article>

    <aside>
      <div class="sidebar-sticky">
        ${toolsSidebarHtml}
        ${tocHtml}
        ${carouselBoxHtml}
      </div>
    </aside>
  </div>
</div>`;

  const articleUrl = absoluteUrl(`/articles/${meta.slug}/`, siteConfig);
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: meta.title,
      description: meta.description,
      datePublished: meta.publishedAt,
      dateModified: meta.updatedAt,
      inLanguage: siteConfig.locale || 'zh-TW',
      mainEntityOfPage: articleUrl,
      image: absoluteUrl(`/og/${ogFile}`, siteConfig),
      author: { '@type': 'Organization', name: siteConfig.editorialTeam || siteConfig.brandName },
      publisher: { '@type': 'Organization', name: siteConfig.brandName },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: ui.homeCrumb, item: absoluteUrl('/', siteConfig) },
        { '@type': 'ListItem', position: 2, name: meta.title, item: articleUrl },
      ],
    },
  ];

  if (Array.isArray(meta.faq) && meta.faq.length > 0) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: meta.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  return buildLayout({
    title: `${meta.title}｜${siteConfig.brandName}`,
    description: meta.description,
    canonicalPath: `/articles/${meta.slug}/`,
    ogImageFile: ogFile,
    ogType: 'article',
    jsonLd,
    bodyHtml,
    siteConfig,
    ui,
    isArticle: true,
  });
}

function buildToolsPage(catalog, siteConfig, ui) {
  const categories = [...new Set(catalog.map((c) => c.category))];
  const cards = catalog.map((t) => buildToolCardHtml(t, siteConfig, ui)).join('\n');

  const bodyHtml = `
<section class="section">
  <div class="container">
    <h1 style="margin-top:0;">${escapeHtml(ui.dirTitle)}</h1>
    <p class="muted">${escapeHtml(siteConfig.description)}</p>
    <div class="disclosure-banner">${escapeHtml(siteConfig.disclosureShort)}</div>
    <div class="filter-bar">
      <input id="tool-search" class="input" type="search" placeholder="${escapeHtml(ui.searchPlaceholder)}" />
      <select id="tool-category" class="select">
        <option value="all">${escapeHtml(ui.allCategories)}</option>
        ${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
      </select>
      <label style="font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input id="tool-free-only" type="checkbox" /> ${escapeHtml(ui.freeOnly)}
      </label>
    </div>
    <div class="grid-3">${cards}</div>
  </div>
</section>`;

  return buildLayout({
    title: `${ui.navTools}｜${siteConfig.brandName}`,
    description: siteConfig.description,
    canonicalPath: '/tools/',
    bodyHtml,
    siteConfig,
    ui,
  });
}

function buildGoRedirectPage(tool, siteConfig, ui) {
  const targetUrl = tool.affiliateUrl || tool.officialUrl;
  const gaId = siteConfig.ga4MeasurementId;
  const gaSnippet = gaId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(gaId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${escapeHtml(gaId)}');</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(ui.htmlLang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(ui.redirectHeading(tool.name))}</title>
  ${gaSnippet}
  <meta http-equiv="refresh" content="1;url=${escapeHtml(targetUrl)}" />
  <style>
    body{font-family:"Noto Sans TC",sans-serif;background:#0b1120;color:#f1f5f9;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px;text-align:center;}
    .box{max-width:460px;background:#111827;border:1px solid #334155;border-radius:16px;padding:28px;}
    a{color:#34d399;font-weight:700;}
  </style>
</head>
<body>
  <div class="box">
    <h2>${escapeHtml(ui.redirectHeading(tool.name))}</h2>
    <p style="color:#94a3b8;font-size:14px;"><a id="dest-link" href="${escapeHtml(targetUrl)}" rel="sponsored noopener noreferrer">${escapeHtml(ui.redirectFallback(tool.name))}</a></p>
  </div>
  <script>
    (function(){
      var base = ${JSON.stringify(targetUrl)};
      try {
        var incoming = new URLSearchParams(window.location.search);
        var dest = new URL(base);
        ['utm_source','utm_medium','utm_campaign','src'].forEach(function(k){
          if(incoming.has(k) && !dest.searchParams.has(k)) dest.searchParams.set(k, incoming.get(k));
        });
        var finalUrl = dest.toString();
        document.getElementById('dest-link').href = finalUrl;
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'affiliate_redirect', { tool_slug: ${JSON.stringify(tool.slug)}, destination: finalUrl });
        }
        window.location.replace(finalUrl);
      } catch (e) {
        window.location.replace(base);
      }
    })();
  </script>
</body>
</html>`;
}

function buildStaticPage({ title, heading, contentHtml, canonicalPath, siteConfig, ui }) {
  const bodyHtml = `
<section class="section">
  <div class="container" style="max-width:820px;">
    <div class="card" style="padding:32px;">
      <h1 style="margin-top:0;">${escapeHtml(heading)}</h1>
      ${contentHtml}
    </div>
  </div>
</section>`;
  return buildLayout({
    title: `${title}｜${siteConfig.brandName}`,
    description: `${title} - ${siteConfig.brandName}`,
    canonicalPath,
    bodyHtml,
    siteConfig,
    ui,
  });
}

function buildStatusPage(articles, catalog, socialQueue, qaReport, state, siteConfig, ui) {
  const today = todayIsoDate();
  const refreshDays = Number(siteConfig.refreshDays || 30);
  const freshCount = articles.filter((a) => daysBetween(a.meta.updatedAt || a.meta.publishedAt, today) < refreshDays).length;
  const freshPct = articles.length > 0 ? Math.round((freshCount / articles.length) * 100) : 100;
  const activeAffCount = catalog.filter((c) => Boolean(c.affiliateUrl)).length;
  const publishedSocial = socialQueue.filter((s) => s.status === 'published');
  const pendingSocial = socialQueue.filter((s) => s.status === 'pending');

  const bodyHtml = `
<section class="section">
  <div class="container">
    <h1 style="margin-top:0;">${escapeHtml(ui.statusTitle)}</h1>
    <p class="muted">${escapeHtml(ui.statusSub(today))}</p>

    <div class="stat-grid">
      <div class="stat-card"><span class="muted">${escapeHtml(ui.statArticles)}</span><strong>${articles.length}</strong></div>
      <div class="stat-card"><span class="muted">${escapeHtml(ui.statFreshness(refreshDays))}</span><strong>${freshPct}%</strong></div>
      <div class="stat-card"><span class="muted">${escapeHtml(ui.statAffiliate)}</span><strong>${activeAffCount} / ${catalog.length}</strong></div>
      <div class="stat-card"><span class="muted">${escapeHtml(ui.statSocial)}</span><strong>${pendingSocial.length} / ${publishedSocial.length}</strong></div>
    </div>

    <div class="card">
      <h3>${escapeHtml(ui.qaStatusLabel)}: ${qaReport?.passed !== false ? escapeHtml(ui.qaPassed) : escapeHtml(ui.qaFailed)}</h3>
      <p class="muted">${escapeHtml(ui.lastRunLabel)}: ${escapeHtml(state?.lastPipelineRun || ui.notRunYet)}</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>${escapeHtml(ui.tableTool)}</th><th>Slug</th><th>${escapeHtml(ui.tableNetwork)}</th><th>${escapeHtml(ui.tableLinkStatus)}</th><th>${escapeHtml(ui.tableVerified)}</th></tr></thead>
          <tbody>
            ${catalog
              .map(
                (t) => `<tr>
                <td>${escapeHtml(t.name)}</td>
                <td><code>/go/${escapeHtml(t.slug)}</code></td>
                <td>${escapeHtml(t.affiliateNetwork)}</td>
                <td>${t.affiliateUrl ? `<span class="pill pill-accent">${escapeHtml(ui.statusActive)}</span>` : `<span class="pill">${escapeHtml(ui.statusPlaceholder)}</span>`}</td>
                <td>${escapeHtml(t.lastVerifiedAt)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>`;

  return buildLayout({
    title: `${ui.statusTitle}｜${siteConfig.brandName}`,
    description: ui.statusSub(today),
    canonicalPath: '/status/',
    bodyHtml,
    siteConfig,
    ui,
  });
}

function buildMatrixPage(siteSummaries, primarySiteConfig, primaryUi) {
  const rows = siteSummaries
    .map(
      (s) => `<tr>
      <td><strong>${escapeHtml(s.brandName)}</strong><br/><small class="muted">${escapeHtml(s.siteId)}</small></td>
      <td>${escapeHtml(s.locale)}</td>
      <td>${escapeHtml(s.niche)}</td>
      <td>${s.articleCount}</td>
      <td>${s.pendingTopics}</td>
      <td>${s.activeAffiliateLinks} / ${s.catalogCount}</td>
      <td><a class="btn btn-outline" style="padding:5px 12px;font-size:13px;" href="${escapeHtml(s.homeUrl)}">開啟站台 →</a></td>
    </tr>`
    )
    .join('\n');

  const totalArticles = siteSummaries.reduce((n, s) => n + s.articleCount, 0);
  const totalTools = siteSummaries.reduce((n, s) => n + s.catalogCount, 0);
  const totalPending = siteSummaries.reduce((n, s) => n + s.pendingTopics, 0);

  const bodyHtml = `
<section class="section">
  <div class="container">
    <span class="hero-tag">Multi-Site Matrix Control Center</span>
    <h1 style="margin:12px 0 8px;">全自動聯盟行銷多站矩陣總覽</h1>
    <p class="muted">一機管理 ${siteSummaries.length} 個垂直聯盟站點（繁中 AI/SaaS ＋ 英文全球 SaaS ＋ 台灣日韓泰旅遊），各自保持領域權威、統一雲端自動產文與分流。</p>

    <div class="stat-grid" style="margin-top:20px;">
      <div class="stat-card"><span class="muted">運行中站點數</span><strong>${siteSummaries.length} 站</strong></div>
      <div class="stat-card"><span class="muted">矩陣總文章數</span><strong>${totalArticles} 篇</strong></div>
      <div class="stat-card"><span class="muted">待寫 SEO 主題庫</span><strong>${totalPending} 筆</strong></div>
      <div class="stat-card"><span class="muted">收錄聯盟品牌數</span><strong>${totalTools} 個</strong></div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>站點品牌</th><th>語系</th><th>利基領域</th><th>已發文章</th><th>待寫佇列</th><th>聯盟連結</th><th>入口</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </div>
</section>`;

  return buildLayout({
    title: `多站矩陣總覽｜${primarySiteConfig.brandName}`,
    description: '全自動聯盟行銷多站矩陣營運總覽',
    canonicalPath: '/matrix/',
    bodyHtml,
    siteConfig: primarySiteConfig,
    ui: primaryUi,
  });
}

function buildSitemap(articles, siteConfig) {
  const urls = [
    { loc: absoluteUrl('/', siteConfig), lastmod: todayIsoDate() },
    { loc: absoluteUrl('/tools/', siteConfig), lastmod: todayIsoDate() },
    { loc: absoluteUrl('/calculators/', siteConfig), lastmod: todayIsoDate() },
    { loc: absoluteUrl('/newsletter/', siteConfig), lastmod: todayIsoDate() },
    { loc: absoluteUrl('/disclosure/', siteConfig), lastmod: todayIsoDate() },
    { loc: absoluteUrl('/privacy/', siteConfig), lastmod: todayIsoDate() },
    ...articles.map((a) => ({
      loc: absoluteUrl(`/articles/${a.meta.slug}/`, siteConfig),
      lastmod: a.meta.updatedAt || a.meta.publishedAt,
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${escapeXml(u.lastmod)}</lastmod>
  </url>`
  )
  .join('\n')}
</urlset>
`;
}

function buildRss(articles, siteConfig) {
  const items = articles
    .slice(0, 20)
    .map((a) => {
      const link = absoluteUrl(`/articles/${a.meta.slug}/`, siteConfig);
      return `    <item>
      <title>${escapeXml(a.meta.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid>${escapeXml(link)}</guid>
      <pubDate>${new Date(a.meta.publishedAt).toUTCString()}</pubDate>
      <description>${escapeXml(a.meta.description)}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(siteConfig.brandName)}</title>
    <link>${escapeXml(absoluteUrl('/', siteConfig))}</link>
    <description>${escapeXml(siteConfig.description)}</description>
    <language>${escapeXml(siteConfig.locale || 'zh-TW')}</language>
${items}
  </channel>
</rss>
`;
}

function buildLlmsTxt(articles, catalog, siteConfig) {
  return `# ${siteConfig.brandName} (${siteConfig.brandEnglish})

> ${siteConfig.description}

## Guides
${articles.map((a) => `- [${a.meta.title}](${absoluteUrl(`/articles/${a.meta.slug}/`, siteConfig)}): ${a.meta.description}`).join('\n')}

## Directory (${catalog.length})
${catalog.map((t) => `- ${t.name} (${t.category}): $${t.startingPriceUsd}/mo — ${t.tagline}`).join('\n')}
`;
}

export async function buildOneSite(siteId, { standalone = false, outDir = '' } = {}) {
  const { siteConfig, paths } = getSiteContext(siteId, { standalone, outDir });
  const ui = getUiStrings(siteConfig.locale);
  const catalog = readJson(paths.catalog, []);
  const topics = readJson(paths.topics, []);
  const socialQueue = readJson(paths.socialQueue, []);
  const qaReport = readJson(paths.qaReport, null);
  const state = readJson(paths.state, {});
  const ogManifest = readJson(paths.ogManifest, {});
  const carouselManifest = readJson(paths.carouselManifest, {});
  const articles = loadSiteArticles(paths.articlesDir);
  const catalogMap = new Map(catalog.map((t) => [t.slug, t]));

  ensureDir(paths.distDir);

  writeText(path.join(paths.distDir, 'assets', 'style.css'), buildCss());
  writeText(path.join(paths.distDir, 'assets', 'app.js'), buildJs());

  writeText(path.join(paths.distDir, 'index.html'), buildHomePage(articles, catalog, siteConfig, ui));
  writeText(path.join(paths.distDir, 'tools', 'index.html'), buildToolsPage(catalog, siteConfig, ui));

  // Interactive Calculators Page
  writeText(
    path.join(paths.distDir, 'calculators', 'index.html'),
    buildLayout({
      title: `${ui.navCalculators}｜${siteConfig.brandName}`,
      description: siteConfig.description,
      canonicalPath: '/calculators/',
      bodyHtml: buildCalculatorsPageContent({ siteConfig, catalog }),
      siteConfig,
      ui,
    })
  );

  // Newsletter Landing Page
  writeText(
    path.join(paths.distDir, 'newsletter', 'index.html'),
    buildLayout({
      title: `${ui.navNewsletter}｜${siteConfig.brandName}`,
      description: siteConfig.newsletter?.description || siteConfig.description,
      canonicalPath: '/newsletter/',
      bodyHtml: `<section class="section"><div class="container" style="max-width:760px;">${buildNewsletterCardHtml(siteConfig, ui)}</div></section>`,
      siteConfig,
      ui,
    })
  );

  // Articles
  for (const art of articles) {
    const html = buildArticlePage(art, articles, catalogMap, ogManifest, carouselManifest, siteConfig, ui);
    writeText(path.join(paths.distDir, 'articles', art.meta.slug, 'index.html'), html);
  }

  // Affiliate /go/<slug>
  const redirectLines = [];
  for (const tool of catalog) {
    writeText(path.join(paths.distDir, 'go', tool.slug, 'index.html'), buildGoRedirectPage(tool, siteConfig, ui));
    const target = tool.affiliateUrl || tool.officialUrl;
    const prefix = siteConfig.isPrimary || standalone ? '' : `/sites/${siteId}`;
    redirectLines.push(`${prefix}/go/${tool.slug} ${target} 302`);
    redirectLines.push(`${prefix}/go/${tool.slug}/ ${target} 302`);
  }
  writeText(path.join(paths.distDir, '_redirects'), redirectLines.join('\n') + '\n');

  // Disclosure, Privacy, Status, 404
  writeText(
    path.join(paths.distDir, 'disclosure', 'index.html'),
    buildStaticPage({
      title: ui.disclosureTitle,
      heading: ui.disclosureTitle,
      contentHtml: `<p>${escapeHtml(siteConfig.disclosureFull)}</p>`,
      canonicalPath: '/disclosure/',
      siteConfig,
      ui,
    })
  );

  writeText(
    path.join(paths.distDir, 'privacy', 'index.html'),
    buildStaticPage({
      title: ui.privacyTitle,
      heading: ui.privacyTitle,
      contentHtml:
        siteConfig.locale === 'en-US'
          ? `<p>${escapeHtml(siteConfig.brandName)} is a static site that does not require user accounts or collect sensitive personal data. Affiliate partners may use standard referral cookies when you click outbound /go/ links.</p>`
          : `<p>${escapeHtml(siteConfig.brandName)} 為純靜態內容網站，不要求註冊會員，亦不主動蒐集敏感個資。點擊外部合作連結時，合作平台可能使用標準 Cookie 紀錄推薦來源。</p>`,
      canonicalPath: '/privacy/',
      siteConfig,
      ui,
    })
  );

  writeText(
    path.join(paths.distDir, 'status', 'index.html'),
    buildStatusPage(articles, catalog, socialQueue, qaReport, state, siteConfig, ui)
  );

  writeText(
    path.join(paths.distDir, '404.html'),
    buildStaticPage({
      title: '404',
      heading: ui.notFoundTitle,
      contentHtml: `<p>${escapeHtml(ui.notFoundDesc)}</p>`,
      canonicalPath: '/404.html',
      siteConfig,
      ui,
    })
  );

  writeText(path.join(paths.distDir, 'sitemap.xml'), buildSitemap(articles, siteConfig));
  writeText(path.join(paths.distDir, 'rss.xml'), buildRss(articles, siteConfig));
  writeText(path.join(paths.distDir, 'llms.txt'), buildLlmsTxt(articles, catalog, siteConfig));
  writeText(
    path.join(paths.distDir, 'robots.txt'),
    `User-agent: *\nAllow: /\nDisallow: /go/\nSitemap: ${absoluteUrl('/sitemap.xml', siteConfig)}\n`
  );
  writeText(
    path.join(paths.distDir, '_headers'),
    `/go/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n/assets/*\n  Cache-Control: public, max-age=604800\n`
  );

  console.log(`[build:${siteId}] Built -> ${paths.distDir} (${articles.length} articles, ${catalog.length} /go/ links)`);

  return {
    siteId,
    brandName: siteConfig.brandName,
    locale: siteConfig.locale,
    niche: siteConfig.niche,
    articleCount: articles.length,
    catalogCount: catalog.length,
    pendingTopics: topics.filter((t) => t.status === 'pending').length,
    activeAffiliateLinks: catalog.filter((c) => Boolean(c.affiliateUrl)).length,
    homeUrl: withBasePath('/', siteConfig.basePath),
    redirectLines,
  };
}

export async function runBuildSite({ siteIds, standalone = false, outDir = '' } = {}) {
  const targets = siteIds || resolveTargetSites();
  const summaries = [];
  for (const siteId of targets) {
    summaries.push(await buildOneSite(siteId, { standalone, outDir }));
  }

  // If building matrix on primary site (not standalone), write /matrix/ & combined root _redirects
  const matrix = loadMatrixConfig();
  if (!standalone && targets.includes(matrix.primarySite)) {
    const primaryCtx = getSiteContext(matrix.primarySite);
    const primaryUi = getUiStrings(primaryCtx.siteConfig.locale);
    writeText(
      path.join(GLOBAL_PATHS.distDir, 'matrix', 'index.html'),
      buildMatrixPage(summaries, primaryCtx.siteConfig, primaryUi)
    );
    const allRedirects = summaries.flatMap((s) => s.redirectLines);
    writeText(path.join(GLOBAL_PATHS.distDir, '_redirects'), allRedirects.join('\n') + '\n');
  }

  return summaries;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('build-site.mjs')) {
  const flags = parseCliFlags();
  runBuildSite({
    siteIds: resolveTargetSites(flags),
    standalone: Boolean(flags.standalone),
    outDir: flags.out || '',
  }).catch((err) => {
    console.error('[build] Error:', err);
    process.exit(1);
  });
}
