/**
 * 旅帳通 (Travel Split) - 核心應用程式邏輯 (Firebase Auth + Firestore 版)
 * 規則遵循：
 * 1. 純原生 JavaScript ES Module，使用 Firebase 官方 CDN，不用 npm / 框架
 * 2. 嚴格不使用 innerHTML 插入使用者輸入（使用 textContent 與 DOM 節點組裝）
 * 3. Google 登入驗證，僅 memberEmails 內的成員可讀寫對應旅程與支出
 * 4. 金額全程整數儲存與計算
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// ---------------------------------------------------------------------------
// Firebase 初始化
// ---------------------------------------------------------------------------
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// ---------------------------------------------------------------------------
// 常數與設定
// ---------------------------------------------------------------------------
const CURRENCY_CONFIG = {
  TWD: { name: '新台幣', unit: '元' },
  JPY: { name: '日圓', unit: '円' },
  KRW: { name: '韓元', unit: '韓元' },
  USD: { name: '美元', unit: '美元' }
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// 狀態管理
// ---------------------------------------------------------------------------
const state = {
  currentUser: null,
  currentUserEmail: '',
  trips: [],
  expenses: [],
  currentTripId: null,
  unsubscribeTrips: null,
  unsubscribeExpenses: null
};

// ---------------------------------------------------------------------------
// DOM 元素快取
// ---------------------------------------------------------------------------
const dom = {
  // 頁首與驗證
  appHeaderTitle: document.getElementById('appHeaderTitle'),
  userStatusBar: document.getElementById('userStatusBar'),
  userEmailDisplay: document.getElementById('userEmailDisplay'),
  btnLogout: document.getElementById('btnLogout'),
  viewAuth: document.getElementById('viewAuth'),
  btnGoogleLogin: document.getElementById('btnGoogleLogin'),
  authError: document.getElementById('authError'),

  // 視圖
  viewTripList: document.getElementById('viewTripList'),
  viewTripDetail: document.getElementById('viewTripDetail'),

  // 表單：建立旅程
  formCreateTrip: document.getElementById('formCreateTrip'),
  inputTripName: document.getElementById('inputTripName'),
  inputTripMembers: document.getElementById('inputTripMembers'),
  selectTripCurrency: document.getElementById('selectTripCurrency'),
  tripFormError: document.getElementById('tripFormError'),
  btnSubmitTrip: document.getElementById('btnSubmitTrip'),
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
  btnSubmitExpense: document.getElementById('btnSubmitExpense'),
  expenseListContainer: document.getElementById('expenseListContainer'),

  // 結算區
  btnViewSettlement: document.getElementById('btnViewSettlement'),
  settlementResultContainer: document.getElementById('settlementResultContainer')
};

// ---------------------------------------------------------------------------
// 工具函式與安全 DOM 操作（禁止 innerHTML）
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

function getCurrencyUnit(currencyCode) {
  return CURRENCY_CONFIG[currencyCode] ? CURRENCY_CONFIG[currencyCode].unit : '元';
}

function getTimestampMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

// ---------------------------------------------------------------------------
// 視圖切換
// ---------------------------------------------------------------------------
function switchView(viewName) {
  dom.viewAuth.style.display = 'none';
  dom.viewTripList.style.display = 'none';
  dom.viewTripDetail.style.display = 'none';

  if (viewName === 'auth') {
    dom.viewAuth.style.display = 'block';
  } else if (viewName === 'detail') {
    dom.viewTripDetail.style.display = 'flex';
    dom.viewTripDetail.style.flexDirection = 'column';
  } else {
    dom.viewTripList.style.display = 'block';
    detachExpensesListener();
    state.currentTripId = null;
    state.expenses = [];
  }

  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Google 登入與登出
// ---------------------------------------------------------------------------
async function handleGoogleLogin() {
  clearFormError(dom.authError);
  dom.btnGoogleLogin.disabled = true;

  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error('Google 登入失敗:', error);
    showFormError(dom.authError, '登入失敗，請確認彈出視窗未被封鎖，或檢查網路連線後再試一次。');
  } finally {
    dom.btnGoogleLogin.disabled = false;
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('登出失敗:', error);
    alert('登出失敗，請稍後再試。');
  }
}

function detachTripsListener() {
  if (state.unsubscribeTrips) {
    state.unsubscribeTrips();
    state.unsubscribeTrips = null;
  }
}

function detachExpensesListener() {
  if (state.unsubscribeExpenses) {
    state.unsubscribeExpenses();
    state.unsubscribeExpenses = null;
  }
}

// ---------------------------------------------------------------------------
// Firestore 即時監聽：旅程清單 (僅 memberEmails 包含登入者)
// ---------------------------------------------------------------------------
function subscribeToTrips() {
  detachTripsListener();

  clearElement(dom.tripListContainer);
  const loadingEl = document.createElement('div');
  loadingEl.className = 'empty-state';
  loadingEl.textContent = '載入旅程資料中...';
  dom.tripListContainer.appendChild(loadingEl);

  const tripsQuery = query(
    collection(db, 'trips'),
    where('memberEmails', 'array-contains', state.currentUserEmail)
  );

  state.unsubscribeTrips = onSnapshot(
    tripsQuery,
    (snapshot) => {
      const loadedTrips = [];
      snapshot.forEach((docSnap) => {
        loadedTrips.push({ id: docSnap.id, ...docSnap.data() });
      });

      // 由新到舊排序
      loadedTrips.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
      state.trips = loadedTrips;

      renderTripList();

      // 若目前正在旅程詳情頁，同步更新該旅程資訊
      if (state.currentTripId) {
        const activeTrip = state.trips.find((t) => t.id === state.currentTripId);
        if (!activeTrip) {
          switchView('list');
        } else {
          updateDetailHeader(activeTrip);
        }
      }
    },
    (error) => {
      console.error('讀取旅程資料失敗:', error);
      clearElement(dom.tripListContainer);
      const errEl = document.createElement('div');
      errEl.className = 'empty-state';
      errEl.textContent = '無法讀取旅程資料，請確認 Firestore 權限設定或網路連線。';
      dom.tripListContainer.appendChild(errEl);
    }
  );
}

// ---------------------------------------------------------------------------
// 旅程管理 (Story #1)
// ---------------------------------------------------------------------------
function parseMemberEmailsInput(rawText, currentUserEmail) {
  const parts = rawText ? rawText.split(/[,，、\s]+/) : [];
  const validEmails = [];
  const invalidEntries = [];
  const seen = new Set();

  if (currentUserEmail) {
    seen.add(currentUserEmail);
    validEmails.push(currentUserEmail);
  }

  for (const part of parts) {
    const trimmed = part.trim().toLowerCase();
    if (!trimmed) continue;

    if (!EMAIL_REGEX.test(trimmed)) {
      invalidEntries.push(trimmed);
      continue;
    }

    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      validEmails.push(trimmed);
    }
  }

  return { validEmails, invalidEntries };
}

async function handleCreateTrip(event) {
  event.preventDefault();
  clearFormError(dom.tripFormError);

  if (!state.currentUserEmail) {
    showFormError(dom.tripFormError, '請先登入 Google 帳號');
    return;
  }

  const name = dom.inputTripName.value.trim();
  const membersRaw = dom.inputTripMembers.value.trim();
  const currency = dom.selectTripCurrency.value;

  if (!name) {
    showFormError(dom.tripFormError, '請填寫旅程名稱');
    dom.inputTripName.focus();
    return;
  }

  const { validEmails, invalidEntries } = parseMemberEmailsInput(membersRaw, state.currentUserEmail);

  if (invalidEntries.length > 0) {
    showFormError(dom.tripFormError, `以下 Email 格式不正確：${invalidEntries.join('、')}`);
    dom.inputTripMembers.focus();
    return;
  }

  if (validEmails.length < 2) {
    showFormError(dom.tripFormError, '同行成員至少需包含您自己與另 1 位成員的 Gmail（共 2 位以上）');
    dom.inputTripMembers.focus();
    return;
  }

  dom.btnSubmitTrip.disabled = true;

  try {
    await addDoc(collection(db, 'trips'), {
      name,
      memberEmails: validEmails,
      currency,
      createdBy: state.currentUserEmail,
      createdAt: serverTimestamp()
    });

    dom.formCreateTrip.reset();
    dom.tripListContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    console.error('建立旅程失敗:', error);
    showFormError(dom.tripFormError, '建立旅程失敗，請確認網路或 Firestore 權限規則。');
  } finally {
    dom.btnSubmitTrip.disabled = false;
  }
}

function renderTripList() {
  clearElement(dom.tripListContainer);

  if (state.trips.length === 0) {
    const emptyBox = document.createElement('div');
    emptyBox.className = 'empty-state';
    emptyBox.textContent = '目前還沒有您參與的旅程，請在上方建立一筆新旅程！';
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
    const members = Array.isArray(trip.memberEmails) ? trip.memberEmails : [];
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
// 旅程詳情與支出管理 (Story #2)
// ---------------------------------------------------------------------------
function updateDetailHeader(trip) {
  const members = Array.isArray(trip.memberEmails) ? trip.memberEmails : [];
  dom.detailTripName.textContent = trip.name;
  dom.detailTripCurrencyBadge.textContent = `${trip.currency} (${getCurrencyUnit(trip.currency)})`;
  dom.detailTripMembers.textContent = members.join('、');
  dom.detailTotalCurrencyUnit.textContent = getCurrencyUnit(trip.currency);

  const previousPayer = dom.selectExpensePayer.value;
  clearElement(dom.selectExpensePayer);
  members.forEach((email) => {
    const opt = document.createElement('option');
    opt.value = email;
    opt.textContent = email;
    dom.selectExpensePayer.appendChild(opt);
  });

  if (previousPayer && members.includes(previousPayer)) {
    dom.selectExpensePayer.value = previousPayer;
  } else if (members.includes(state.currentUserEmail)) {
    dom.selectExpensePayer.value = state.currentUserEmail;
  }
}

function openTripDetail(tripId) {
  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip) {
    alert('找不到該筆旅程資料');
    return;
  }

  state.currentTripId = tripId;
  state.expenses = [];

  updateDetailHeader(trip);

  const today = new Date().toISOString().split('T')[0];
  dom.formAddExpense.reset();
  dom.inputExpenseDate.value = today;
  if (Array.isArray(trip.memberEmails) && trip.memberEmails.includes(state.currentUserEmail)) {
    dom.selectExpensePayer.value = state.currentUserEmail;
  }
  clearFormError(dom.expenseFormError);
  dom.settlementResultContainer.style.display = 'none';

  renderExpensesAndTotal();
  subscribeToExpenses(tripId);
  switchView('detail');
}

function subscribeToExpenses(tripId) {
  detachExpensesListener();

  const expensesRef = collection(db, 'trips', tripId, 'expenses');
  state.unsubscribeExpenses = onSnapshot(
    expensesRef,
    (snapshot) => {
      const loadedExpenses = [];
      snapshot.forEach((docSnap) => {
        loadedExpenses.push({ id: docSnap.id, ...docSnap.data() });
      });

      loadedExpenses.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
      state.expenses = loadedExpenses;

      renderExpensesAndTotal();

      if (dom.settlementResultContainer.style.display !== 'none') {
        renderSettlement();
      }
    },
    (error) => {
      console.error('讀取支出資料失敗:', error);
      clearElement(dom.expenseListContainer);
      const errEl = document.createElement('div');
      errEl.className = 'empty-state';
      errEl.textContent = '無法讀取支出明細，請確認權限或網路連線。';
      dom.expenseListContainer.appendChild(errEl);
    }
  );
}

async function handleAddExpense(event) {
  event.preventDefault();
  clearFormError(dom.expenseFormError);

  const trip = state.trips.find((t) => t.id === state.currentTripId);
  if (!trip || !state.currentUserEmail) return;

  const title = dom.inputExpenseTitle.value.trim();
  const amountRaw = dom.inputExpenseAmount.value.trim();
  const date = dom.inputExpenseDate.value;
  const payer = dom.selectExpensePayer.value;
  const members = Array.isArray(trip.memberEmails) ? trip.memberEmails : [];

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

  if (!payer || !members.includes(payer)) {
    showFormError(dom.expenseFormError, '請選擇有效的付款人');
    dom.selectExpensePayer.focus();
    return;
  }

  dom.btnSubmitExpense.disabled = true;

  try {
    await addDoc(collection(db, 'trips', state.currentTripId, 'expenses'), {
      title,
      amount,
      date,
      payer,
      createdBy: state.currentUserEmail,
      createdAt: serverTimestamp()
    });

    dom.inputExpenseTitle.value = '';
    dom.inputExpenseAmount.value = '';
    dom.inputExpenseTitle.focus();
  } catch (error) {
    console.error('新增支出失敗:', error);
    showFormError(dom.expenseFormError, '新增支出失敗，請確認網路或 Firestore 權限規則。');
  } finally {
    dom.btnSubmitExpense.disabled = false;
  }
}

function renderExpensesAndTotal() {
  const trip = state.trips.find((t) => t.id === state.currentTripId);
  if (!trip) return;

  const unit = getCurrencyUnit(trip.currency);
  const totalAmount = state.expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  dom.detailTotalAmount.textContent = totalAmount.toLocaleString('zh-TW');

  clearElement(dom.expenseListContainer);

  if (state.expenses.length === 0) {
    const emptyBox = document.createElement('div');
    emptyBox.className = 'empty-state';
    emptyBox.textContent = '目前尚無支出記錄，請透過上方表單新增第一筆支出！';
    dom.expenseListContainer.appendChild(emptyBox);
    return;
  }

  state.expenses.forEach((exp) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'expense-item';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'expense-item-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'expense-item-title';
    titleEl.textContent = `${exp.title} - ${exp.amount} ${unit}（${exp.payer}先付）`;

    const metaEl = document.createElement('div');
    metaEl.className = 'expense-item-meta';
    metaEl.textContent = `日期：${exp.date}`;

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
  const members = Array.isArray(trip.memberEmails) ? trip.memberEmails : [];
  const n = members.length;
  const totalAmount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  if (n === 0 || totalAmount === 0) {
    return {
      totalAmount: 0,
      averagePerPerson: 0,
      remainder: 0,
      transfers: [],
      memberSummary: members.map((m) => ({ member: m, paid: 0, share: 0, balance: 0 }))
    };
  }

  const paidMap = {};
  members.forEach((m) => { paidMap[m] = 0; });
  expenses.forEach((e) => {
    if (paidMap[e.payer] !== undefined) {
      paidMap[e.payer] += Number(e.amount) || 0;
    }
  });

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

  const members = Array.isArray(trip.memberEmails) ? trip.memberEmails : [];
  const unit = getCurrencyUnit(trip.currency);
  const settlement = calculateSettlement(trip, state.expenses);

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
  avgTitle.textContent = `每人平均花費（共 ${members.length} 人平分）`;

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
// 事件監聽綁定與登入狀態監聽
// ---------------------------------------------------------------------------
function initEvents() {
  dom.btnGoogleLogin.addEventListener('click', handleGoogleLogin);
  dom.btnLogout.addEventListener('click', handleLogout);
  dom.formCreateTrip.addEventListener('submit', handleCreateTrip);
  dom.formAddExpense.addEventListener('submit', handleAddExpense);
  dom.btnBackToTrips.addEventListener('click', () => switchView('list'));
  dom.btnViewSettlement.addEventListener('click', handleToggleSettlement);
  dom.appHeaderTitle.addEventListener('click', () => {
    if (state.currentUser) {
      switchView('list');
    }
  });
}

function initAuthObserver() {
  onAuthStateChanged(auth, (user) => {
    if (user && user.email) {
      state.currentUser = user;
      state.currentUserEmail = user.email.toLowerCase();
      dom.userEmailDisplay.textContent = state.currentUserEmail;
      dom.userStatusBar.style.display = 'flex';
      clearFormError(dom.authError);

      switchView('list');
      subscribeToTrips();
    } else {
      detachTripsListener();
      detachExpensesListener();
      state.currentUser = null;
      state.currentUserEmail = '';
      state.trips = [];
      state.expenses = [];
      state.currentTripId = null;

      dom.userEmailDisplay.textContent = '';
      dom.userStatusBar.style.display = 'none';
      switchView('auth');
    }
  });
}

function init() {
  initEvents();
  initAuthObserver();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
