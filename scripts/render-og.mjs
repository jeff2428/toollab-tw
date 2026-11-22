import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDir,
  escapeXml,
  getSiteContext,
  loadSiteArticles,
  parseCliFlags,
  resolveTargetSites,
  writeJson,
  writeText,
} from './lib/utils.mjs';

function hasRsvgConvert() {
  try {
    execFileSync('rsvg-convert', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function wrapTextSmart(text, maxUnitsPerLine = 22, maxLines = 3) {
  const str = String(text || '').trim();
  // Detect mostly ASCII (English) vs CJK
  const asciiRatio = (str.match(/[\x00-\x7F]/g) || []).length / Math.max(1, str.length);
  if (asciiRatio > 0.75) {
    const words = str.split(/\s+/);
    const lines = [];
    let current = '';
    const maxChars = Math.round(maxUnitsPerLine * 1.45);
    for (const w of words) {
      if ((current + ' ' + w).trim().length > maxChars && current) {
        lines.push(current.trim());
        current = w;
      } else {
        current = (current + ' ' + w).trim();
      }
    }
    if (current) lines.push(current);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = kept[maxLines - 1].slice(0, Math.max(4, kept[maxLines - 1].length - 2)) + '…';
      return kept;
    }
    return lines;
  }

  const lines = [];
  let current = '';
  let units = 0;
  for (const ch of str) {
    const w = ch.charCodeAt(0) < 128 ? 0.58 : 1.0;
    if (units + w > maxUnitsPerLine && current.length > 0) {
      lines.push(current.trim());
      current = ch;
      units = w;
    } else {
      current += ch;
      units += w;
    }
  }
  if (current.trim()) lines.push(current.trim());
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, Math.max(4, kept[maxLines - 1].length - 2)) + '…';
    return kept;
  }
  return lines;
}

function getPalette(niche) {
  if (niche === 'travel-tw') {
    return { c1: '#0C1B2A', c2: '#064E3B', c3: '#0F172A', accent: '#34D399', accent2: '#38BDF8' };
  }
  return { c1: '#0B1120', c2: '#1E1B4B', c3: '#0F172A', accent: '#34D399', accent2: '#818CF8' };
}

function buildOgSvg({ siteConfig, category, title, subtitle }) {
  const palette = getPalette(siteConfig.niche);
  const lines = wrapTextSmart(title, 22, 3);
  const startY = lines.length === 1 ? 290 : lines.length === 2 ? 255 : 225;
  const lineHeight = 68;
  const fontFamily =
    siteConfig.locale === 'en-US'
      ? 'Inter, Noto Sans, system-ui, sans-serif'
      : 'Noto Sans CJK TC, Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif';

  const titleSvg = lines
    .map(
      (line, idx) =>
        `<text x="80" y="${startY + idx * lineHeight}" fill="#F8FAFC" font-size="46" font-weight="700" font-family="${fontFamily}">${escapeXml(line)}</text>`
    )
    .join('\n  ');

  const badgeRight =
    siteConfig.locale === 'en-US' ? '2026 Verified Benchmarks' : '2026 實測數據・省錢攻略';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.c1}" />
      <stop offset="55%" stop-color="${palette.c2}" />
      <stop offset="100%" stop-color="${palette.c3}" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="44" y="44" width="1112" height="542" rx="28" fill="none" stroke="#334155" stroke-width="2" />
  <rect x="80" y="92" width="320" height="44" rx="22" fill="${palette.accent}" fill-opacity="0.16" stroke="${palette.accent}" stroke-opacity="0.5" />
  <text x="240" y="121" text-anchor="middle" fill="${palette.accent}" font-size="21" font-weight="600" font-family="${fontFamily}">${escapeXml(category || siteConfig.brandName)}</text>
  ${titleSvg}
  <text x="80" y="472" fill="#94A3B8" font-size="23" font-family="${fontFamily}">${escapeXml(subtitle)}</text>
  <line x1="80" y1="510" x2="1120" y2="510" stroke="#334155" stroke-width="1.5" />
  <text x="80" y="552" fill="#E2E8F0" font-size="24" font-weight="700" font-family="${fontFamily}">${escapeXml(siteConfig.brandName)}</text>
  <text x="1120" y="552" text-anchor="end" fill="${palette.accent2}" font-size="22" font-weight="600" font-family="${fontFamily}">${escapeXml(badgeRight)}</text>
</svg>`;
}

export async function renderOgForSite(siteId, { standalone = false, outDir = '' } = {}) {
  const { siteConfig, paths } = getSiteContext(siteId, { standalone, outDir });
  const articles = loadSiteArticles(paths.articlesDir);
  ensureDir(paths.ogDir);

  const canConvertPng = hasRsvgConvert();
  const manifest = {};

  const items = [
    {
      slug: 'default',
      category: siteConfig.brandEnglish,
      title: `${siteConfig.brandName}｜${siteConfig.tagline}`,
      subtitle: siteConfig.editorialTeam || siteConfig.brandName,
    },
    ...articles.map((a) => ({
      slug: a.meta.slug,
      category: a.meta.category || siteConfig.brandName,
      title: a.meta.title,
      subtitle: `${siteConfig.locale === 'en-US' ? 'Verified' : '更新日期'} ${a.meta.updatedAt} · ${siteConfig.editorialTeam || siteConfig.brandName}`,
    })),
  ];

  for (const item of items) {
    const svg = buildOgSvg({
      siteConfig,
      category: item.category,
      title: item.title,
      subtitle: item.subtitle,
    });
    const svgPath = path.join(paths.ogDir, `${item.slug}.svg`);
    const pngPath = path.join(paths.ogDir, `${item.slug}.png`);
    writeText(svgPath, svg);

    if (canConvertPng) {
      try {
        execFileSync('rsvg-convert', ['-w', '1200', '-h', '630', svgPath, '-o', pngPath], { stdio: 'ignore' });
        fs.unlinkSync(svgPath);
        manifest[item.slug] = `${item.slug}.png`;
        continue;
      } catch {
        // Fallback to SVG
      }
    }
    manifest[item.slug] = `${item.slug}.svg`;
  }

  writeJson(paths.ogManifest, manifest);
  console.log(`[og:${siteId}] Rendered ${items.length} OG cards (${canConvertPng ? 'PNG' : 'SVG'}).`);
  return manifest;
}

export async function runRenderOg({ siteIds, standalone = false, outDir = '' } = {}) {
  const targets = siteIds || resolveTargetSites();
  const results = {};
  for (const siteId of targets) {
    results[siteId] = await renderOgForSite(siteId, { standalone, outDir });
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('render-og.mjs')) {
  const flags = parseCliFlags();
  runRenderOg({
    siteIds: resolveTargetSites(flags),
    standalone: Boolean(flags.standalone),
    outDir: flags.out || '',
  }).catch((err) => {
    console.error('[og] Error:', err);
    process.exit(1);
  });
}
