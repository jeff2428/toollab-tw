import {
  GLOBAL_PATHS,
  getSiteContext,
  nowIsoTaipei,
  parseCliFlags,
  readJson,
  resolveTargetSites,
  writeJson,
  writeText,
} from './lib/utils.mjs';
import { runDiscover } from './discover-topics.mjs';
import { runGenerate } from './generate-content.mjs';
import { runQualityGate } from './quality-gate.mjs';
import { runRenderOg } from './render-og.mjs';
import { runRenderCarousel } from './render-carousel.mjs';
import { runNewsletter } from './newsletter-dispatch.mjs';
import { runBuildSite } from './build-site.mjs';
import { runSocialPublish } from './social-publish.mjs';
import { runPingSearchEngines } from './ping-search-engines.mjs';
import { runHealthMonitor } from './health-monitor.mjs';

async function main() {
  const flags = parseCliFlags();
  const siteIds = resolveTargetSites(flags);
  const dryRun = Boolean(flags['dry-run']);
  const skipAi = Boolean(flags['skip-ai']);
  const skipSocial = Boolean(flags['skip-social']);
  const checkUrls = Boolean(flags['check-urls']);
  const standalone = Boolean(flags.standalone);
  const outDir = flags.out || '';

  console.log(`=== Affiliate Matrix Pipeline (${dryRun ? 'DRY-RUN' : 'LIVE'}) | sites=[${siteIds.join(', ')}] ===`);

  await runDiscover({ siteIds, dryRun });
  await runGenerate({ siteIds, dryRun, skipAi });

  const qa = await runQualityGate({ siteIds, checkUrls: checkUrls && !dryRun });
  if (!qa.passed) {
    throw new Error('Quality Gate failed. Aborting deploy.');
  }

  await runRenderOg({ siteIds, standalone, outDir });
  await runRenderCarousel({ siteIds, standalone, outDir });
  await runNewsletter({ siteIds, dryRun, send: false, standalone, outDir });
  await runBuildSite({ siteIds, standalone, outDir });

  if (!skipSocial) {
    await runSocialPublish({ siteIds, dryRun });
  } else {
    console.log('[pipeline] Skipping social publish (--skip-social).');
  }

  await runPingSearchEngines({ siteIds, dryRun });
  await runHealthMonitor({ siteIds, dryRun });

  if (!dryRun) {
    for (const siteId of siteIds) {
      const { paths } = getSiteContext(siteId);
      const state = readJson(paths.state, {});
      state.lastPipelineRun = nowIsoTaipei();
      state.consecutiveFailures = 0;
      writeJson(paths.state, state);
    }
  }

  console.log('=== Matrix Pipeline completed successfully ===');
}

main().catch((err) => {
  console.error('=== Matrix Pipeline FAILED ===', err);
  try {
    writeText(
      GLOBAL_PATHS.alertIssue,
      `## Affiliate Matrix 管線執行失敗\n\n\`\`\`\n${err?.stack || err?.message || String(err)}\n\`\`\`\n`
    );
  } catch {
    // ignore alert file write error
  }
  process.exit(1);
});
