# Wedding-i Viewer 部署設定

External Viewer 必須以獨立 Apps Script Web App 部署：

- 執行身分：`USER_DEPLOYING`
- 誰可以存取：`ANYONE_ANONYMOUS`
- 正式入口：正式 deployment 的 `/exec` URL，不可使用 `/dev`

## Script Properties

在「專案設定 → 指令碼屬性」設定：

- `EXTERNAL_VIEWER_SPREADSHEET_ID`：正式資料試算表 ID
- `EXTERNAL_VIEWER_WEB_APP_URL`：目前正式 deployment 的完整 `/exec` URL
- `EXTERNAL_VIEWER_MAGIC_SECRET`：至少 32 字元的隨機秘密字串
- `EXTERNAL_VIEWER_SESSION_SECRET`：至少 32 字元、且不同於 Magic Secret 的隨機秘密字串

`EXTERNAL_VIEWER_WEB_APP_URL` 格式必須是：

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

不得加入 query string、fragment 或 `/dev`。

## 正式更新流程

1. 更新 `appsscript.json`、`Code.gs`、`Index.html`、`Client.html`、`Styles.html`。
2. 建立新的 Apps Script 版本。
3. 編輯既有正式 deployment，改用新版本；維持 `USER_DEPLOYING` 與 `ANYONE_ANONYMOUS`。
4. 複製該 deployment 的正式 `/exec` URL。
5. 將 `EXTERNAL_VIEWER_WEB_APP_URL` 更新為該 `/exec` URL。
6. 由專案擁有者在編輯器手動執行 `setupExternalViewer()`，確認設定與 Allowlist schema。
7. 使用 `APPROVED` Email 重新寄送全新的 Magic Link 測試。

如果是編輯既有 deployment，deployment URL 通常維持不變；仍應逐字核對 Script Property。舊 Magic Link 不作為新版本測試依據。
