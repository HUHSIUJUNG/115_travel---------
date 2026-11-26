# 旅帳通（學生旅遊分帳小幫手）系統架構文件

## 1. 技術架構總覽
- **前端架構**：純原生 HTML5 / CSS3 / JavaScript（ES Module），不使用前端框架、建置工具或 npm，可直接部署於 GitHub Pages。
- **身份驗證**：Firebase Authentication（Google 登入 `signInWithPopup`）。
- **雲端資料庫**：Cloud Firestore，透過 Firebase 官方 CDN（`https://www.gstatic.com/firebasejs/11.0.2/...`）載入。
- **響應式設計**：Mobile-First 單欄卡片排版，支援手機與桌面瀏覽器。

---

## 2. 檔案結構
| 檔案 | 職責 |
| --- | --- |
| `index.html` | 頁面結構，包含「登入引導」、「旅程列表／建立旅程」、「旅程詳情／支出／結算」三個視圖。 |
| `style.css` | 手機優先響應式樣式表、頁首登入狀態列、卡片與表單樣式。 |
| `firebase-config.js` | 匯出 `firebaseConfig` 供 `app.js` 初始化 Firebase App。 |
| `app.js` | 核心邏輯：Google 登入狀態監聽、Firestore 即時監聽與寫入、Gmail 驗證、純整數結算演算法與安全 DOM 渲染（禁用 `innerHTML`）。 |
| `firestore.rules` | Firestore 安全規則，限制僅 `memberEmails` 內的已登入成員可讀寫該旅程與底下支出。 |

---

## 3. Firestore 資料模型

### `trips/{tripId}`（旅程主集合）
| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `name` | `string` | 旅程名稱 |
| `memberEmails` | `string[]` | 同行成員 Gmail 清單（小寫、去重，必含建立者本人） |
| `currency` | `string` | 幣別代碼（`TWD`、`JPY`、`KRW`、`USD`） |
| `createdBy` | `string` | 建立者 Gmail |
| `createdAt` | `Timestamp` | 伺服器建立時間 |

### `trips/{tripId}/expenses/{expenseId}`（支出子集合）
| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `title` | `string` | 消費項目 |
| `amount` | `number` | 正整數金額 |
| `date` | `string` | 消費日期（`YYYY-MM-DD`） |
| `category` | `string` | 支出分類（`餐飲`、`交通`、`住宿`、`購物`、`門票`、`其他`，預設為 `其他`；舊資料若無此欄位一律視為 `其他`） |
| `payer` | `string` | 付款人 Gmail |
| `createdBy` | `string` | 記錄者 Gmail |
| `createdAt` | `Timestamp` | 伺服器建立時間 |

---

## 4. 權限與資料流

```text
使用者開啟網頁
   │
   ▼
onAuthStateChanged 檢查登入狀態
   ├── 未登入 ──► 顯示「使用 Google 帳號登入」卡片
   └── 已登入 ──► 取得 user.email（轉小寫）
                    │
                    ▼
          onSnapshot 訂閱 trips
          (where memberEmails array-contains userEmail)
                    │
                    ▼
          點擊任一旅程 ──► onSnapshot 訂閱 trips/{tripId}/expenses
                              │
                              ▼
                    新增支出 / 點擊「查看結算」計算純整數分帳
```

- **安全性控管**：`firestore.rules` 透過 `request.auth.token.email.lower() in resource.data.memberEmails` 驗證讀取與寫入權限；支出子集合透過 `get(/databases/$(database)/documents/trips/$(tripId)).data.memberEmails` 繼承所屬旅程的成員權限，並強制驗證金額為大於 0 的整數。
- **XSS 防護**：`app.js` 全程使用 `document.createElement`、`textContent` 與 `appendChild`，不使用 `innerHTML` 插入使用者輸入。
