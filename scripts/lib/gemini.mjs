import { GoogleGenAI } from '@google/genai';

export const GEMINI_MODEL_MAIN = 'gemini-3.8-flash';
export const GEMINI_MODEL_FAST = 'gemini-3.5-flash-lite';

let cachedClient = null;

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

function getClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable.');
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

function extractTextFromInteraction(interaction) {
  if (interaction?.output_text) return interaction.output_text;
  const steps = interaction?.steps || [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.type === 'model_output' && Array.isArray(step.content)) {
      const texts = step.content.filter((c) => c.type === 'text' && c.text).map((c) => c.text);
      if (texts.length > 0) return texts.join('\n');
    }
  }
  return '';
}

function extractJsonObject(rawText) {
  const trimmed = String(rawText || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const firstBracket = candidate.indexOf('[');
    const start =
      firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
    if (start !== -1) {
      const endChar = candidate[start] === '[' ? ']' : '}';
      const end = candidate.lastIndexOf(endChar);
      if (end > start) {
        return JSON.parse(candidate.slice(start, end + 1));
      }
    }
    throw new Error(`Failed to parse Gemini JSON output: ${candidate.slice(0, 200)}`);
  }
}

async function withRetry(fn, { retries = 3, baseDelayMs = 2000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || err);
      const status = err?.status || err?.code;
      const isRetryable =
        status === 429 ||
        (typeof status === 'number' && status >= 500) ||
        /429|rate limit|timeout|ECONNRESET|503|502|500/i.test(msg);

      if (!isRetryable || attempt === retries) {
        throw err;
      }
      const waitMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[gemini] Retry ${attempt + 1}/${retries} after ${waitMs}ms: ${msg}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

/**
 * Pass 1: Grounded fact-checking using Google Search + URL Context (anti-hallucination).
 */
export async function researchToolsFactCheck({ topicTitle, toolsCatalog, usdToTwd, locale = 'zh-TW' }) {
  const ai = getClient();
  const toolSummary = toolsCatalog
    .map((t) => `- ${t.name} (slug: ${t.slug}): Official ${t.officialUrl} | Pricing ${t.pricingUrl} | Recorded start $${t.startingPriceUsd}/mo`)
    .join('\n');

  const prompt =
    locale === 'en-US'
      ? `Use Google Search and URL Context to verify the latest 2026 official pricing, free tier limits, and key features for:
Topic: ${topicTitle}

Tools to verify:
${toolSummary}

Return a concise bulleted fact brief in English covering verified plan names, exact monthly/annual USD pricing, key strengths, and real limitations.`
      : `請針對以下主題與工具，使用 Google Search 與 URL Context 查證 2026 年最新官方資訊與定價：
主題：${topicTitle}
目前匯率參考：1 USD = ${usdToTwd} TWD

需查證的工具清單：
${toolSummary}

請精簡條列輸出事實摘要（繁體中文），包含最新官方方案名稱、是否有免費版、付費方案費用與台幣約略換算、核心亮點與實際限制。`;

  try {
    const interaction = await withRetry(() =>
      ai.interactions.create({
        model: GEMINI_MODEL_MAIN,
        input: prompt,
        tools: [{ type: 'google_search' }, { type: 'url_context' }],
        store: false,
      })
    );
    return extractTextFromInteraction(interaction);
  } catch (err) {
    console.warn(`[gemini] Pass 1 (google_search + url_context) failed, retrying with google_search only: ${err.message}`);
    try {
      const interaction = await withRetry(() =>
        ai.interactions.create({
          model: GEMINI_MODEL_MAIN,
          input: prompt,
          tools: [{ type: 'google_search' }],
          store: false,
        })
      );
      return extractTextFromInteraction(interaction);
    } catch (err2) {
      console.warn(`[gemini] Pass 1 fallback to catalog summary: ${err2.message}`);
      return toolsCatalog
        .map((t) => `- ${t.name}: $${t.startingPriceUsd}/mo (${t.hasFreePlan ? 'Free plan available' : 'Paid'}), ${t.tagline}. Pros: ${(t.pros || []).join('; ')}`)
        .join('\n');
    }
  }
}

/**
 * Pass 2: Structured article + multi-platform social posts (localized zh-TW or en-US).
 */
export async function generateStructuredArticle({
  topic,
  toolsCatalog,
  factBrief,
  siteConfig,
  mode = 'new',
  existingBody = '',
}) {
  const ai = getClient();
  const isEn = siteConfig.locale === 'en-US';
  const allowedLinks = toolsCatalog.map((t) => `[${t.name}](/go/${t.slug})`).join(', ');

  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      rating: { type: 'number' },
      tags: { type: 'array', items: { type: 'string' } },
      faq: {
        type: 'array',
        items: {
          type: 'object',
          properties: { q: { type: 'string' }, a: { type: 'string' } },
          required: ['q', 'a'],
        },
      },
      bodyMarkdown: { type: 'string' },
      social: {
        type: 'object',
        properties: {
          threads: { type: 'string' },
          facebook: { type: 'string' },
          x: { type: 'string' },
          telegram: { type: 'string' },
          shortsHook: { type: 'string', description: '60-second short video opening hook line' },
        },
        required: ['threads', 'facebook', 'x', 'telegram', 'shortsHook'],
      },
    },
    required: ['title', 'description', 'rating', 'tags', 'faq', 'bodyMarkdown', 'social'],
  };

  const systemInstruction = isEn
    ? `You are the Lead Editor of "${siteConfig.brandName}". Write objective, data-backed, natural American English reviews and comparisons.
Strict rules:
1. Write 100% in natural US English with USD pricing based strictly on the verified fact brief. Zero Chinese characters.
2. You may ONLY use these affiliate redirect links inside the markdown: ${allowedLinks}. Never invent other /go/ slugs.
3. bodyMarkdown must be at least 900 words (~4,500+ non-whitespace chars), include at least 4 ## headings, at least 1 Markdown comparison table, honest pros & cons, and actionable recommendations. Do NOT output # H1 or YAML frontmatter.`
    : `你是「${siteConfig.brandName} (${siteConfig.brandEnglish})」的資深主編，擅長以台灣繁體中文撰寫客觀、有實戰數據、直白指出優缺點的評測與比較文章。
嚴格規則：
1. 全文必須使用道地台灣繁體中文詞彙，價格根據「查證事實摘要」撰寫並以 1 USD = ${siteConfig.usdToTwd} TWD 換算台幣，不可憑空捏造價格。
2. 文章內推薦連結「只能」使用這些站內轉址格式：${allowedLinks}，不可自行編造其他 /go/ slug。
3. bodyMarkdown 至少 1,600 字以上，必須包含：開場痛點、至少 4 個 ## 標題、至少 1 個 Markdown 比較表格、優缺點誠實分析、台灣使用情境與結論建議。不可輸出 H1 (#) 與 YAML frontmatter。`;

  const userPrompt =
    mode === 'refresh'
      ? `Refresh and update this existing guide using the verified 2026 fact brief:\nTitle: ${topic.title}\nKeyword: ${topic.targetKeyword}\nFact Brief:\n${factBrief}\n\nPrevious Draft:\n${existingBody.slice(0, 2500)}`
      : `Write a comprehensive new ${topic.type} guide:\nTitle: ${topic.title}\nCategory: ${topic.category}\nTarget Keyword: ${topic.targetKeyword}\n\nVerified Fact Brief:\n${factBrief}`;

  const interaction = await withRetry(() =>
    ai.interactions.create({
      model: GEMINI_MODEL_MAIN,
      system_instruction: systemInstruction,
      input: userPrompt,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema,
      },
      store: false,
    })
  );

  const rawText = extractTextFromInteraction(interaction);
  return extractJsonObject(rawText);
}

/**
 * Fast model: Discover new high-converting SEO topics per site locale & niche.
 */
export async function generateTopicIdeas({ trendHeadlines, catalog, existingSlugs, siteConfig, count = 4 }) {
  const ai = getClient();
  const isEn = siteConfig.locale === 'en-US';
  const catalogList = catalog.map((t) => `${t.slug} (${t.name} - ${t.category})`).join(', ');
  const trendText = trendHeadlines.slice(0, 12).map((h) => `- ${h}`).join('\n');

  const schema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        title: { type: 'string' },
        type: { type: 'string', enum: ['review', 'comparison', 'roundup', 'tutorial'] },
        category: { type: 'string' },
        tools: { type: 'array', items: { type: 'string' } },
        targetKeyword: { type: 'string' },
        priority: { type: 'integer' },
      },
      required: ['slug', 'title', 'type', 'category', 'tools', 'targetKeyword', 'priority'],
    },
  };

  const prompt = isEn
    ? `Generate ${count} high-converting English SEO topic ideas for "${siteConfig.brandName}" (${siteConfig.niche}).
Allowed tool slugs (tools array MUST only contain these slugs): ${catalogList}
Recent trends:\n${trendText || '(none)'}
Do NOT repeat these existing slugs: ${existingSlugs.join(', ')}`
    : `請為繁體中文網站「${siteConfig.brandName}」(領域：${siteConfig.niche}) 發想 ${count} 個全新高轉換台灣搜尋長尾文章主題。
可用工具 slug（tools 欄位只能填這些 slug）：${catalogList}
近期趨勢參考：\n${trendText || '(無)'}
不可重複既有 slug：${existingSlugs.join(', ')}`;

  const interaction = await withRetry(() =>
    ai.interactions.create({
      model: GEMINI_MODEL_FAST,
      input: prompt,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema,
      },
      store: false,
    })
  );

  const rawText = extractTextFromInteraction(interaction);
  return extractJsonObject(rawText);
}
