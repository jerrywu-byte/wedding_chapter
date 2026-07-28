# Wedding Chapter 3.1.3

## 本次更新

- 正式 Experience 僅保留 Brandcolor；根路徑與舊版本路徑均導向 `/brandcolor`。
- 六張既有人格卡新增「婚禮現場觀察」、「婚禮流程小劇場」、「人格特殊能力」與「AI 偷偷發現」。
- Desktop 與 Mobile 共用 `data/wedding-personalities.json`，不重複維護文案。
- 新增 `WeddingPersonalityStoryContent` 相關型別與安全 fallback。
- 正式 Runner、Brandcolor 展示結果、既有 DNA 結果元件共用 `PersonalityStoryContent`。
- 未更動人格 ID、測驗權重、計分、廳房資料、廳房推薦與資料送出邏輯。

## 驗證

- Build：通過
- Node tests：120 / 120
- 六張人格各具 4 則觀察、至少 3 行小劇場、特殊能力與 AI 發現。
- 舊 Experience URL 保留並安全導向 Brandcolor。
