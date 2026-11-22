import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  absoluteUrl,
  ensureDir,
  escapeXml,
  getSiteContext,
  loadSiteArticles,
  parseCliFlags,
  readJson,
  resolveTargetSites,
  usdToTwd,
  writeJson,
  writeText,
} from './lib/utils.mjs';
import { wrapTextSmart } from './render-og.mjs';

function hasRsvgConvert() {
  try {
    execFileSync('rsvg-convert', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function buildSlideSvg({ siteConfig, slideIndex, totalSlides, badge, headline, bullets, footerText }) {
  const isTravel = siteConfig.niche === 'travel-tw';
  const c1 = isTravel ? '#064E3B' : '#1E1B4B';
  const accent = '#34D399';
  const fontFamily =
    siteConfig.locale === 'en-US'
      ? 'Inter, Noto Sans, system-ui, sans-serif'
      : 'Noto Sans CJK TC, Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif';

  const headLines = wrapTextSmart(headline, 17, 3);
  const headSvg = headLines
    .map(
      (line, i) =>
        `<text x="84" y="${290 + i * 74}" fill="#F8FAFC" font-size="52" font-weight="800" font-family="${fontFamily}">${escapeXml(line)}</text>`
    )
    .join('\n  ');

  const bulletStartY = 290 + headLines.length * 74 + 56;
  let currentY = bulletStartY;
  const bulletSvgs = [];
  for (const b of bullets.slice(0, 4)) {
    const wrapped = wrapTextSmart(b, 22, 2);
    for (let j = 0; j < wrapped.length; j++) {
      const prefix = j === 0 ? '▸ ' : '   ';
      bulletSvgs.push(
        `<text x="84" y="${currentY}" fill="#CBD5E1" font-size="34" font-weight="500" font-family="${fontFamily}">${escapeXml(prefix + wrapped[j])}</text>`
      );
      currentY += 50;
    }
    currentY += 20;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="cbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B1120" />
      <stop offset="60%" stop-color="${c1}" />
      <stop offset="100%" stop-color="#0F172A" />
    </linearGradient>
  </defs>
  <rect width="1080" height="1350" fill="url(#cbg)" />
  <rect x="44" y="44" width="992" height="1262" rx="36" fill="none" stroke="#334155" stroke-width="2" />

  <rect x="84" y="100" width="320" height="52" rx="26" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.55" />
  <text x="244" y="135" text-anchor="middle" fill="${accent}" font-size="24" font-weight="700" font-family="${fontFamily}">${escapeXml(badge)}</text>
  <text x="996" y="135" text-anchor="end" fill="#94A3B8" font-size="24" font-weight="700" font-family="${fontFamily}">${slideIndex} / ${totalSlides}</text>

  ${headSvg}
  ${bulletSvgs.join('\n  ')}

  <line x1="84" y1="1170" x2="996" y2="1170" stroke="#334155" stroke-width="2" />
  <text x="84" y="1230" fill="#F1F5F9" font-size="28" font-weight="700" font-family="${fontFamily}">${escapeXml(siteConfig.brandName)}</text>
  <text x="996" y="1230" text-anchor="end" fill="${accent}" font-size="24" font-weight="600" font-family="${fontFamily}">${escapeXml(footerText)}</text>
</svg>`;
}

function buildShortsKit(article, tools, siteConfig) {
  const isEn = siteConfig.locale === 'en-US';
  const topTool = tools[0];
  const toolNames = tools.slice(0, 3).map((t) => t.name).join(' / ');
  const articleUrl = absoluteUrl(`/articles/${article.meta.slug}/`, siteConfig);

  const segments = isEn
    ? [
        { start: '00:00:00,000', end: '00:00:08,000', text: article.meta.title },
        { start: '00:00:08,000', end: '00:00:24,000', text: `We tested ${toolNames || 'top tools'} on real 2026 pricing.` },
        { start: '00:00:24,000', end: '00:00:44,000', text: topTool ? `Top pick: ${topTool.name} starting at $${topTool.startingPriceUsd}/mo. ${topTool.pros?.[0] || ''}` : article.meta.description },
        { start: '00:00:44,000', end: '00:00:58,000', text: `Full breakdown and free calculator at ${siteConfig.brandName}.` },
      ]
    : [
        { start: '00:00:00,000', end: '00:00:08,000', text: article.meta.title },
        { start: '00:00:08,000', end: '00:00:24,000', text: `我們實際比對了 ${toolNames || '熱門方案'} 的 2026 最新價格與優缺點。` },
        { start: '00:00:24,000', end: '00:00:44,000', text: topTool ? `實測亮點：${topTool.name} 起價約 NT$${usdToTwd(topTool.startingPriceUsd, siteConfig.usdToTwd)}/月，${topTool.pros?.[0] || ''}` : article.meta.description },
        { start: '00:00:44,000', end: '00:00:58,000', text: `完整評比與免費試算工具，歡迎點擊 ${siteConfig.brandName} 連結查看！` },
      ];

  const srt = segments
    .map((s, idx) => `${idx + 1}\n${s.start} --> ${s.end}\n${s.text}\n`)
    .join('\n');

  const json = {
    slug: article.meta.slug,
    title: article.meta.title,
    durationSeconds: 58,
    articleUrl,
    segments,
  };

  return { srt, json };
}

export async function renderCarouselForSite(siteId, { standalone = false, outDir = '' } = {}) {
  const { siteConfig, paths } = getSiteContext(siteId, { standalone, outDir });
  const articles = loadSiteArticles(paths.articlesDir);
  const catalog = readJson(paths.catalog, []);
  const catalogMap = new Map(catalog.map((t) => [t.slug, t]));
  const isEn = siteConfig.locale === 'en-US';
  const canPng = hasRsvgConvert();

  ensureDir(paths.carouselDir);
  ensureDir(paths.shortsDir);

  const manifest = {};

  for (const art of articles) {
    const slug = art.meta.slug;
    const tools = (art.meta.tools || []).map((s) => catalogMap.get(s)).filter(Boolean);
    const primary = tools[0];
    const artCarouselDir = path.join(paths.carouselDir, slug);
    ensureDir(artCarouselDir);

    const slidesData = isEn
      ? [
          {
            badge: '01 · PAIN POINT',
            headline: art.meta.title,
            bullets: [art.meta.description, `Category: ${art.meta.category}`, `Rating: ${art.meta.rating || 4.8} / 5.0`],
            footerText: 'Swipe for benchmarks →',
          },
          {
            badge: '02 · PRICING & SPECS',
            headline: primary ? `${primary.name} Key Numbers` : 'Verified 2026 Benchmarks',
            bullets: tools.slice(0, 3).map((t) => `${t.name}: $${t.startingPriceUsd}/mo (${t.hasFreePlan ? 'Free plan' : 'Paid'})`),
            footerText: 'Verified 2026 pricing',
          },
          {
            badge: '03 · PROS & CAVEATS',
            headline: primary ? `Why ${primary.name} Wins (and Caveats)` : 'Key Pros & Caveats',
            bullets: [
              ...(primary?.pros?.slice(0, 2) || []),
              primary?.cons?.[0] ? `Watch out: ${primary.cons[0]}` : 'Test free tier before annual billing',
            ],
            footerText: 'Honest review',
          },
          {
            badge: '04 · NEXT STEP',
            headline: 'Try Our Free Cost Calculator & Full Guide',
            bullets: [
              `Read full guide on ${siteConfig.brandName}`,
              'Use /calculators/ to estimate annual savings',
              'Bookmark for 30-day refreshed updates',
            ],
            footerText: siteConfig.brandEnglish,
          },
        ]
      : [
          {
            badge: '01 · 痛點重點',
            headline: art.meta.title,
            bullets: [art.meta.description, `分類：${art.meta.category}`, `實測評分：★ ${art.meta.rating || 4.8} / 5.0`],
            footerText: '左滑看實測比較 →',
          },
          {
            badge: '02 · 費用實算',
            headline: primary ? `${primary.name} 與同級方案價格` : '2026 最新台幣費用總覽',
            bullets: tools
              .slice(0, 3)
              .map((t) => `${t.name}：$${t.startingPriceUsd}/月（約 NT$${usdToTwd(t.startingPriceUsd, siteConfig.usdToTwd)}）`),
            footerText: `匯率 1:${siteConfig.usdToTwd}`,
          },
          {
            badge: '03 · 優缺點避坑',
            headline: primary ? `${primary.name} 優點與真實限制` : '實測優點與避坑提醒',
            bullets: [
              ...(primary?.pros?.slice(0, 2) || []),
              primary?.cons?.[0] ? `留意：${primary.cons[0]}` : '建議先用免費方案測試再年繳',
            ],
            footerText: '客觀不藏私',
          },
          {
            badge: '04 · 立即行動',
            headline: '開啟免費試算器 ＆ 看完整實測圖表',
            bullets: [
              `前往 ${siteConfig.brandName} 看完整評測`,
              '站內免費互動計算機一鍵算年省金額',
              '每 30 天自動更新最新官方定價',
            ],
            footerText: siteConfig.brandEnglish,
          },
        ];

    const files = [];
    for (let idx = 0; idx < slidesData.length; idx++) {
      const s = slidesData[idx];
      const svg = buildSlideSvg({
        siteConfig,
        slideIndex: idx + 1,
        totalSlides: slidesData.length,
        ...s,
      });
      const svgPath = path.join(artCarouselDir, `slide-${idx + 1}.svg`);
      const pngPath = path.join(artCarouselDir, `slide-${idx + 1}.png`);
      writeText(svgPath, svg);

      if (canPng) {
        try {
          execFileSync('rsvg-convert', ['-w', '1080', '-h', '1350', svgPath, '-o', pngPath], { stdio: 'ignore' });
          fs.unlinkSync(svgPath);
          files.push(`slide-${idx + 1}.png`);
          continue;
        } catch {
          // fallback to svg
        }
      }
      files.push(`slide-${idx + 1}.svg`);
    }

    const { srt, json } = buildShortsKit(art, tools, siteConfig);
    writeText(path.join(paths.shortsDir, `${slug}.srt`), srt);
    writeJson(path.join(paths.shortsDir, `${slug}.json`), json);

    manifest[slug] = {
      slides: files,
      srt: `${slug}.srt`,
      scriptJson: `${slug}.json`,
    };
  }

  writeJson(paths.carouselManifest, manifest);
  console.log(`[carousel:${siteId}] Rendered ${articles.length} carousel kits (${canPng ? 'PNG' : 'SVG'}) & Shorts .srt files.`);
  return manifest;
}

export async function runRenderCarousel({ siteIds, standalone = false, outDir = '' } = {}) {
  const targets = siteIds || resolveTargetSites();
  const res = {};
  for (const siteId of targets) {
    res[siteId] = await renderCarouselForSite(siteId, { standalone, outDir });
  }
  return res;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('render-carousel.mjs')) {
  const flags = parseCliFlags();
  runRenderCarousel({
    siteIds: resolveTargetSites(flags),
    standalone: Boolean(flags.standalone),
    outDir: flags.out || '',
  }).catch((err) => {
    console.error('[carousel] Error:', err);
    process.exit(1);
  });
}
