# Wedding Chapter v1.0.0

新莊典華的五題故事式婚禮人格體驗。正式內容包含八種人格結果、廳房容量篩選、前三名推薦、人格卡下載，以及 Google Sheets、Email 與流水編號整合。

## 正式版本資訊

- `APP_NAME`: `Wedding Chapter`
- `APP_VERSION`: `1.0.0`
- `APP_ENV`: `production`
- `QUIZ_VERSION`: `five-story-v1`
- GitHub Repository：`wedding-chapter`
- GitHub Pages base path：`/wedding-chapter/`
- 預計網址：`https://<GitHub帳號>.github.io/wedding-chapter/`

版本常數集中於 `lib/appConfig.ts`；測驗版本沿用 `lib/quizData.ts` 的既有唯一來源。

## 建置架構

原專案使用 Next.js App Router，並透過 Vinext 與 Vite 建置。GitHub Pages 不支援伺服器端 API，因此本專案保留既有 Next/Vinext 架構，另外由 `vite.github-pages.config.ts` 建立純靜態 GitHub Pages 入口。

GitHub Pages 版本仍使用原本的 `WeddingExperienceRunner`、題庫、人格判定、人格卡及廳房推薦程式，沒有重建或複製演算法。

## 本機安裝

需要 Node.js 22。

```bash
npm ci
```

複製正式環境範例：

```bash
cp .env.example .env.production
```

將 `.env.production` 中的 `VITE_GOOGLE_APPS_SCRIPT_WEB_APP_URL` 設為目前正式 Google Apps Script Web App `/exec` 網址。該網址會出現在瀏覽器端程式中，因此不得在此變數放入 API Key、密碼或其他私密憑證。

## 本機啟動

```bash
npm run dev
```

本機 Vite 會提供 GitHub Pages 相同的靜態版本。

若需要維護原本的 Sites/Vinext 版本：

```bash
npm run dev:sites
```

## Build

```bash
npm run build
```

靜態輸出位於 `dist/`，入口為 `dist/index.html`。

其他驗證：

```bash
npm run typecheck
npm run lint
npm run test
```

`npm run test` 會先以既有 Vinext/Sites 建置驗證原始全端版本，再執行測試。完成測試後若要取得 GitHub Pages 檔案，請再執行一次 `npm run build`。

## GitHub Pages 部署

部署工作流程位於：

```text
.github/workflows/deploy-pages.yml
```

推送到 `main` 後，GitHub Actions 會：

1. 安裝 Node.js 22。
2. 執行 `npm ci`。
3. 執行 `npm run build`。
4. 上傳 `dist/`。
5. 部署到 GitHub Pages。

在 GitHub Repository 中進行以下設定：

1. `Settings → Pages → Build and deployment → Source` 選擇 `GitHub Actions`。
2. `Settings → Secrets and variables → Actions → Variables` 新增：
   - 名稱：`GOOGLE_APPS_SCRIPT_WEB_APP_URL`
   - 值：目前正式 Google Apps Script Web App `/exec` 網址
3. 推送或手動執行 `Deploy Wedding Chapter to GitHub Pages`。

## Repository 名稱變更

若 Repository 不再叫 `wedding-chapter`，請同步修改：

```ts
// vite.github-pages.config.ts
const GITHUB_PAGES_BASE = "/新的Repository名稱/";
```

GitHub Pages 網址格式為：

```text
https://<GitHub帳號>.github.io/<Repository名稱>/
```

## 路由與重新整理

正式流程是單頁 state，不使用 React Router，因此沒有額外加入 HashRouter 或 BrowserRouter。

GitHub Pages 版本會把目前步驟保存在 `sessionStorage`，並將網址維持在：

```text
/wedding-chapter/?step=<目前步驟>
```

所有步驟都由同一個 `index.html` 載入，重新整理不會要求 GitHub Pages 尋找不存在的內頁，也不需要額外的 `404.html` redirect script。

## Google Apps Script endpoint

- 本機：`.env.production` 的 `VITE_GOOGLE_APPS_SCRIPT_WEB_APP_URL`
- GitHub Actions：Repository variable `GOOGLE_APPS_SCRIPT_WEB_APP_URL`
- 呼叫位置：`lib/weddingChapterSubmission.ts`

GitHub Pages 是純靜態服務，無法使用原本的 `/api/submissions` 伺服器代理。GitHub Pages build 會直接呼叫既有公開 Apps Script endpoint；送出的欄位、資料格式、Email 與流水號規則均維持不變。

## 業務名單管理

正式網站的業務選單與送出成功後的 LINE 連結，都以 Google Sheet 的「業務資料」分頁為唯一來源。欄位為：

| 欄 | 內容 | 說明 |
| --- | --- | --- |
| A | 業務代碼 | 必填，送至新人資料的正式代碼，例如 `APRIL` |
| B | 業務姓名 | 必填，網站選單顯示名稱 |
| C | 業務Email | 舊欄位，可保留；網站不讀取也不回傳 |
| D | LINE連結 | 必填，`https://` 開頭的正式 LINE 導流網址 |
| E | 啟用 | 勾選才會出現在網站業務選單 |

新增業務時直接新增一列、填妥 A/B/D 並勾選 E；網站重新整理後會取得最新名單，不需要為單一業務重新 build 或部署 GitHub Pages。取消勾選 E 可停止新客選擇該業務，既有新人資料不會被刪除或改寫。

## 正式版備份

建立備份前：

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

確認通過後，建立 Git tag：

```bash
git tag -a wedding_chapter_V1.0 -m "Wedding Chapter v1.0.0"
git push origin wedding_chapter_V1.0
```

也可以在 GitHub 的 Releases 頁面，以該 tag 建立 Release 並下載 Source code ZIP。

## 回復 v1.0.0

查看 v1.0.0 而不影響目前分支：

```bash
git switch --detach wedding_chapter_V1.0
```

若要建立修復分支：

```bash
git switch -c restore-wedding-chapter-v1 wedding_chapter_V1.0
```

請勿直接強制覆蓋 `main`；先在獨立分支驗證 Build、測驗、人格結果、廳房推薦及正式送出。

## 私密資料

專案不可提交：

- `.env`
- `.env.local`
- `.env.production`
- API Key
- Google 帳號憑證
- 密碼或存取權杖

`.env.example` 只保留格式範例，不含正式 endpoint 或任何私密資料。
