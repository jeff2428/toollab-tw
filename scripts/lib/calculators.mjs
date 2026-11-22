import { escapeHtml, withBasePath } from './utils.mjs';

export function buildCalculatorsPageContent({ siteConfig, catalog }) {
  const preset = siteConfig.calculatorPreset || siteConfig.niche || 'ai-saas';
  const isEn = siteConfig.locale === 'en-US';
  const bp = siteConfig.basePath;
  const rate = Number(siteConfig.usdToTwd || 32.5);

  const catalogPayload = catalog.map((t) => ({
    slug: t.slug,
    name: t.name,
    category: t.category,
    usd: Number(t.startingPriceUsd || 0),
    hasFree: Boolean(t.hasFreePlan),
    goUrl: withBasePath(`/go/${t.slug}/`, bp),
  }));

  if (preset === 'travel-tw') {
    return `
<section class="section">
  <div class="container">
    <span class="hero-tag">Engineering as Marketing · 免費互動旅遊試算</span>
    <h1 style="margin:12px 0 8px;">2026 日韓泰自由行預算與 eSIM／票券試算器</h1>
    <p class="muted">輸入目的地、天數與人數，即時估算交通、門票、住宿與 eSIM 台幣預算，並幫你配對最划算的預訂平台。</p>

    <div class="grid-2" style="margin-top:24px;">
      <div class="card">
        <h3>1. 自由行天數、住宿與票券預算試算</h3>
        <div style="display:grid;gap:12px;">
          <label>目的地：
            <select id="trip-dest" class="select" style="width:100%;margin-top:4px;">
              <option value="japan">日本（東京／大阪／京都）</option>
              <option value="korea">韓國（首爾／釜山）</option>
              <option value="thailand">泰國（曼谷／清邁）</option>
            </select>
          </label>
          <label>旅遊天數：<strong id="trip-days-val">5</strong> 天
            <input id="trip-days" type="range" min="3" max="14" value="5" style="width:100%;" />
          </label>
          <label>同行人數：<strong id="trip-people-val">2</strong> 人
            <input id="trip-people" type="range" min="1" max="8" value="2" style="width:100%;" />
          </label>
          <label>住宿等級：
            <select id="trip-tier" class="select" style="width:100%;margin-top:4px;">
              <option value="budget">小資商旅（省錢優先）</option>
              <option value="mid" selected>舒適中階飯店（CP 值推薦）</option>
              <option value="lux">質感星級渡假飯店</option>
            </select>
          </label>
        </div>
        <div id="trip-result" class="disclosure-banner" style="margin-top:16px;margin-bottom:0;"></div>
      </div>

      <div class="card">
        <h3>2. 出國上網 eSIM 流量需求與平台推薦器</h3>
        <div style="display:grid;gap:12px;">
          <label>你的每日上網習慣：
            <select id="esim-usage" class="select" style="width:100%;margin-top:4px;">
              <option value="light">輕度：僅 Google Maps 導航、傳 LINE、查餐廳</option>
              <option value="medium" selected>中度：每天滑 IG/Threads 限動、傳照片與影片</option>
              <option value="heavy">重度：看 YouTube、筆電開熱點辦公或多人分享</option>
            </select>
          </label>
          <label>下單最在意的條件：
            <select id="trip-priority" class="select" style="width:100%;margin-top:4px;">
              <option value="price">價格最省＋免海外刷卡手續費</option>
              <option value="support">台灣繁中真人客服＋穩定不降速</option>
              <option value="multi">多國轉機／同張卡跨國使用</option>
            </select>
          </label>
        </div>
        <div id="esim-result" class="disclosure-banner" style="margin-top:16px;margin-bottom:0;"></div>
      </div>
    </div>
  </div>
</section>
<script>
(() => {
  const catalog = ${JSON.stringify(catalogPayload)};
  const bySlug = Object.fromEntries(catalog.map(t => [t.slug, t]));
  const destCost = {
    japan: { hotel: [2600, 4200, 8500], dailyTicket: 650, esimPerDay: 115, label: '日本' },
    korea: { hotel: [2200, 3600, 7200], dailyTicket: 500, esimPerDay: 105, label: '韓國' },
    thailand: { hotel: [1400, 2600, 5800], dailyTicket: 450, esimPerDay: 85, label: '泰國' }
  };
  const tierIdx = { budget: 0, mid: 1, lux: 2 };

  function updateTrip() {
    const dest = document.getElementById('trip-dest').value;
    const days = Number(document.getElementById('trip-days').value);
    const people = Number(document.getElementById('trip-people').value);
    const tier = document.getElementById('trip-tier').value;
    document.getElementById('trip-days-val').textContent = days;
    document.getElementById('trip-people-val').textContent = people;

    const cfg = destCost[dest];
    const nights = Math.max(1, days - 1);
    const rooms = Math.ceil(people / 2);
    const hotelTotal = cfg.hotel[tierIdx[tier]] * nights * rooms;
    const ticketTotal = cfg.dailyTicket * days * people;
    const esimTotal = cfg.esimPerDay * days * people;
    const total = hotelTotal + ticketTotal + esimTotal;
    const perPerson = Math.round(total / people);

    const klookUrl = bySlug['klook']?.goUrl || '#';
    const agodaUrl = bySlug['agoda']?.goUrl || '#';
    const djbUrl = bySlug['djb-esim']?.goUrl || '#';

    document.getElementById('trip-result').innerHTML =
      '<strong>預估在' + cfg.label + '核心花費（不含機票）：NT$ ' + total.toLocaleString() + '（平均每人約 NT$ ' + perPerson.toLocaleString() + '）</strong><br/>' +
      '住宿約 NT$ ' + hotelTotal.toLocaleString() + ' · 門票交通約 NT$ ' + ticketTotal.toLocaleString() + ' · eSIM 約 NT$ ' + esimTotal.toLocaleString() +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<a class="btn btn-accent" href="' + agodaUrl + '" rel="sponsored noopener noreferrer" data-go-link="true">比價 ' + cfg.label + ' 住宿 (Agoda)</a>' +
      '<a class="btn btn-primary" href="' + klookUrl + '" rel="sponsored noopener noreferrer" data-go-link="true">預訂熱門門票 (Klook)</a>' +
      '<a class="btn btn-outline" href="' + djbUrl + '" rel="sponsored noopener noreferrer" data-go-link="true">挑穩定 eSIM (DJB)</a>' +
      '</div>';
  }

  function updateEsim() {
    const usage = document.getElementById('esim-usage').value;
    const priority = document.getElementById('trip-priority').value;
    const rec = (usage === 'heavy' || priority === 'support')
      ? { tool: bySlug['djb-esim'], reason: '重度上網／追求穩定不降速與台灣 LINE 真人客服，建議選 DJB 原生線路吃到飽方案。' }
      : { tool: bySlug['airalo'], reason: '輕中度流量或跨國轉機，選 Airalo 定量 eSIM 方案最省錢且 APP 可隨時儲值。' };
    const ticketRec = priority === 'support' ? bySlug['kkday'] : bySlug['klook'];
    document.getElementById('esim-result').innerHTML =
      '<strong>推薦上網方案：' + (rec.tool?.name || 'eSIM') + '</strong><p style="margin:6px 0 10px;">' + rec.reason + '</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      (rec.tool ? '<a class="btn btn-accent" href="' + rec.tool.goUrl + '" rel="sponsored noopener noreferrer" data-go-link="true">前往 ' + rec.tool.name + '</a>' : '') +
      (ticketRec ? '<a class="btn btn-outline" href="' + ticketRec.goUrl + '" rel="sponsored noopener noreferrer" data-go-link="true">搭配票券：' + ticketRec.name + '</a>' : '') +
      '</div>';
  }

  ['trip-dest','trip-days','trip-people','trip-tier'].forEach(id => document.getElementById(id)?.addEventListener('input', updateTrip));
  ['esim-usage','trip-priority'].forEach(id => document.getElementById(id)?.addEventListener('change', updateEsim));
  updateTrip();
  updateEsim();
})();
</script>`;
  }

  // AI & SaaS Calculators (supports zh-TW & en-US)
  const copy = isEn
    ? {
        badge: 'Engineering as Marketing · Interactive SaaS Tools',
        h1: 'Free AI & SaaS Cost Calculators & Stack Finder',
        sub: 'Live pricing synced from our verified catalog. Estimate your monthly software spend, calculate automation savings, or get a tailored 3-tool stack in 30 seconds.',
        c1Title: '1. AI & SaaS Monthly Spend Estimator',
        c1Hint: 'Select the tools in your stack to calculate monthly and annual cost:',
        c2Title: '2. Make.com vs Zapier Annual Savings Calculator',
        c2OpsLabel: 'Monthly automation operations:',
        c3Title: '3. 30-Second AI Stack Finder Quiz',
        c3Role: 'Your primary role:',
        c3Goal: 'Top priority:',
      }
    : {
        badge: '免費互動試算工具 · 即時同步官網最新匯率與定價',
        h1: 'AI 訂閱費台幣試算機 × 自動化省錢計算器',
        sub: `直接串接本站實測資料庫（參考匯率 1 USD = ${rate} TWD），一秒算出你每月的 AI 軟體開銷、Make vs Zapier 年省金額，並測出最適合你的 3 款核心工具組合。`,
        c1Title: '1. AI / SaaS 訂閱總支出台幣計算機',
        c1Hint: '勾選你目前有訂閱或打算入手的工具，即時試算月費與年費：',
        c2Title: '2. Make.com vs Zapier 每年省錢試算器',
        c2OpsLabel: '每月自動化執行次數 (Operations)：',
        c3Title: '3. 30 秒測出你的最佳 AI 工具組合',
        c3Role: '你的主要身分或工作場景：',
        c3Goal: '目前最想解決的痛點：',
      };

  const roles = isEn
    ? [
        ['solo', 'Solopreneur / Indie Maker'],
        ['creator', 'YouTuber / Content Creator'],
        ['team', 'Marketing / Ops Team'],
      ]
    : [
        ['solo', '一人創業者／自由工作者'],
        ['creator', '短影音／YouTuber／自媒體創作者'],
        ['team', '行銷企劃／企業營運團隊'],
      ];

  const goals = isEn
    ? [
        ['automate', 'Cut repetitive manual work (Automation)'],
        ['content', 'Scale video, voice & visual production'],
        ['site', 'Launch high-speed SEO/affiliate sites'],
      ]
    : [
        ['automate', '消除重複手動搬運資料（自動化省時）'],
        ['content', '加速影音配音、數位人與圖卡產出'],
        ['site', '架設高轉換網站與強化跨區資安'],
      ];

  return `
<section class="section">
  <div class="container">
    <span class="hero-tag">${escapeHtml(copy.badge)}</span>
    <h1 style="margin:12px 0 8px;">${escapeHtml(copy.h1)}</h1>
    <p class="muted">${escapeHtml(copy.sub)}</p>

    <div class="grid-2" style="margin-top:24px;">
      <div class="card">
        <h3>${escapeHtml(copy.c1Title)}</h3>
        <p>${escapeHtml(copy.c1Hint)}</p>
        <div id="saas-checklist" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;">
          ${catalogPayload
            .map(
              (t, idx) => `<label style="display:flex;align-items:center;gap:6px;font-size:13px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;cursor:pointer;">
                <input type="checkbox" class="calc-tool-cb" value="${escapeHtml(t.slug)}" ${idx < 3 ? 'checked' : ''} />
                <span>${escapeHtml(t.name)} ($${t.usd})</span>
              </label>`
            )
            .join('')}
        </div>
        <div id="saas-spend-result" class="disclosure-banner" style="margin-top:14px;margin-bottom:0;"></div>
      </div>

      <div style="display:flex;flex-direction:column;gap:20px;">
        <div class="card">
          <h3>${escapeHtml(copy.c2Title)}</h3>
          <label>${escapeHtml(copy.c2OpsLabel)} <strong id="ops-val">10,000</strong></label>
          <input id="ops-range" type="range" min="1000" max="50000" step="1000" value="10000" style="width:100%;" />
          <div id="make-savings-result" class="disclosure-banner" style="margin-top:12px;margin-bottom:0;"></div>
        </div>

        <div class="card">
          <h3>${escapeHtml(copy.c3Title)}</h3>
          <div style="display:grid;gap:10px;">
            <label>${escapeHtml(copy.c3Role)}
              <select id="quiz-role" class="select" style="width:100%;margin-top:4px;">
                ${roles.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('')}
              </select>
            </label>
            <label>${escapeHtml(copy.c3Goal)}
              <select id="quiz-goal" class="select" style="width:100%;margin-top:4px;">
                ${goals.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('')}
              </select>
            </label>
          </div>
          <div id="quiz-result" class="disclosure-banner" style="margin-top:12px;margin-bottom:0;"></div>
        </div>
      </div>
    </div>
  </div>
</section>
<script>
(() => {
  const isEn = ${JSON.stringify(isEn)};
  const rate = ${JSON.stringify(rate)};
  const catalog = ${JSON.stringify(catalogPayload)};
  const bySlug = Object.fromEntries(catalog.map(t => [t.slug, t]));

  function updateSpend() {
    const selected = Array.from(document.querySelectorAll('.calc-tool-cb:checked')).map(cb => bySlug[cb.value]).filter(Boolean);
    const usdMonth = selected.reduce((sum, t) => sum + t.usd, 0);
    const usdYear = usdMonth * 12;
    const twdMonth = Math.round(usdMonth * rate);
    const twdYear = Math.round(usdYear * rate);

    const out = document.getElementById('saas-spend-result');
    if (isEn) {
      out.innerHTML = '<strong>Estimated Spend (' + selected.length + ' tools): $' + usdMonth.toFixed(2) + ' / mo ($' + usdYear.toFixed(0) + ' / yr)</strong><br/>Tip: Start on free tiers for at least 14 days before paying per seat.';
    } else {
      out.innerHTML = '<strong>已選 ' + selected.length + ' 款工具預估費用：$' + usdMonth.toFixed(2) + ' / 月（約 NT$ ' + twdMonth.toLocaleString() + ' / 月 · 年支出約 NT$ ' + twdYear.toLocaleString() + '）</strong><br/>建議：優先搭配年繳方案與免費版試跑 2 週，可再省 15%–20% 預算。';
    }
  }

  function updateSavings() {
    const ops = Number(document.getElementById('ops-range').value);
    document.getElementById('ops-val').textContent = ops.toLocaleString();
    const makeMonthly = ops <= 10000 ? 9 : Math.ceil(ops / 10000) * 9;
    const zapierMonthly = ops <= 750 ? 29.99 : ops <= 2000 ? 69 : ops <= 10000 ? 129 : Math.ceil(ops / 10000) * 149;
    const savedYearUsd = Math.max(0, Math.round((zapierMonthly - makeMonthly) * 12));
    const savedYearTwd = Math.round(savedYearUsd * rate);
    const makeUrl = bySlug['make']?.goUrl || '#';

    document.getElementById('make-savings-result').innerHTML = isEn
      ? '<strong>Make.com: ~$' + makeMonthly + '/mo vs Zapier: ~$' + zapierMonthly + '/mo → Save ~$' + savedYearUsd.toLocaleString() + '/year</strong><div style="margin-top:10px;"><a class="btn btn-accent" href="' + makeUrl + '" rel="sponsored noopener noreferrer" data-go-link="true">Try Make.com Free →</a></div>'
      : '<strong>Make.com 約 $' + makeMonthly + '/月 vs Zapier 約 $' + zapierMonthly + '/月 → 每年約可省下 NT$ ' + savedYearTwd.toLocaleString() + '（$' + savedYearUsd.toLocaleString() + '）</strong><div style="margin-top:10px;"><a class="btn btn-accent" href="' + makeUrl + '" rel="sponsored noopener noreferrer" data-go-link="true">免費註冊 Make.com 開始省錢 →</a></div>';
  }

  function updateQuiz() {
    const role = document.getElementById('quiz-role').value;
    const goal = document.getElementById('quiz-goal').value;
    let picks = ['make', 'notion', 'canva'];
    if (goal === 'content' || role === 'creator') picks = ['elevenlabs', 'heygen', 'canva'];
    else if (goal === 'site') picks = ['hostinger', 'writesonic', 'nordvpn'];
    else if (role === 'team') picks = ['notion', 'make', 'nordvpn'];

    const tools = picks.map(s => bySlug[s]).filter(Boolean);
    const links = tools.map(t => '<a class="btn btn-outline" style="padding:6px 12px;font-size:13px;" href="' + t.goUrl + '" rel="sponsored noopener noreferrer" data-go-link="true">' + t.name + ' ($' + t.usd + '/mo)</a>').join(' ');
    document.getElementById('quiz-result').innerHTML = (isEn ? '<strong>Recommended 3-Tool Stack:</strong>' : '<strong>為你配對的 3 款核心工具組合：</strong>') +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' + links + '</div>';
  }

  document.querySelectorAll('.calc-tool-cb').forEach(cb => cb.addEventListener('change', updateSpend));
  document.getElementById('ops-range')?.addEventListener('input', updateSavings);
  document.getElementById('quiz-role')?.addEventListener('change', updateQuiz);
  document.getElementById('quiz-goal')?.addEventListener('change', updateQuiz);
  updateSpend();
  updateSavings();
  updateQuiz();
})();
</script>`;
}
