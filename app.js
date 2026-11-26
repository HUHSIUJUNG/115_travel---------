/**
 * 旅帳通 (Travel Split) - 核心應用程式邏輯 (localStorage 版)
 * 規則遵循：
 * 1. 純原生 JavaScript，不依賴任何套件或框架
 * 2. 嚴格不使用 innerHTML 插入使用者輸入（使用 textContent 與 DOM 節點組裝）
 * 3. 儲存於 localStorage，key 皆加上 "trip" 前綴
 * 4. 金額全程整數儲存與計算
 */

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // 常數與設定
  // ---------------------------------------------------------------------------
  const STORAGE_KEYS = {
    TRIPS: 'trip_trips',
    EXPENSES: 'trip_expenses'
  };

  const CURRENCY_CONFIG = {
    TWD: { name: '新台幣', unit: '元' },
    JPY: { name: '日圓', unit: '円' },
    KRW: { name: '韓元', unit: '韓元' },
    USD: { name: '美元', unit: '美元' }
  };

  const EXPENSE_CATEGORIES = ['餐飲', '交通', '住宿', '購物', '門票', '其他'];
  const DEFAULT_CATEGORY = '其他';

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

  function normalizeCategory(category) {
    return EXPENSE_CATEGORIES.includes(category) ? category : DEFAULT_CATEGORY;
  }

  // ---------------------------------------------------------------------------
  // DOM 元素快取
  // ---------------------------------------------------------------------------
  const dom = {
    viewTripList: document.getElementById('viewTripList'),
    viewTripDetail: document.getElementById('viewTripDetail'),
    appHeaderTitle: document.getElementById('appHeaderTitle'),

    formCreateTrip: document.getElementById('formCreateTrip'),
    inputTripName: document.getElementById('inputTripName'),
    inputTripMembers: document.getElementById('inputTripMembers'),
    selectTripCurrency: document.getElementById('selectTripCurrency'),
    tripFormError: document.getElementById('tripFormError'),
    tripListContainer: document.getElementById('tripListContainer'),

    btnBackToTrips: document.getElementById('btnBackToTrips'),
    detailTripName: document.getElementById('detailTripName'),
    detailTripCurrencyBadge: document.getElementById('detailTripCurrencyBadge'),
    detailTripMembers: document.getElementById('detailTripMembers'),
    detailTotalAmount: document.getElementById('detailTotalAmount'),
    detailTotalCurrencyUnit: document.getElementById('detailTotalCurrencyUnit'),

    formAddExpense: document.getElementById('formAddExpense'),
    inputExpenseTitle: document.getElementById('inputExpenseTitle'),
    inputExpenseAmount: document.getElementById('inputExpenseAmount'),
    inputExpenseDate: document.getElementById('inputExpenseDate'),
    selectExpenseCategory: document.getElementById('selectExpenseCategory'),
    selectExpensePayer: document.getElementById('selectExpensePayer'),
    expenseFormError: document.getElementById('expenseFormError'),
    categorySummaryContainer: document.getElementById('categorySummaryContainer'),
    expenseListContainer: document.getElementById('expenseListContainer'),

    btnViewSettlement: document.getElementById('btnViewSettlement'),
    settlementResultContainer: document.getElementById('settlementResultContainer')
  };

  // ---------------------------------------------------------------------------
  // 畫面切換
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

    dom.formCreateTrip.reset();
    renderTripList();
    dom.tripListContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

    state.trips.forEach((trip) => {
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
      const members = Array.isArray(trip.members) ? trip.members : [];
      metaEl.textContent = `共 ${members.length} 位成員（${members.join('、')}） · 幣別：${trip.currency}`;

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
  // 旅程詳情與支出管理 (Story #2 + 功能 5 分類)
  // ---------------------------------------------------------------------------
  function openTripDetail(tripId) {
    const trip = state.trips.find((t) => t.id === tripId);
    if (!trip) {
      alert('找不到該筆旅程資料');
      return;
    }

    state.currentTripId = tripId;

    dom.detailTripName.textContent = trip.name;
    dom.detailTripCurrencyBadge.textContent = `${trip.currency} (${getCurrencyUnit(trip.currency)})`;
    dom.detailTripMembers.textContent = trip.members.join('、');
    dom.detailTotalCurrencyUnit.textContent = getCurrencyUnit(trip.currency);

    clearElement(dom.selectExpensePayer);
    trip.members.forEach((member) => {
      const opt = document.createElement('option');
      opt.value = member;
      opt.textContent = member;
      dom.selectExpensePayer.appendChild(opt);
    });

    const today = new Date().toISOString().split('T')[0];
    dom.formAddExpense.reset();
    dom.inputExpenseDate.value = today;
    dom.selectExpenseCategory.value = DEFAULT_CATEGORY;
    clearFormError(dom.expenseFormError);
    dom.settlementResultContainer.style.display = 'none';

    renderExpensesAndTotal();
    switchView('detail');
  }

  function getCurrentTripExpenses() {
    return state.expenses.filter((e) => e.tripId === state.currentTripId);
  }

  function handleAddExpense(event) {
    event.preventDefault();
    clearFormError(dom.expenseFormError);

    const trip = state.trips.find((t) => t.id === state.currentTripId);
    if (!trip) return;

    const title = dom.inputExpenseTitle.value.trim();
    const amountRaw = dom.inputExpenseAmount.value.trim();
    const date = dom.inputExpenseDate.value;
    const category = normalizeCategory(dom.selectExpenseCategory.value);
    const payer = dom.selectExpensePayer.value;

    if (!title) {
      showFormError(dom.expenseFormError, '請填寫消費項目');
      dom.inputExpenseTitle.focus();
      return;
    }

    const amount = Number(amountRaw);
    if (!amountRaw || Number.isNaN(amount) || !Number.isInteger(amount) || amount <= 0) {
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
      category,
      payer
    };

    state.expenses.unshift(newExpense);
    saveExpensesToStorage();

    dom.inputExpenseTitle.value = '';
    dom.inputExpenseAmount.value = '';
    dom.selectExpenseCategory.value = DEFAULT_CATEGORY;
    dom.inputExpenseTitle.focus();

    if (dom.settlementResultContainer.style.display !== 'none') {
      renderSettlement();
    }

    renderExpensesAndTotal();
  }

  function renderCategorySummary(currentExpenses, unit) {
    clearElement(dom.categorySummaryContainer);

    if (currentExpenses.length === 0) {
      dom.categorySummaryContainer.style.display = 'none';
      return;
    }

    const categoryTotals = {};
    EXPENSE_CATEGORIES.forEach((cat) => {
      categoryTotals[cat] = 0;
    });

    currentExpenses.forEach((exp) => {
      const cat = normalizeCategory(exp.category);
      categoryTotals[cat] += Number(exp.amount) || 0;
    });

    const titleEl = document.createElement('div');
    titleEl.className = 'category-summary-title';
    titleEl.textContent = '各分類小計';

    const gridEl = document.createElement('div');
    gridEl.className = 'category-summary-grid';

    EXPENSE_CATEGORIES.forEach((cat) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'category-summary-item';

      const nameEl = document.createElement('span');
      nameEl.className = 'category-summary-name';
      nameEl.textContent = cat;

      const amountEl = document.createElement('span');
      amountEl.className = 'category-summary-amount';
      amountEl.textContent = `${categoryTotals[cat].toLocaleString('zh-TW')} ${unit}`;

      itemEl.appendChild(nameEl);
      itemEl.appendChild(amountEl);
      gridEl.appendChild(itemEl);
    });

    dom.categorySummaryContainer.appendChild(titleEl);
    dom.categorySummaryContainer.appendChild(gridEl);
    dom.categorySummaryContainer.style.display = 'block';
  }

  function renderExpensesAndTotal() {
    const trip = state.trips.find((t) => t.id === state.currentTripId);
    if (!trip) return;

    const currentExpenses = getCurrentTripExpenses();
    const unit = getCurrencyUnit(trip.currency);

    const totalAmount = currentExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    dom.detailTotalAmount.textContent = totalAmount.toLocaleString('zh-TW');

    renderCategorySummary(currentExpenses, unit);
    clearElement(dom.expenseListContainer);

    if (currentExpenses.length === 0) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'empty-state';
      emptyBox.textContent = '目前尚無支出記錄，請透過上方表單新增第一筆支出！';
      dom.expenseListContainer.appendChild(emptyBox);
      return;
    }

    currentExpenses.forEach((exp) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'expense-item';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'expense-item-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'expense-item-title';
      titleEl.textContent = `${exp.title} - ${exp.amount} ${unit}（${exp.payer}先付）`;

      const metaEl = document.createElement('div');
      metaEl.className = 'expense-item-meta';

      const categoryBadge = document.createElement('span');
      categoryBadge.className = 'category-badge';
      categoryBadge.textContent = normalizeCategory(exp.category);

      const dateText = document.createElement('span');
      dateText.textContent = `日期：${exp.date}`;

      metaEl.appendChild(categoryBadge);
      metaEl.appendChild(dateText);

      infoDiv.appendChild(titleEl);
      infoDiv.appendChild(metaEl);

      const amountEl = document.createElement('div');
      amountEl.className = 'expense-item-amount';
      amountEl.textContent = `${Number(exp.amount).toLocaleString('zh-TW')} ${unit}`;

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
    const totalAmount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const paidMap = {};
    members.forEach((m) => { paidMap[m] = 0; });
    expenses.forEach((e) => {
      if (paidMap[e.payer] !== undefined) {
        paidMap[e.payer] += Number(e.amount) || 0;
      }
    });

    if (totalAmount === 0) {
      return {
        totalAmount: 0,
        averagePerPerson: 0,
        remainder: 0,
        transfers: [],
        memberSummary: members.map((m) => ({ member: m, paid: 0, share: 0, balance: 0 }))
      };
    }

    const baseShare = Math.floor(totalAmount / n);
    const remainder = totalAmount % n;

    const memberSummary = members.map((m, idx) => {
      const share = baseShare + (idx < remainder ? 1 : 0);
      const paid = paidMap[m];
      const balance = paid - share;
      return { member: m, paid, share, balance };
    });

    const debtors = [];
    const creditors = [];

    memberSummary.forEach((item) => {
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
    const trip = state.trips.find((t) => t.id === state.currentTripId);
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
      settlement.transfers.forEach((t) => {
        const item = document.createElement('div');
        item.className = 'transfer-item';

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
      dom.settlementResultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      dom.settlementResultContainer.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // 事件監聽綁定與初始化
  // ---------------------------------------------------------------------------
  function initEvents() {
    dom.formCreateTrip.addEventListener('submit', handleCreateTrip);
    dom.formAddExpense.addEventListener('submit', handleAddExpense);
    dom.btnBackToTrips.addEventListener('click', () => switchView('list'));
    dom.btnViewSettlement.addEventListener('click', handleToggleSettlement);
    dom.appHeaderTitle.addEventListener('click', () => switchView('list'));
  }

  function init() {
    loadFromStorage();
    initEvents();
    renderTripList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
