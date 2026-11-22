# 30 分鐘一次性開通清單（多站矩陣版）

完成以下一次性設定後，3 個站點（繁中 AI/SaaS 站 + 英文全球 SaaS 站 + 台灣旅遊省錢站）就會每天 24/7 全自動更新、建置與引流，除非發生異常告警，否則無需人工介入。

---

## 步驟 1：推送至 GitHub 並開啟自動託管（約 5 分鐘）

1. 在 GitHub 建立新 Repository 並推送本專案。
2. 前往 **Settings → Pages → Build and deployment**：Source 選擇 **GitHub Actions**。
3. 前往 **Settings → Actions → General → Workflow permissions**：勾選 **Read and write permissions**。

---

## 步驟 2：填入免費 Gemini API Key（約 3 分鐘）

1. 前往 [Google AI Studio](https://aistudio.google.com/apikey) 建立免費 `GEMINI_API_KEY`。
2. 到 GitHub Repo **Settings → Secrets and variables → Actions** 新增 Secret：`GEMINI_API_KEY`。
3. 進入 **Actions → Daily Affiliate Matrix Autopilot → Run workflow** 手動跑一次，即可看到 3 個站點與 `/matrix/` 總覽上線。

---

## 步驟 3：集中申請聯盟帳號並填入 3 站連結（約 12 分鐘）

- **繁中 AI 站 (`sites/toollab-tw/data/catalog.json`) & 英文 SaaS 站 (`sites/saasradar-en/data/catalog.json`)**：
  - 共用同一組 **PartnerStack**（Make.com, Notion, Writesonic）、**Impact**（NordVPN, Surfshark, Hostinger, Canva）、**FirstPromoter**（ElevenLabs, HeyGen）即可同時幫中英文兩站變現！
- **台灣旅遊站 (`sites/tripdeals-tw/data/catalog.json`)**：
  - 申請 **台灣聯盟網 Affiliates.One** 或 **Impact / Klook / KKday / Agoda Partners**，取得後貼入對應工具的 `"affiliateUrl"` 欄位（並將 `"affiliateStatus"` 改為 `"active"`），全站與試算器按鈕立即生效。

---

## 步驟 4：選配 — 社群自動分發 & 私域電子報（約 8 分鐘）

所有金鑰皆支援「全域共用」或「站點專屬前綴」（例如 `SAASRADAR_EN_THREADS_ACCESS_TOKEN`、`TRIPDEALS_TW_TELEGRAM_CHANNEL_ID`）：
- **Threads / Facebook / X / Telegram 頻道**：於 GitHub Secrets 填入對應 Token 即可開啟該管道。
- **每週電子報自動派發**：若使用 Buttondown，於 `site.json` 填入 `newsletter.formActionUrl` 並在 Secrets 填入 `BUTTONDOWN_API_KEY`；若使用 Telegram 頻道派發週報，只需填入 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHANNEL_ID`。

---

## 步驟 5：如何擴充第 4 個站點？（2 分鐘）

1. 複製 `sites/toollab-tw/` 為 `sites/<new-site-id>/`，修改 `site.json`、`data/catalog.json`、`data/topics.json` 與 2 篇種子文章。
2. 將 `<new-site-id>` 加入 `config/matrix.json` 的 `sites` 陣列即可自動納入每日排程！
