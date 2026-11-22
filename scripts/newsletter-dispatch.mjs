import path from 'node:path';
import {
  absoluteUrl,
  escapeHtml,
  getSiteContext,
  getSiteEnv,
  loadSiteArticles,
  parseCliFlags,
  readJson,
  resolveTargetSites,
  todayIsoDate,
  writeText,
} from './lib/utils.mjs';

function buildNewsletterHtml({ siteConfig, articles, catalog }) {
  const isEn = siteConfig.locale === 'en-US';
  const today = todayIsoDate();
  const latest = articles.slice(0, 4);
  const topTools = catalog.slice(0, 4);

  const itemsHtml = latest
    .map((a) => {
      const url = absoluteUrl(`/articles/${a.meta.slug}/`, siteConfig);
      return `<li style="margin-bottom:14px;">
        <a href="${escapeHtml(url)}" style="color:#818cf8;font-weight:700;">${escapeHtml(a.meta.title)}</a>
        <div style="color:#94a3b8;font-size:14px;margin-top:4px;">${escapeHtml(a.meta.description)}</div>
      </li>`;
    })
    .join('\n');

  const toolsHtml = topTools
    .map((t) => {
      const goUrl = absoluteUrl(`/go/${t.slug}/`, siteConfig);
      return `<li style="margin-bottom:8px;">
        <strong>${escapeHtml(t.name)}</strong> ($${t.startingPriceUsd}/mo) — <a href="${escapeHtml(goUrl)}" rel="sponsored noopener noreferrer" style="color:#34d399;">${isEn ? 'Check Official Offer' : '查看最新方案'}</a>
      </li>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'zh-Hant-TW'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${escapeHtml(siteConfig.newsletter?.title || siteConfig.brandName)} (${today})</title>
</head>
<body style="font-family:'Noto Sans TC',system-ui,sans-serif;background:#0b1120;color:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:640px;margin:0 auto;background:#111827;border:1px solid #334155;border-radius:16px;padding:28px;">
    <p style="color:#34d399;font-size:13px;font-weight:700;margin:0 0 8px;">${escapeHtml(siteConfig.brandName)} · ${today}</p>
    <h1 style="margin:0 0 12px;font-size:24px;">${escapeHtml(siteConfig.newsletter?.title || siteConfig.brandName)}</h1>
    <p style="color:#94a3b8;line-height:1.7;">${escapeHtml(siteConfig.newsletter?.description || siteConfig.description)}</p>
    <h2 style="font-size:18px;border-bottom:1px solid #334155;padding-bottom:8px;margin-top:24px;">${isEn ? 'Latest Verified Guides' : '本期精選實測與比價'}</h2>
    <ul style="padding-left:18px;line-height:1.6;">${itemsHtml}</ul>
    <h2 style="font-size:18px;border-bottom:1px solid #334155;padding-bottom:8px;margin-top:24px;">${isEn ? 'Top Recommended Picks' : '本週精選工具與優惠入口'}</h2>
    <ul style="padding-left:18px;line-height:1.6;">${toolsHtml}</ul>
    <p style="margin-top:24px;font-size:12px;color:#64748b;">${escapeHtml(siteConfig.disclosureShort)}</p>
  </div>
</body>
</html>`;
}

async function dispatchButtondown(apiKey, subject, bodyMarkdown) {
  const res = await fetch('https://api.buttondown.com/v1/emails', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subject, body: bodyMarkdown, status: 'sent' }),
  });
  return { provider: 'buttondown', ok: res.ok, status: res.status };
}

async function dispatchTelegramChannel(botToken, channelId, text) {
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: channelId, text: text.slice(0, 4000) }),
  });
  return { provider: 'telegram_channel', ok: res.ok, status: res.status };
}

export async function runNewsletter({ siteIds, dryRun = false, send = false, standalone = false, outDir = '' } = {}) {
  const targets = siteIds || resolveTargetSites();
  const summary = {};

  for (const siteId of targets) {
    const { siteConfig, paths } = getSiteContext(siteId, { standalone, outDir });
    const articles = loadSiteArticles(paths.articlesDir);
    const catalog = readJson(paths.catalog, []);
    const html = buildNewsletterHtml({ siteConfig, articles, catalog });

    writeText(path.join(paths.distDir, 'newsletter', 'latest.html'), html);

    const subject = `${siteConfig.newsletter?.title || siteConfig.brandName} (${todayIsoDate()})`;
    const digestText = [
      `📰 ${subject}`,
      '',
      ...articles.slice(0, 3).map((a) => `• ${a.meta.title}\n  ${absoluteUrl(`/articles/${a.meta.slug}/`, siteConfig)}`),
    ].join('\n');

    const dispatched = [];
    if (send) {
      const buttondownKey = getSiteEnv(siteId, 'BUTTONDOWN_API_KEY');
      const tgToken = getSiteEnv(siteId, 'TELEGRAM_BOT_TOKEN');
      const tgChannel = getSiteEnv(siteId, 'TELEGRAM_CHANNEL_ID');

      if (dryRun) {
        console.log(`[newsletter:${siteId}] [dry-run] Would dispatch "${subject}" (${articles.length} articles).`);
        dispatched.push({ provider: 'dry-run', ok: true });
      } else {
        if (buttondownKey) {
          dispatched.push(await dispatchButtondown(buttondownKey, subject, digestText));
        }
        if (tgToken && tgChannel) {
          dispatched.push(await dispatchTelegramChannel(tgToken, tgChannel, digestText));
        }
        if (dispatched.length === 0) {
          console.log(`[newsletter:${siteId}] No email/channel API key configured; generated public archive newsletter/latest.html only.`);
        }
      }
    }

    summary[siteId] = {
      archiveGenerated: true,
      dispatched,
    };
  }

  return summary;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('newsletter-dispatch.mjs')) {
  const flags = parseCliFlags();
  runNewsletter({
    siteIds: resolveTargetSites(flags),
    dryRun: Boolean(flags['dry-run']),
    send: Boolean(flags.send),
    standalone: Boolean(flags.standalone),
    outDir: flags.out || '',
  })
    .then((res) => console.log('[newsletter] Done:', JSON.stringify(res)))
    .catch((err) => {
      console.error('[newsletter] Error:', err);
      process.exit(1);
    });
}
