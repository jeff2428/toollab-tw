import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..', '..');

export const GLOBAL_PATHS = {
  matrixConfig: path.join(ROOT_DIR, 'config', 'matrix.json'),
  sourcesConfig: path.join(ROOT_DIR, 'config', 'sources.json'),
  sitesDir: path.join(ROOT_DIR, 'sites'),
  distDir: path.join(ROOT_DIR, 'dist'),
  reportsDir: path.join(ROOT_DIR, 'reports'),
  qaSummary: path.join(ROOT_DIR, 'reports', 'qa-summary.json'),
  healthSummary: path.join(ROOT_DIR, 'reports', 'health-summary.json'),
  alertIssue: path.join(ROOT_DIR, 'reports', 'alert-issue.md'),
};

export function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

export function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

export function writeJson(filePath, data) {
  writeText(filePath, JSON.stringify(data, null, 2) + '\n');
}

export function loadMatrixConfig() {
  return readJson(GLOBAL_PATHS.matrixConfig, { primarySite: 'toollab-tw', sites: ['toollab-tw'] });
}

export function resolveTargetSites(flags = {}) {
  const matrix = loadMatrixConfig();
  if (flags.site && typeof flags.site === 'string') {
    if (!matrix.sites.includes(flags.site)) {
      throw new Error(`Unknown site "${flags.site}". Available: ${matrix.sites.join(', ')}`);
    }
    return [flags.site];
  }
  return matrix.sites;
}

export function getSiteEnv(siteId, key) {
  const prefix = String(siteId || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return process.env[`${prefix}_${key}`] || process.env[key] || '';
}

export function getSitePaths(siteId, { standalone = false, outDir = '' } = {}) {
  const matrix = loadMatrixConfig();
  const isPrimary = siteId === matrix.primarySite;
  const siteRoot = path.join(GLOBAL_PATHS.sitesDir, siteId);

  let distDir;
  if (outDir) {
    distDir = path.isAbsolute(outDir) ? outDir : path.join(ROOT_DIR, outDir);
  } else if (standalone || isPrimary) {
    distDir = GLOBAL_PATHS.distDir;
  } else {
    distDir = path.join(GLOBAL_PATHS.distDir, 'sites', siteId);
  }

  return {
    siteId,
    isPrimary,
    siteRoot,
    siteConfig: path.join(siteRoot, 'site.json'),
    catalog: path.join(siteRoot, 'data', 'catalog.json'),
    topics: path.join(siteRoot, 'data', 'topics.json'),
    socialQueue: path.join(siteRoot, 'data', 'social-queue.json'),
    state: path.join(siteRoot, 'data', 'state.json'),
    qaReport: path.join(siteRoot, 'data', 'qa-report.json'),
    healthReport: path.join(siteRoot, 'data', 'health-report.json'),
    articlesDir: path.join(siteRoot, 'content', 'articles'),
    distDir,
    ogDir: path.join(distDir, 'og'),
    ogManifest: path.join(distDir, 'og', 'manifest.json'),
    carouselDir: path.join(distDir, 'carousel'),
    carouselManifest: path.join(distDir, 'carousel', 'manifest.json'),
    shortsDir: path.join(distDir, 'shorts'),
  };
}

export function getSiteContext(siteId, { standalone = false, outDir = '' } = {}) {
  loadDotEnv();
  const matrix = loadMatrixConfig();
  const isPrimary = siteId === matrix.primarySite;
  const paths = getSitePaths(siteId, { standalone, outDir });
  const cfg = readJson(paths.siteConfig, {});

  const globalSiteUrl = (process.env.SITE_URL || cfg.defaultSiteUrl || 'https://toollab-tw.pages.dev').replace(/\/+$/, '');
  const siteSpecificUrl = getSiteEnv(siteId, 'SITE_URL');
  const siteUrl = (siteSpecificUrl || globalSiteUrl).replace(/\/+$/, '');

  const globalBase = (process.env.SITE_BASE_PATH || '').replace(/^\/+|\/+$/g, '');
  let basePath = '';
  if (standalone) {
    const specificBase = getSiteEnv(siteId, 'SITE_BASE_PATH');
    basePath = specificBase && specificBase !== '/' ? '/' + specificBase.replace(/^\/+|\/+$/g, '') : '';
  } else if (isPrimary) {
    basePath = globalBase ? `/${globalBase}` : '';
  } else {
    basePath = globalBase ? `/${globalBase}/sites/${siteId}` : `/sites/${siteId}`;
  }

  const siteConfig = {
    ...cfg,
    id: siteId,
    isPrimary,
    standalone: Boolean(standalone),
    siteUrl,
    basePath,
    ga4MeasurementId: getSiteEnv(siteId, 'GA4_MEASUREMENT_ID') || cfg.analytics?.ga4MeasurementId || '',
    cloudflareToken: getSiteEnv(siteId, 'CF_ANALYTICS_TOKEN') || cfg.analytics?.cloudflareToken || '',
  };

  return { siteId, isPrimary, siteConfig, paths };
}

function unquoteYaml(val) {
  const s = val.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: raw };
  }
  const yamlBlock = match[1];
  const body = match[2];
  const lines = yamlBlock.split(/\r?\n/);
  const data = {};
  let currentKey = null;
  let currentFaqItem = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const topMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (topMatch && !line.startsWith(' ')) {
      currentFaqItem = null;
      const key = topMatch[1];
      const rest = topMatch[2].trim();
      currentKey = key;
      if (rest === '') {
        data[key] = [];
      } else if (rest.startsWith('[') && rest.endsWith(']')) {
        const inner = rest.slice(1, -1).trim();
        data[key] = inner ? inner.split(',').map((x) => unquoteYaml(x)) : [];
      } else {
        data[key] = unquoteYaml(rest);
      }
      continue;
    }

    if (currentKey && Array.isArray(data[currentKey])) {
      const faqStart = line.match(/^\s{2}-\s+q:\s*(.+)$/);
      if (faqStart) {
        currentFaqItem = { q: unquoteYaml(faqStart[1]), a: '' };
        data[currentKey].push(currentFaqItem);
        continue;
      }
      const faqAnswer = line.match(/^\s{4}a:\s*(.+)$/);
      if (faqAnswer && currentFaqItem) {
        currentFaqItem.a = unquoteYaml(faqAnswer[1]);
        continue;
      }
      const listItem = line.match(/^\s{2}-\s+(.+)$/);
      if (listItem) {
        data[currentKey].push(unquoteYaml(listItem[1]));
      }
    }
  }

  return { data, body };
}

function quoteYaml(val) {
  const s = String(val ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '\\"');
  return `"${s}"`;
}

export function stringifyFrontmatter(meta, body) {
  const lines = ['---'];
  lines.push(`title: ${quoteYaml(meta.title)}`);
  lines.push(`slug: ${quoteYaml(meta.slug)}`);
  lines.push(`description: ${quoteYaml(meta.description)}`);
  lines.push(`publishedAt: ${quoteYaml(meta.publishedAt)}`);
  lines.push(`updatedAt: ${quoteYaml(meta.updatedAt)}`);
  lines.push(`category: ${quoteYaml(meta.category)}`);
  lines.push(`type: ${quoteYaml(meta.type || 'review')}`);

  lines.push('tools:');
  for (const t of meta.tools || []) {
    lines.push(`  - ${t}`);
  }

  lines.push('tags:');
  for (const tag of meta.tags || []) {
    lines.push(`  - ${tag}`);
  }

  lines.push(`rating: ${Number(meta.rating || 4.7)}`);

  lines.push('faq:');
  for (const item of meta.faq || []) {
    lines.push(`  - q: ${quoteYaml(item.q)}`);
    lines.push(`    a: ${quoteYaml(item.a)}`);
  }

  lines.push('---', '');
  return lines.join('\n') + body.trimStart();
}

export function loadSiteArticles(articlesDir) {
  if (!fs.existsSync(articlesDir)) return [];
  const files = fs
    .readdirSync(articlesDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const articles = [];
  for (const file of files) {
    const filePath = path.join(articlesDir, file);
    const raw = readText(filePath);
    const { data, body } = parseFrontmatter(raw);
    articles.push({
      file,
      filePath,
      meta: data,
      body,
    });
  }

  articles.sort((a, b) => {
    const da = String(a.meta.updatedAt || a.meta.publishedAt || '');
    const db = String(b.meta.updatedAt || b.meta.publishedAt || '');
    return db.localeCompare(da);
  });

  return articles;
}

export function withBasePath(targetPath, basePath = '') {
  const cleanTarget = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  if (!basePath) return cleanTarget;
  if (cleanTarget === '/') return `${basePath}/`;
  return `${basePath}${cleanTarget}`;
}

export function absoluteUrl(targetPath, siteConfig) {
  const rel = withBasePath(targetPath, siteConfig.basePath);
  const origin = new URL(siteConfig.siteUrl).origin;
  return `${origin}${rel}`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function countEffectiveChars(markdownText) {
  const stripped = String(markdownText || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/[^\s)]+/g, ' ')
    .replace(/[#>*`|_\[\]()\-]/g, ' ')
    .replace(/\s+/g, '');
  return stripped.length;
}

export function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function parseCliFlags(argv = process.argv.slice(2)) {
  const flags = { _: [] };
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      flags._.push(arg);
    }
  }
  return flags;
}

export function todayIsoDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export function nowIsoTaipei() {
  const d = new Date();
  const tzOffsetMs = 8 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + tzOffsetMs);
  return local.toISOString().replace('Z', '+08:00');
}

export function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA);
  const b = new Date(dateStrB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 9999;
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function usdToTwd(usd, rate = 32.5) {
  return Math.round(Number(usd || 0) * Number(rate || 32.5));
}
