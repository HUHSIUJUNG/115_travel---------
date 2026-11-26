## 技術規定
- 純前端 HTML/CSS/JavaScript（ES Module），不用框架與 npm，部署在 GitHub Pages
- Firebase（Authentication Google 登入、Cloud Firestore）透過官方 CDN 載入，`firebaseConfig` 置於 `firebase-config.js`
- 旅程與支出資料存於 Firestore，成員以 Gmail 識別，僅 `memberEmails` 內的登入者可讀寫對應旅程（搭配 `firestore.rules` 控管）
- 金額一律以整數儲存與計算
- 不用 `innerHTML` 插入使用者輸入
- 介面用繁體中文，手機也要能用

## 工作方式
- 動手前先給實作計畫，我同意後再改檔案
- 完成後列出修改的檔案與驗證步驟

## 禁止事項
- 不把密碼或私密後端金鑰寫進程式碼
- 不自己 commit、push
- 不刪除或修改專案資料夾以外的檔案
