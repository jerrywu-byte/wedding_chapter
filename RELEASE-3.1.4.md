# Wedding Chapter — 鎏金篇章 3.1.4

- 內部 `experienceId` 保留 `brandcolor`。
- 使用者可見名稱統一為「鎏金篇章 / Golden Chapter」。
- 人格資料由六張擴充為八張，新增「儀式築夢者」與「歡樂導演家」。
- 頁面卡與下載卡共用 `PersonalityCard`、同一筆人格資料與相同內容順序。
- 下載改為隱藏 DOM 真實渲染，等待字型與圖片完成後輸出自動高度 PNG。
- 移除 Canvas 逐字繪製與固定字數切行。
- 中文內文使用自然換行；人格名稱保持單行。
- 八張人格皆有固定答案命中測試，未使用隨機結果。
- 未知舊人格 ID 顯示安全說明，不隨機替換。
- 131 項測試、TypeScript build、ESLint 與 Sites artifact 驗證通過。

## 八人格固定命中路徑

| 人格 | Q1–Q8 |
| --- | --- |
| 月光詩人 | AAAAAAAA |
| 星辰主角 | BBBBAAAA |
| 森林收藏家 | CCCCAAAA |
| 皇家策展人 | DDDBAAAA |
| 都會造夢家 | CCBBBBBA |
| 溫柔聚會家 | CCBCBBAA |
| 儀式築夢者 | DDADAAAA |
| 歡樂導演家 | CCBBBABA |
