/**
 * 旅帳通 (Travel Split) - 核心應用程式邏輯
 * 規則遵循：
 * 1. 純原生 JavaScript，不依賴任何套件
 * 2. 嚴格不使用 innerHTML 插入使用者輸入（使用 textContent 與 DOM 節點組裝）
 * 3. 儲存於 localStorage
 * 4. 金額全程整數儲存與計算
 */

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // 常數與設定
  // ---------------------------------------------------------------------------
  const STORAGE_KEYS = {
    TRIPS: 'travel_split_trips',
    EXPENSES: 'travel_split_expenses'
  };

  const CURRENCY_CONFIG = {
    TWD: { name: '新台幣', unit: '元' },
    JPY: { name: '日圓', unit: '円' },
    KRW: { name: '韓元', unit: '韓元' },
    USD: { name: '美元', unit: '美元' }
  };

  // ---------------------------------------------------------------------------
  // 狀態管理
  // ---------------------------------------------------------------------------
  const state = {
    trips: [],
    expenses: [],
    currentTripId: null
  };

  // ---------------------------------------------------------------------------
  // 資料存取層 (localStorage)
  // ---------------------------------------------------------------------------
  function loadFromStorage() {
    try {
      const tripsJson = localStorage.getItem(STORAGE_KEYS.TRIPS);
      state.trips = tripsJson ? JSON.parse(tripsJson) : [];
      if (!Array.isArray(state.trips)) state.trips = [];
    } catch (e) {
      console.error('讀取旅程資料失敗:', e);
      state.trips = [];
    }

    try {
      const expensesJson = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      state.expenses = expensesJson ? JSON.parse(expensesJson) : [];
      if (!Array.isArray(state.expenses)) state.expenses = [];
    } catch (e) {
      console.error('讀取支出資料失敗:', e);
      state.expenses = [];
    }
  }

  function saveTripsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(state.trips));
    } catch (e) {
      console.error('儲存旅程資料失敗:', e);
      alert('儲存失敗，請確認瀏覽器儲存空間是否充足。');
    }
  }

  function saveExpensesToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(state.expenses));
    } catch (e) {
      console.error('儲存支出資料失敗:', e);
      alert('儲存失敗，請確認瀏覽器儲存空間是否充足。');
    }
  }

  function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  function getCurrencyUnit(currencyCode) {
    return CURRENCY_CONFIG[currencyCode] ? CURRENCY_CONFIG[currencyCode].unit : '元';
  }

  // ---------------------------------------------------------------------------
  // DOM 元素快取
  // ---------------------------------------------------------------------------
  const dom = {
    // 視圖
    viewTripList: document.getElementById('viewTripList'),
    viewTripDetail: document.getElementById('viewTripDetail'),
    appHeaderTitle: document.getElementById('appHeaderTitle'),

    // 表單：建立旅程
    formCreateTrip: document.getElementById('formCreateTrip'),
    inputTripName: document.getElementById('inputTripName'),
    inputTripMembers: document.getElementById('inputTripMembers'),
    selectTripCurrency: document.getElementById('selectTripCurrency'),
    tripFormError: document.getElementById('tripFormError'),
    tripListContainer: document.getElementById('tripListContainer'),

    // 旅程詳情區
    btnBackToTrips: document.getElementById('btnBackToTrips'),
    detailTripName: document.getElementById('detailTripName'),
    detailTripCurrencyBadge: document.getElementById('detailTripCurrencyBadge'),
    detailTripMembers: document.getElementById('detailTripMembers'),
    detailTotalAmount: document.getElementById('detailTotalAmount'),
    detailTotalCurrencyUnit: document.getElementById('detailTotalCurrencyUnit'),

    // 表單：新增支出
    formAddExpense: document.getElementById('formAddExpense'),
    inputExpenseTitle: document.getElementById('inputExpenseTitle'),
    inputExpenseAmount: document.getElementById('inputExpenseAmount'),
    inputExpenseDate: document.getElementById('inputExpenseDate'),
    selectExpensePayer: document.getElementById('selectExpensePayer'),
    expenseFormError: document.getElementById('expenseFormError'),
    expenseListContainer: document.getElementById('expenseListContainer'),

    // 結算區
    btnViewSettlement: document.getElementById('btnViewSettlement'),
    settlementResultContainer: document.getElementById('settlementResultContainer')
  };

  // ---------------------------------------------------------------------------
  // 畫面切換與路徑處理
  // ---------------------------------------------------------------------------
  function switchView(viewName) {
    if (viewName === 'detail') {
      dom.viewTripList.style.display = 'none';
      dom.viewTripDetail.style.display = 'flex';
      dom.viewTripDetail.style.flexDirection = 'column';
      window.scrollTo(0, 0);
    } else {
      dom.viewTripDetail.style.display = 'none';
      dom.viewTripList.style.display = 'block';
      state.currentTripId = null;
      renderTripList();
      window.scrollTo(0, 0);
    }
  }

  // ---------------------------------------------------------------------------
  // 安全 DOM 工具（不使用 innerHTML 插入使用者字串）
  // ---------------------------------------------------------------------------
  function clearElement(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function showFormError(element, message) {
    element.textContent = message;
    element.classList.add('visible');
  }

  function clearFormError(element) {
    element.textContent = '';
    element.classList.remove('visible');
  }

  // ---------------------------------------------------------------------------
  // 旅程管理 (Story #1)
  // ---------------------------------------------------------------------------
  function parseMembersInput(rawText) {
    if (!rawText) return [];
    // 支援半形逗號、全形逗號、頓號
    const parts = rawText.split(/[,，、]/);
    const cleaned = [];
    const seen = new Set();

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        cleaned.push(trimmed);
      }
    }
    return cleaned;
  }

  function handleCreateTrip(event) {
    event.preventDefault();
    clearFormError(dom.tripFormError);

    const name = dom.inputTripName.value.trim();
    const membersRaw = dom.inputTripMembers.value.trim();
    const currency = dom.selectTripCurrency.value;

    if (!name) {
      showFormError(dom.tripFormError, '請填寫旅程名稱');
      dom.inputTripName.focus();
      return;
    }

    const members = parseMembersInput(membersRaw);
    if (members.length < 2) {
      showFormError(dom.tripFormError, '同行成員請至少填寫 2 位不同名稱（例如：小明, 小華, 小美）');
      dom.inputTripMembers.focus();
      return;
    }

    const newTrip = {
      id: generateId('trip'),
      name,
      members,
      currency,
      createdAt: new Date().toISOString()
    };

    state.trips.unshift(newTrip);
    saveTripsToStorage();

    // 重設表單
    dom.formCreateTrip.reset();
    renderTripList();

    // 自動導向新旅程詳情
    openTripDetail(newTrip.id);
  }

  function renderTripList() {
    clearElement(dom.tripListContainer);

    if (state.trips.length === 0) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'empty-state';
      emptyBox.textContent = '目前還沒有旅程，請在上方建立一筆新旅程！';
      dom.tripListContainer.appendChild(emptyBox);
      return;
    }

    state.trips.forEach(trip => {
      const item = document.createElement('div');
      item.className = 'trip-card-item';
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.addEventListener('click', () => openTripDetail(trip.id));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openTripDetail(trip.id);
        }
      });

      const infoDiv = document.createElement('div');
      infoDiv.className = 'trip-card-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'trip-card-title';
      titleEl.textContent = trip.name;

      const metaEl = document.createElement('div');
      metaEl.className = 'trip-card-meta';
      const membersCount = trip.members ? trip.members.length : 0;
      const membersText = trip.members ? trip.members.join('、') : '';
      metaEl.textContent = `共 ${membersCount} 位成員（${membersText}） · 幣別：${trip.currency}`;

      infoDiv.appendChild(titleEl);
      infoDiv.appendChild(metaEl);

      const arrowEl = document.createElement('div');
      arrowEl.className = 'trip-card-arrow';
      arrowEl.textContent = '›';

      item.appendChild(infoDiv);
      item.appendChild(arrowEl);

      dom.tripListContainer.appendChild(item);
    });
  }

  // ---------------------------------------------------------------------------
  // 旅程詳情與支出管理 (Story #2)
  // ---------------------------------------------------------------------------
  function openTripDetail(tripId) {
    const trip = state.trips.find(t => t.id === tripId);
    if (!trip) {
      alert('找不到該筆旅程資料');
      return;
    }

    state.currentTripId = tripId;

    // 設定資訊卡片
    dom.detailTripName.textContent = trip.name;
    dom.detailTripCurrencyBadge.textContent = `${trip.currency} (${getCurrencyUnit(trip.currency)})`;
    dom.detailTripMembers.textContent = trip.members.join('、');
    dom.detailTotalCurrencyUnit.textContent = getCurrencyUnit(trip.currency);

    // 填入付款人下拉選單
    clearElement(dom.selectExpensePayer);
    trip.members.forEach(member => {
      const opt = document.createElement('option');
      opt.value = member;
      opt.textContent = member;
      dom.selectExpensePayer.appendChild(opt);
    });

    // 預設日期為今天 (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];
    dom.inputExpenseDate.value = today;

    // 重設表單與結算隱藏
    dom.formAddExpense.reset();
    dom.inputExpenseDate.value = today;
    clearFormError(dom.expenseFormError);
    dom.settlementResultContainer.style.display = 'none';

    // 渲染支出列表與更新總金額
    renderExpensesAndTotal();

    switchView('detail');
  }

  function getCurrentTripExpenses() {
    return state.expenses.filter(e => e.tripId === state.currentTripId);
  }

  function handleAddExpense(event) {
    event.preventDefault();
    clearFormError(dom.expenseFormError);

    const trip = state.trips.find(t => t.id === state.currentTripId);
    if (!trip) return;

    const title = dom.inputExpenseTitle.value.trim();
    const amountRaw = dom.inputExpenseAmount.value.trim();
    const date = dom.inputExpenseDate.value;
    const payer = dom.selectExpensePayer.value;

    if (!title) {
      showFormError(dom.expenseFormError, '請填寫消費項目');
      dom.inputExpenseTitle.focus();
      return;
    }

    const amount = Number(amountRaw);
    if (!amountRaw || isNaN(amount) || !Number.isInteger(amount) || amount <= 0) {
      showFormError(dom.expenseFormError, '金額請填寫大於 0 的正整數');
      dom.inputExpenseAmount.focus();
      return;
    }

    if (!date) {
      showFormError(dom.expenseFormError, '請選擇消費日期');
      dom.inputExpenseDate.focus();
      return;
    }

    if (!payer || !trip.members.includes(payer)) {
      showFormError(dom.expenseFormError, '請選擇有效的付款人');
      dom.selectExpensePayer.focus();
      return;
    }

    const newExpense = {
      id: generateId('exp'),
      tripId: state.currentTripId,
      title,
      amount,
      date,
      payer
    };

    state.expenses.unshift(newExpense);
    saveExpensesToStorage();

    // 清空項目與金額輸入，保留日期與付款人方便連續記錄
    dom.inputExpenseTitle.value = '';
    dom.inputExpenseAmount.value = '';
    dom.inputExpenseTitle.focus();

    // 若結算區塊原本開啟，更新它
    if (dom.settlementResultContainer.style.display !== 'none') {
      renderSettlement();
    }

    renderExpensesAndTotal();
  }

  function renderExpensesAndTotal() {
    const trip = state.trips.find(t => t.id === state.currentTripId);
    if (!trip) return;

    const currentExpenses = getCurrentTripExpenses();
    const unit = getCurrencyUnit(trip.currency);

    // 計算總額
    const totalAmount = currentExpenses.reduce((sum, item) => sum + item.amount, 0);
    dom.detailTotalAmount.textContent = totalAmount.toLocaleString('zh-TW');

    // 渲染清單
    clearElement(dom.expenseListContainer);

    if (currentExpenses.length === 0) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'empty-state';
      emptyBox.textContent = '目前尚無支出記錄，請透過上方表單新增第一筆支出！';
      dom.expenseListContainer.appendChild(emptyBox);
      return;
    }

    currentExpenses.forEach(exp => {
      const itemEl = document.createElement('div');
      itemEl.className = 'expense-item';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'expense-item-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'expense-item-title';
      // 驗收條件格式：項目 - 金額 單位（付款人先付）
      titleEl.textContent = `${exp.title} - ${exp.amount} ${unit}（${exp.payer}先付）`;

      const metaEl = document.createElement('div');
      metaEl.className = 'expense-item-meta';
      metaEl.textContent = `日期：${exp.date}`;

      infoDiv.appendChild(titleEl);
      infoDiv.appendChild(metaEl);

      const amountEl = document.createElement('div');
      amountEl.className = 'expense-item-amount';
      amountEl.textContent = `${exp.amount.toLocaleString('zh-TW')} ${unit}`;

      itemEl.appendChild(infoDiv);
      itemEl.appendChild(amountEl);

      dom.expenseListContainer.appendChild(itemEl);
    });
  }

  // ---------------------------------------------------------------------------
  // 自動結算演算法 (Story #3)
  // ---------------------------------------------------------------------------
  function calculateSettlement(trip, expenses) {
    const members = trip.members;
    const n = members.length;
    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

    // 1. 計算每位成員墊付總金額
    const paidMap = {};
    members.forEach(m => { paidMap[m] = 0; });
    expenses.forEach(e => {
      if (paidMap[e.payer] !== undefined) {
        paidMap[e.payer] += e.amount;
      }
    });

    if (totalAmount === 0) {
      return {
        totalAmount: 0,
        averagePerPerson: 0,
        remainder: 0,
        transfers: [],
        memberSummary: members.map(m => ({ member: m, paid: 0, share: 0, balance: 0 }))
      };
    }

    // 2. 整數平分與餘數處理
    // 例如 600 / 3 = 200，餘數 0；100 / 3 = 33，餘數 1
    const baseShare = Math.floor(totalAmount / n);
    const remainder = totalAmount % n;

    // 計算每人應付額（share）與淨餘額 balance = paid - share
    // 正值：應收（先墊多了）；負值：應付（少墊了）
    const memberSummary = members.map((m, idx) => {
      const share = baseShare + (idx < remainder ? 1 : 0);
      const paid = paidMap[m];
      const balance = paid - share;
      return { member: m, paid, share, balance };
    });

    // 3. 債務清償配對（貪婪配對最少筆數轉帳）
    const debtors = [];  // balance < 0，需要付款
    const creditors = []; // balance > 0，需要收款

    memberSummary.forEach(item => {
      if (item.balance < 0) {
        debtors.push({ member: item.member, amount: Math.abs(item.balance) });
      } else if (item.balance > 0) {
        creditors.push({ member: item.member, amount: item.balance });
      }
    });

    const transfers = [];
    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];
      const transferAmount = Math.min(debtor.amount, creditor.amount);

      if (transferAmount > 0) {
        transfers.push({
          from: debtor.member,
          to: creditor.member,
          amount: transferAmount
        });
      }

      debtor.amount -= transferAmount;
      creditor.amount -= transferAmount;

      if (debtor.amount === 0) dIdx++;
      if (creditor.amount === 0) cIdx++;
    }

    return {
      totalAmount,
      averagePerPerson: baseShare,
      remainder,
      transfers,
      memberSummary
    };
  }

  function renderSettlement() {
    const trip = state.trips.find(t => t.id === state.currentTripId);
    if (!trip) return;

    const currentExpenses = getCurrentTripExpenses();
    const unit = getCurrencyUnit(trip.currency);
    const settlement = calculateSettlement(trip, currentExpenses);

    clearElement(dom.settlementResultContainer);

    if (settlement.totalAmount === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'empty-state';
      emptyEl.textContent = '此旅程尚無任何支出記錄，無需結算。';
      dom.settlementResultContainer.appendChild(emptyEl);
      dom.settlementResultContainer.style.display = 'block';
      return;
    }

    // 平均花費小卡
    const summaryBox = document.createElement('div');
    summaryBox.className = 'settlement-summary-box';

    const avgTitle = document.createElement('div');
    avgTitle.className = 'settlement-avg-title';
    avgTitle.textContent = `每人平均花費（共 ${trip.members.length} 人平分）`;

    const avgVal = document.createElement('div');
    avgVal.className = 'settlement-avg-value';
    if (settlement.remainder === 0) {
      avgVal.textContent = `${settlement.averagePerPerson.toLocaleString('zh-TW')} ${unit}`;
    } else {
      avgVal.textContent = `約 ${settlement.averagePerPerson.toLocaleString('zh-TW')} ${unit}（總額整數平分，餘數 ${settlement.remainder} ${unit}）`;
    }

    summaryBox.appendChild(avgTitle);
    summaryBox.appendChild(avgVal);
    dom.settlementResultContainer.appendChild(summaryBox);

    // 誰該給誰多少錢列表
    const transferTitle = document.createElement('h4');
    transferTitle.style.fontSize = '0.95rem';
    transferTitle.style.fontWeight = '600';
    transferTitle.style.margin = '10px 0 6px 0';
    transferTitle.textContent = '結算建議（誰該給誰多少錢）：';
    dom.settlementResultContainer.appendChild(transferTitle);

    const transferList = document.createElement('div');
    transferList.className = 'settlement-transfer-list';

    if (settlement.transfers.length === 0) {
      const doneEl = document.createElement('div');
      doneEl.className = 'empty-state';
      doneEl.textContent = '大家付的金額剛好平分，無人需要額外轉帳！';
      transferList.appendChild(doneEl);
    } else {
      settlement.transfers.forEach(t => {
        const item = document.createElement('div');
        item.className = 'transfer-item';

        // 格式對齊驗收條件：「小華 應給 小明 200 元」
        const textSpan = document.createElement('span');
        textSpan.textContent = `${t.from} 應給 ${t.to} `;

        const amountSpan = document.createElement('span');
        amountSpan.className = 'transfer-highlight';
        amountSpan.textContent = `${t.amount.toLocaleString('zh-TW')} ${unit}`;

        item.appendChild(textSpan);
        item.appendChild(amountSpan);
        transferList.appendChild(item);
      });
    }

    dom.settlementResultContainer.appendChild(transferList);
    dom.settlementResultContainer.style.display = 'block';
  }

  function handleToggleSettlement() {
    if (dom.settlementResultContainer.style.display === 'none' || dom.settlementResultContainer.style.display === '') {
      renderSettlement();
      // 平滑滾動至結算區塊
      dom.settlementResultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      dom.settlementResultContainer.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // 事件監聽綁定
  // ---------------------------------------------------------------------------
  function initEvents() {
    dom.formCreateTrip.addEventListener('submit', handleCreateTrip);
    dom.formAddExpense.addEventListener('submit', handleAddExpense);
    dom.btnBackToTrips.addEventListener('click', () => switchView('list'));
    dom.btnViewSettlement.addEventListener('click', handleToggleSettlement);
    dom.appHeaderTitle.addEventListener('click', () => switchView('list'));
  }

  // ---------------------------------------------------------------------------
  // 程式初始化
  // ---------------------------------------------------------------------------
  function init() {
    loadFromStorage();
    initEvents();
    renderTripList();
  }

  // DOM 載入後啟動
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
