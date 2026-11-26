# 旅帳通（學生旅遊分帳小幫手）系統架構文件

## 1. 技術架構總覽
- **前端架構**：純原生 HTML5 / CSS3 / JavaScript，不使用前端框架、建置工具或 npm，可直接部署於 GitHub Pages。
- **資料儲存**：瀏覽器 `localStorage`（key 皆加上 `"trip"` 前綴）。
- **響應式設計**：Mobile-First 單欄卡片排版（粉紅色系主題），支援手機與桌面瀏覽器。

---

## 2. 檔案結構
| 檔案 | 職責 |
| --- | --- |
| `index.html` | 頁面結構，包含「旅程列表／建立旅程」與「旅程詳情／支出／結算」兩個視圖。 |
| `style.css` | 手機優先響應式樣式表（粉紅主題、卡片、表單、分類標籤與分類小計格線）。 |
| `app.js` | 核心邏輯：`localStorage` 讀寫、表單驗證、支出分類與小計、純整數結算演算法與安全 DOM 渲染（禁用 `innerHTML`）。 |

---

## 3. localStorage 資料模型

### `trip_trips`（旅程陣列）
| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `string` | 唯一識別碼 |
| `name` | `string` | 旅程名稱 |
| `members` | `string[]` | 同行成員名單（去重、去空白） |
| `currency` | `string` | 幣別代碼（`TWD`、`JPY`、`KRW`、`USD`） |
| `createdAt` | `string` | ISO 建立時間 |

### `trip_expenses`（支出陣列）
| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `string` | 唯一識別碼 |
| `tripId` | `string` | 所屬旅程 `id` |
| `title` | `string` | 消費項目 |
| `amount` | `number` | 正整數金額 |
| `date` | `string` | 消費日期（`YYYY-MM-DD`） |
| `category` | `string` | 支出分類（`餐飲`、`交通`、`住宿`、`購物`、`門票`、`其他`，預設為 `其他`；舊資料無此欄位一律視為 `其他`） |
| `payer` | `string` | 付款人名稱 |
