# Wedding Chapter 第一階段 Backend 部署

本階段只儲存基本新人資料，不包含 PDF、Email、人格、作答或推薦資料。

## Google Sheets 與 Apps Script

1. 建立正式 Google Sheet，從網址 `/d/` 與 `/edit` 間取得 Spreadsheet ID。
2. 由「擴充功能 → Apps Script」建立綁定專案。
3. 以 `google-apps-script/Code.gs` 取代編輯器內容。
4. 將 `google-apps-script/appsscript.json` 放入資訊清單。
5. 在「專案設定 → 指令碼屬性」設定：

   - `SPREADSHEET_ID`：正式 Google Sheet ID。

6. 執行 `setupWeddingChapterSheets()` 並完成授權。此函式可重複執行，不會清除既有新人資料。
7. 部署為「網頁應用程式」：

   - 執行身分：我
   - 誰可以存取：任何人

8. 正式網址必須以 `/exec` 結尾，不可使用 `/dev`。
9. 修改 Apps Script 後，請在「管理部署作業」中建立新版本並更新現有部署。

## 工作表

- `新人資料`：正式流水號、提交時間、防重複識別碼、新郎姓名、新郎電話、新娘姓名、新娘電話、緊急聯絡人姓名、緊急聯絡人電話、婚宴日期、日期未定、婚宴時段、預計桌數、業務代碼、業務姓名。
- `業務資料`：業務代碼、業務姓名、業務Email。
- `系統設定`：設定項目、設定值。

## 網站伺服器端設定

唯一環境變數：

```text
GOOGLE_APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/.../exec
```

此值只由 `app/api/submissions/route.ts` 在伺服器端使用，不可加入
`NEXT_PUBLIC_` 前綴，也不可寫入前端元件或提交真實網址到 Git。

## 真實測試

```bash
node scripts/test-production-submission.mjs \
  --url https://正式網站/api/submissions \
  --submission-id backend-test-001
```

工具只顯示 HTTP status、success、status、serialNumber、salesName 與錯誤，
不會顯示 salesEmail。
