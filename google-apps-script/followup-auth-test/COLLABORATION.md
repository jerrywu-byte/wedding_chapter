# Follow-up 跨業務協作備註

本次以 `feature/followup-ui-phase1a` 的 `6fcb752a182c8e7f1d3e4260161ca817aa967e81` 為基礎。
只更新本目錄的 Follow-up Apps Script 與相關測試；不合併 main、不部署新人端或正式 Apps Script。

## 權限

| 身分 | 讀取／搜尋全部案件 | 修改自己的 M＋P:T | 修改他人 M＋P:T | 新增協作備註 |
| --- | --- | --- | --- | --- |
| 已啟用 SALES | 可以 | 可以 | 不可以（FORBIDDEN） | 所有案件 |
| 已啟用 MANAGER | 可以 | 可以 | 可以 | 所有案件 |
| 未授權、停用或角色不合法 | 不可以 | 不可以 | 不可以 | 不可以 |

登入者仍由 `Session.getActiveUser().getEmail()` 與 Workspace domain 驗證，
再查「業務資料」A:F：業務代碼、業務姓名、業務Email、LINE連結、啟用、Follow-up角色。
E 必須為布林 TRUE 或文字 TRUE；角色只接受 MANAGER／SALES。重複 Email 或業務代碼拒絕存取。

ownership 只依「新人資料」N 業務代碼，不看 O 姓名。
N 空白的案件仍可讀取、協作；SALES 不可修改正式資料，MANAGER 可修改。
`listCases()` 與 `getCase()` 的 `editable`、`canAddCollaborationNote` 由 Server 回傳。
摘要仍不含電話、備註、Email 或內部識別資料；電話搜尋只在 Server 進行。

## 獨立工作表

在 `FOLLOWUP_SPREADSHEET_ID` 指向的同一本試算表內建立「協作備註」：

| 欄 | Header | 內容 |
| --- | --- | --- |
| A | 訪客編號 | 已確認唯一存在的新人資料 A 欄訪客編號 |
| B | 建立時間 | Server UTC ISO 8601 時間；UI 以 Asia/Taipei 顯示 |
| C | 留言業務代碼 | Server 登入者所對應的業務代碼 |
| D | 留言業務姓名 | Server 登入者所對應的業務姓名 |
| E | 備註內容 | 1～1000 字，換行正規化並去除首尾空白 |

這份 schema 不加入「新人資料」任何欄位。既有 A:T schema 不變。

### 手動 setup

在 **Follow-up 專用 Apps Script 專案的編輯器**，以已啟用 MANAGER 帳號執行：

```js
setupCollaborationNotes_()
```

- 函式名稱結尾 `_`，不提供給 `google.script.run`，也不從 Web App request 自動呼叫。
- 使用 ScriptLock；先確認 MANAGER 身分。
- 工作表不存在：一次 Sheets batch 建立工作表及五個 header。
- 已存在：驗證整列 header；回傳 `{ created: false }`，不修改任何既有資料。
- 表頭不符：回傳 DATA_INTEGRITY_ERROR。不得自行清空或覆蓋；先人工確認原本資料用途。
- SALES 或未授權帳號不可執行 setup。

**部署此版本前必須完成 setup。** 缺少工作表或 header 不符時，詳細頁／備註 API 會停止，
回傳安全錯誤；不會在正式 request 中默默建立工作表。

## 備註 API 與並發

`addCollaborationNote({ serialNumber, note })` 只接受這兩個字串欄位。
若傳 authorName、salesCode、email、createdAt、rowNumber 等額外欄位，整筆回傳 VALIDATION_ERROR，
不使用偽造欄位、不寫入任何紀錄。正常送出時，署名完全取自 Server 登入身分。

Server 在取得 ScriptLock 前與鎖內重新驗證登入業務，確認案件 A 欄唯一、C 欄既有識別資料一致、
備註表頭正確後，使用 `Values.append`、`RAW`、`INSERT_ROWS` 新增一列。
RAW 避免將以 `=` 起始的備註當成公式執行；沒有讀整格、拼字串再覆寫的操作。
此 Phase 不提供備註編輯、刪除或更新 API。

新增成功回傳 `{ serialNumber, collaborationNotes }`，每則只有 `{ createdAt, authorName, note }`，
依建立時間舊到新排列，不回傳 Email、列號、Sheet ID 或業務內部欄位位置。
回傳清單在 append 前準備完成，避免 append 成功後重新讀取失敗而誤報整筆失敗。

`updateCase()` 仍在鎖內重新確認登入者、A/C identity、N ownership、revisionToken，
只用原本單次 Values.batchUpdate 寫入 M 與 P:T；不包含備註。
新增備註不會改變案件 revisionToken，也不會掩蓋正式案件的 CONFLICT。

參考：[Google Sheets append API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append)、
[batchUpdate API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)。

## UI

- 他人案件：桌數、三次洽談、狀態、結案日期與儲存均鎖定；使用 Soft Morandi 低干擾 ownership 提示。
- 三次洽談後新增「協作備註」紀錄區，顯示時間、作者與內容，不提供作者輸入欄位。
- 「＋ 新增協作備註」展開 textarea；「新增備註」只呼叫 addCollaborationNote。
- 「儲存洽談紀錄」只呼叫 updateCase。
- 新增備註成功只更新備註清單，不重置正式案件的編輯值、baseline 或 revisionToken。
- 備註新增失敗保留文字；正式案件儲存成功也保留未送出的備註草稿。
- 有草稿離開會確認；請求中禁止切換案件與重複送出。
- 不自動重試 append。若網路中斷造成結果不明，先重新載入確認是否已新增，再決定是否重新送出。

## 人工驗收與正式部署前操作

1. 將修改後的 `Code.gs`、`Client.html`、`Index.html`、`Styles.html` 放入正確的 **Follow-up 專用** Apps Script 專案。
   不要覆蓋新人 submission 專案，也不要修改新人資料 A:T。
2. 保留既有 `FOLLOWUP_ALLOWED_DOMAIN`、`FOLLOWUP_SPREADSHEET_ID`、`FOLLOWUP_IDENTITY_SECRET`。
   不要為此次更新任意更換 identity secret。
3. 確認業務資料 A:F 表頭正確；準備一個 MANAGER、兩個不同業務代碼的 SALES，以及停用／未授權測試帳號。
4. 保留 Sheets v4 Advanced Service；manifest 既有 `userinfo.email`、`spreadsheets` scopes 足夠，沒有新增 Drive scope。
5. 先在 DEV 試算表／測試專案執行 `setupCollaborationNotes_()`，確認 header、MANAGER 與 SALES 權限及正式編輯流程。
6. 用兩個授權帳號同時對同案新增不同備註，確認兩列都存在、各自署名正確；確認跨業務 updateCase 被拒絕。
7. 檢查桌機／手機排版、唯讀提示、備註成功／失敗文字保留，以及保留案件編輯草稿的行為。
8. 人工驗收通過、取得正式部署指示後，再於正式試算表執行 setup（已存在則只驗證），
   更新 **既有 Follow-up deployment** 至新版本。維持「以部署者身分執行」與 Workspace domain 存取限制。
9. 正式部署後使用 MANAGER／SALES 做角色驗收；本次程式交付不執行正式 setup 或部署。

本機測試涵蓋 Server 權限、資料寫入範圍、鎖競爭模型與真實 Client 程式的事件行為。
Apps Script 的真實帳號驗證、Google LockService 的跨執行個體行為與瀏覽器排版，仍需上述 DEV 人工驗收。

## 本次驗證結果

- `npm run typecheck`：通過。
- `node --test tests/followup*.test.mjs`：130 / 130 通過。
- Production build 與 artifact validation：通過。
- `node --test tests/*.test.mjs`：275 項，274 通過、1 項既有失敗。
- `git diff --check`：通過。
- 新人端程式、資產、schema、manifest、推薦演算法與 deployment 設定均無修改。

既有失敗為 `tests/wedding-experience-flow.test.mjs` 的「手機人格卡使用功能偵測、圖片預覽及第二次點擊分享」。
測試期待 `typeof navigator.share === "function"`，既有程式使用 `!== "function"` 的反向 guard。
已在未修改的 Follow-up 基準 commit `6fcb752a182c8e7f1d3e4260161ca817aa967e81` 單獨重現同一失敗；
依本次範圍限制，不修改新人端或其測試。全專案測試尚未全綠，不能將本次結果描述為全數通過。

此分支既有 shell scripts 的 Git mode 為 100644，直接執行 `npm test` 會先遇到 permission denied。
未更動共用 scripts，改以 Bash 明確執行等效 build／artifact／test 流程：

```sh
bash scripts/sites-env.sh -- bash -c 'timeout --signal=TERM --kill-after=10s 3m node_modules/.bin/vinext build && bash scripts/validate-artifact.sh && node --test tests/*.test.mjs'
```

本次沒有操作正式資料、建立正式工作表、合併 main 或部署 Apps Script。
