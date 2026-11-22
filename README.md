# Affiliate Matrix Autopilot — 多站矩陣全自動聯盟行銷與引流系統

這是一套 **一機多站（Multi-Site Matrix）** 的 24/7 雲端全自動聯盟行銷系統，單一程式碼庫與 GitHub Actions 排程即可同時自動運營 **3 個垂直領域、各自保持 SEO 主題權威** 的聯盟行銷網站：

| 站點 ID | 品牌名稱 | 語系 / 市場 | 利基領域 | 建置輸出位置 |
| :--- | :--- | :--- | :--- | :--- |
| `toollab-tw` | **AI 工具實驗室 ToolLab TW** | `zh-TW` 台灣 | AI 工具與 SaaS（12 款高訂閱分潤） | `dist/`（主站） |
| `saasradar-en` | **SaaSRadar** | `en-US` 全球 | 英文全球 SaaS & AI Stack（10 款美元分潤） | `dist/sites/saasradar-en/` |
| `tripdeals-tw` | **旅省實驗室 TripDeals TW** | `zh-TW` 台灣 | 日韓泰自由行票券、訂房與 eSIM（8 款） | `dist/sites/tripdeals-tw/` |

> 子站亦支援 `--standalone` 模式獨立建置部署至專屬網域。

## 四大成長飛輪（全自動執行）

1. **多站垂直 SEO 內容引擎**：每日自動探索趨勢與更新 USD/TWD 匯率，使用 `@google/genai` Interactions API（`gemini-3.8-flash` + `google_search` + `url_context`）兩階段查證撰寫與 30 天自動翻新。
2. **免費互動微工具（`/calculators/`）**：AI 訂閱費台幣計算機、Make vs Zapier 年省試算器、30 秒 AI 組合測驗、日韓泰自由行預算與 eSIM 試算器，直接串接各站 `catalog.json` 導向 `/go/<slug>`。
3. **私域捕獲與自動電子報（`/newsletter/`）**：每站內建電子報訂閱卡片與公開週報存檔（`newsletter/latest.html`），每週日支援 Buttondown / Telegram 公開頻道自動派發。
4. **多圖輪播懶人包 ＋ 60 秒短影音字幕包**：每篇文章自動產出 4 張 `1080×1350` 輪播圖卡（`/carousel/<slug>/`）與標準 `.srt` 短影音字幕檔（`/shorts/<slug>.srt`），並透過 Threads、Facebook 粉專、X 與 Telegram 自動分發。

## 常用指令

```bash
npm run qa           # 執行全矩陣 3 站品質閘門檢查
npm run build        # 渲染 OG + 輪播圖卡 + 電子報存檔 + 建置全矩陣靜態站至 dist/
npm run dry-run      # 全矩陣全管線乾跑模擬（不修改正式檔案、不發文）
npm run pipeline     # 執行完整 3 站自動化管線
npm run preview      # 本機啟動 http://127.0.0.1:4173/ 預覽（含 /matrix/ 總覽）
```

詳細一次性開通步驟請參閱：[docs/30-MIN-ONBOARDING.md](docs/30-MIN-ONBOARDING.md)。
