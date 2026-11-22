import fs from 'node:fs';
import path from 'node:path';
import {
  GLOBAL_PATHS,
  daysBetween,
  getSiteContext,
  getSiteEnv,
  loadDotEnv,
  loadSiteArticles,
  nowIsoTaipei,
  parseCliFlags,
  readJson,
  resolveTargetSites,
  todayIsoDate,
  writeJson,
  writeText,
} from './lib/utils.mjs';

async function sendDiscordWebhook(webhookUrl, message) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message.slice(0, 1900) }),
  });
}

async function sendTelegramMessage(botToken, chatId, message) {
  await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message.slice(0, 4000) }),
  });
}

function checkSiteHealth(siteId, today) {
  const { siteConfig, paths } = getSiteContext(siteId);
  const catalog = readJson(paths.catalog, []);
  const topics = readJson(paths.topics, []);
  const socialQueue = readJson(paths.socialQueue, []);
  const qaReport = readJson(paths.qaReport, { passed: true, errors: [], warnings: [], urlResults: [] });
  const state = readJson(paths.state, {});
  const articles = loadSiteArticles(paths.articlesDir);

  const issues = [];
  if (!qaReport.passed) {
    issues.push({
      siteId,
      severity: 'critical',
      title: `[${siteId}] QA Gate 未通過`,
      detail: (qaReport.errors || []).join('; '),
    });
  }

  const brokenUrls = (qaReport.urlResults || []).filter((u) => !u.ok);
  if (brokenUrls.length > 0) {
    issues.push({
      siteId,
      severity: 'action_required',
      title: `[${siteId}] 偵測到 ${brokenUrls.length} 個目標網址異常`,
      detail: brokenUrls.map((b) => `${b.slug}: ${b.url} (${b.status})`).join('\n'),
    });
  }

  const staleArticles = articles.filter(
    (a) => daysBetween(a.meta.updatedAt || a.meta.publishedAt, today) > Number(siteConfig.refreshDays || 30) + 14
  );
  if (staleArticles.length > 0) {
    issues.push({
      siteId,
      severity: 'warning',
      title: `[${siteId}] 有 ${staleArticles.length} 篇文章超過自動翻新寬限期`,
      detail: staleArticles.map((a) => a.meta.slug).join(', '),
    });
  }

  if (getSiteEnv(siteId, 'THREADS_ACCESS_TOKEN') && state.lastThreadsTokenRefresh) {
    const age = daysBetween(state.lastThreadsTokenRefresh.slice(0, 10), today);
    if (age >= 50) {
      issues.push({
        siteId,
        severity: 'action_required',
        title: `[${siteId}] Threads Token 超過 50 天未續期`,
        detail: '請檢查 weekly-maintenance 工作流或手動更新 Token。',
      });
    }
  }

  const socialErrors = socialQueue.filter((s) => String(s.note || '').startsWith('error:'));
  if (socialErrors.length > 0) {
    issues.push({
      siteId,
      severity: 'action_required',
      title: `[${siteId}] 社群 API 發生 ${socialErrors.length} 筆錯誤`,
      detail: socialErrors.slice(-3).map((s) => `${s.platform}: ${s.note}`).join('\n'),
    });
  }

  const activeAffCount = catalog.filter((c) => Boolean(c.affiliateUrl)).length;
  const pendingTopics = topics.filter((t) => t.status === 'pending').length;
  const hasActionable = issues.some((i) => i.severity === 'critical' || i.severity === 'action_required');

  return {
    siteId,
    paths,
    report: {
      siteId,
      checkedAt: nowIsoTaipei(),
      status: hasActionable ? 'action_required' : issues.length > 0 ? 'warning' : 'healthy',
      articleCount: articles.length,
      pendingTopics,
      activeAffiliateLinks: activeAffCount,
      placeholderAffiliateLinks: catalog.length - activeAffCount,
      issues,
    },
    state,
  };
}

export async function runHealthMonitor({ siteIds, dryRun = false, weeklyDigest = false } = {}) {
  loadDotEnv();
  const targets = siteIds || resolveTargetSites();
  const today = todayIsoDate();

  const perSite = targets.map((id) => checkSiteHealth(id, today));
  const aiErrors = readJson(path.join(GLOBAL_PATHS.reportsDir, 'ai-errors.json'), []);
  const aiIssues = (Array.isArray(aiErrors) ? aiErrors : []).map((e) => ({
    siteId: e.siteId,
    severity: 'action_required',
    title: `[${e.siteId}] Gemini AI 自動產文失敗`,
    detail: e.error,
  }));
  const allIssues = [...perSite.flatMap((s) => s.report.issues), ...aiIssues];
  const hasActionable = allIssues.some((i) => i.severity === 'critical' || i.severity === 'action_required');

  const summary = {
    checkedAt: nowIsoTaipei(),
    status: hasActionable ? 'action_required' : allIssues.length > 0 ? 'warning' : 'healthy',
    totalArticles: perSite.reduce((n, s) => n + s.report.articleCount, 0),
    totalPendingTopics: perSite.reduce((n, s) => n + s.report.pendingTopics, 0),
    sites: perSite.map((s) => s.report),
  };

  if (!dryRun) {
    for (const item of perSite) {
      writeJson(item.paths.healthReport, item.report);
      item.state.lastHealthCheckAt = item.report.checkedAt;
      item.state.lastHealthSummary = {
        status: item.report.status,
        articleCount: item.report.articleCount,
        activeAffiliateLinks: item.report.activeAffiliateLinks,
        placeholderAffiliateLinks: item.report.placeholderAffiliateLinks,
      };
      writeJson(item.paths.state, item.state);
    }
    writeJson(GLOBAL_PATHS.healthSummary, summary);

    if (hasActionable) {
      const alertBody = [
        `## Affiliate Matrix 自動巡檢告警 (${today})`,
        '',
        ...allIssues
          .filter((i) => i.severity !== 'warning')
          .map((i) => `- **[${i.severity}] ${i.title}**\n  \`\`\`\n  ${i.detail}\n  \`\`\``),
      ].join('\n');

      writeText(GLOBAL_PATHS.alertIssue, alertBody + '\n');
      if (process.env.DISCORD_WEBHOOK_URL) {
        await sendDiscordWebhook(process.env.DISCORD_WEBHOOK_URL, alertBody).catch(() => {});
      }
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, alertBody).catch(() => {});
      }
    } else if (fs.existsSync(GLOBAL_PATHS.alertIssue)) {
      fs.unlinkSync(GLOBAL_PATHS.alertIssue);
    }

    if (weeklyDigest) {
      const digest = `📊 Affiliate Matrix 週報 (${today})\n總文章：${summary.totalArticles} 篇｜待寫主題：${summary.totalPendingTopics} 筆｜狀態：${summary.status}`;
      if (process.env.DISCORD_WEBHOOK_URL) {
        await sendDiscordWebhook(process.env.DISCORD_WEBHOOK_URL, digest).catch(() => {});
      }
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, digest).catch(() => {});
      }
    }
  }

  console.log(`[health] Matrix status=${summary.status}, issues=${allIssues.length}`);
  return summary;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('health-monitor.mjs')) {
  const flags = parseCliFlags();
  runHealthMonitor({
    siteIds: resolveTargetSites(flags),
    dryRun: Boolean(flags['dry-run']),
    weeklyDigest: Boolean(flags['weekly-digest']),
  })
    .then((res) => console.log('[health] Done:', JSON.stringify({ status: res.status, totalArticles: res.totalArticles })))
    .catch((err) => {
      console.error('[health] Error:', err);
      process.exit(1);
    });
}
