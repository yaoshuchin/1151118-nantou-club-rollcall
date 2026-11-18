/**
 * 南投縣立南投國民中學 115學年度 社團點名系統
 * 核心應用程式邏輯 (app.js)
 * 密碼管制：nato
 * 活動時段：固定每週二 第7節與第8節
 */

// ==========================================
// 1. 常數與系統狀態
// ==========================================
const AUTH_KEY = 'nantou_club_auth_token_115';
const PASSWORD_CORRECT = 'nato';
const STORAGE_KEY = 'nantou_clubs_database_115_v1';

// 狀態輪替順序
const STATUS_CYCLE = ['O', 'X', '事', '病', '公', '喪', ''];

const STATUS_LABELS = {
  'O': { text: '出席', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: 'fa-check' },
  'X': { text: '缺席', bg: 'bg-rose-100 text-rose-800 border-rose-300', icon: 'fa-xmark' },
  '事': { text: '事假', bg: 'bg-amber-100 text-amber-800 border-amber-300', icon: 'fa-clock' },
  '病': { text: '病假', bg: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: 'fa-bed' },
  '公': { text: '公假', bg: 'bg-blue-100 text-blue-800 border-blue-300', icon: 'fa-briefcase' },
  '喪': { text: '喪假', bg: 'bg-slate-200 text-slate-700 border-slate-300', icon: 'fa-ribbon' },
  '':  { text: '未記', bg: 'bg-slate-50 text-slate-400 border-slate-200', icon: 'fa-minus' }
};

let appData = null;
let currentClubId = null;
let currentDate = '2026-10-06';
let searchQuery = '';
let filterStatus = 'ALL'; // ALL, PRESENT, ABSENT, LEAVE

// ==========================================
// 2. 初始化與密碼管制 (門禁)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  loadData();
  setupEventListeners();
  renderApp();
});

function initAuth() {
  const isAuth = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
  const gateEl = document.getElementById('password-gate');
  const mainAppEl = document.getElementById('main-app');

  if (isAuth === 'true') {
    if (gateEl) gateEl.classList.add('hidden');
    if (mainAppEl) mainAppEl.classList.remove('hidden');
  } else {
    if (gateEl) gateEl.classList.remove('hidden');
    if (mainAppEl) mainAppEl.classList.add('hidden');
    setTimeout(() => {
      const pwdInput = document.getElementById('pwd-input');
      if (pwdInput) pwdInput.focus();
    }, 200);
  }
}

function verifyPassword() {
  const pwdInput = document.getElementById('pwd-input');
  const errorEl = document.getElementById('pwd-error');
  const cardEl = document.getElementById('pwd-card');
  const rememberCheckbox = document.getElementById('pwd-remember');
  
  if (!pwdInput) return;
  const val = pwdInput.value.trim().toLowerCase();

  if (val === PASSWORD_CORRECT) {
    if (rememberCheckbox && rememberCheckbox.checked) {
      localStorage.setItem(AUTH_KEY, 'true');
    } else {
      sessionStorage.setItem(AUTH_KEY, 'true');
    }
    
    // Smooth transition
    cardEl.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      document.getElementById('password-gate').classList.add('hidden');
      document.getElementById('main-app').classList.remove('hidden');
      cardEl.classList.remove('scale-95', 'opacity-0');
      showToast('🎉 通行碼驗證成功，歡迎使用南投國中社團點名系統！', 'success');
    }, 250);
  } else {
    cardEl.classList.remove('shake');
    void cardEl.offsetWidth; // trigger reflow
    cardEl.classList.add('shake');
    if (errorEl) {
      errorEl.textContent = '❌ 通行密碼不正確，請重新輸入！(提示: nato)';
      errorEl.classList.remove('hidden');
    }
    pwdInput.value = '';
    pwdInput.focus();
  }
}

function logout() {
  if (confirm('確定要登出並鎖定社團點名系統嗎？')) {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
    location.reload();
  }
}

// ==========================================
// 3. 資料載入與持久化 (LocalStorage)
// ==========================================
function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      appData = JSON.parse(saved);
    } else if (typeof INITIAL_CLUBS_DATA !== 'undefined') {
      appData = JSON.parse(JSON.stringify(INITIAL_CLUBS_DATA));
      saveData();
    } else {
      console.error('No initial data available');
    }
  } catch (e) {
    console.error('Error loading data:', e);
    if (typeof INITIAL_CLUBS_DATA !== 'undefined') {
      appData = JSON.parse(JSON.stringify(INITIAL_CLUBS_DATA));
    }
  }

  // 設定預設社團與日期
  if (appData && appData.clubs && appData.clubs.length > 0) {
    currentClubId = appData.clubs[0].id;
    // 預設選擇最近的週二日期
    if (appData.tuesdayDates && appData.tuesdayDates.length > 0) {
      currentDate = appData.tuesdayDates[0];
    }
  }
}

function saveData() {
  if (!appData) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    updateLastSavedIndicator();
  } catch (e) {
    console.error('Error saving data:', e);
    showToast('⚠️ 瀏覽器本機儲存空間不足或發生錯誤！', 'error');
  }
}

function updateLastSavedIndicator() {
  const el = document.getElementById('save-status-indicator');
  if (el) {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    el.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>已自動儲存 (${timeStr})`;
  }
}

function resetToDefault() {
  if (confirm('⚠️ 警告：確定要將所有社團點名資料「重置回原始匯入狀態」嗎？\n所有自訂點名紀錄與修改將會被覆蓋！')) {
    if (typeof INITIAL_CLUBS_DATA !== 'undefined') {
      appData = JSON.parse(JSON.stringify(INITIAL_CLUBS_DATA));
      saveData();
      renderApp();
      showToast('🔄 已成功重設所有社團資料回原始狀態！', 'info');
    }
  }
}

// ==========================================
// 4. 週二日期嚴格管制與輔助運算
// ==========================================
/**
 * 檢查日期是否為週二
 * @param {string} dateStr YYYY-MM-DD
 * @returns {boolean}
 */
function isTuesday(dateStr) {
  if (!dateStr) return false;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.getDay() === 2; // 0=Sun, 1=Mon, 2=Tue
}

/**
 * 自動將任意日期調整為最接近的週二
 * @param {string} dateStr YYYY-MM-DD
 * @returns {string} YYYY-MM-DD
 */
function snapToTuesday(dateStr) {
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const day = d.getDay();
  const diff = 2 - day; // 距離週二差距
  d.setDate(d.getDate() + diff);
  
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dt = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dt}`;
}

/**
 * 轉民國年格式 (如: 115/10/20 週二)
 */
function formatRocDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const rocYear = parseInt(parts[0]) - 1911;
  const m = parseInt(parts[1]);
  const d = parseInt(parts[2]);
  return `民國${rocYear}年${m}月${d}日 (週二)`;
}

function formatShortRoc(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

// ==========================================
// 5. 事件監聽設置
// ==========================================
function setupEventListeners() {
  // 通行密碼輸入
  const pwdInput = document.getElementById('pwd-input');
  if (pwdInput) {
    pwdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyPassword();
    });
  }
  const pwdBtn = document.getElementById('pwd-btn');
  if (pwdBtn) pwdBtn.addEventListener('click', verifyPassword);

  const pwdToggle = document.getElementById('pwd-toggle');
  if (pwdToggle && pwdInput) {
    pwdToggle.addEventListener('click', () => {
      const type = pwdInput.type === 'password' ? 'text' : 'password';
      pwdInput.type = type;
      pwdToggle.innerHTML = type === 'password' ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
    });
  }

  // 登出按鈕
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // 搜尋學生
  const searchInput = document.getElementById('student-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderStudentList();
    });
  }

  // 出席篩選
  const filterSelect = document.getElementById('filter-status-select');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      filterStatus = e.target.value;
      renderStudentList();
    });
  }

  // 週二日期下拉選擇
  const dateSelect = document.getElementById('date-select');
  if (dateSelect) {
    dateSelect.addEventListener('change', (e) => {
      currentDate = e.target.value;
      renderApp();
    });
  }

  // 前一週與後一週按鈕
  const prevDateBtn = document.getElementById('btn-prev-date');
  if (prevDateBtn) {
    prevDateBtn.addEventListener('click', () => navigateDate(-1));
  }
  const nextDateBtn = document.getElementById('btn-next-date');
  if (nextDateBtn) {
    nextDateBtn.addEventListener('click', () => navigateDate(1));
  }

  // 新增/自訂週二日期
  const addDateBtn = document.getElementById('btn-add-custom-date');
  if (addDateBtn) {
    addDateBtn.addEventListener('click', promptAddCustomDate);
  }

  // 一鍵全部出席
  const btnAllPresent = document.getElementById('btn-all-present');
  if (btnAllPresent) {
    btnAllPresent.addEventListener('click', markAllPresent);
  }

  // 一鍵第8節同步第7節
  const btnSyncP8 = document.getElementById('btn-sync-p8');
  if (btnSyncP8) {
    btnSyncP8.addEventListener('click', syncPeriod7ToPeriod8);
  }

  // 一鍵清除當日點名
  const btnClearDate = document.getElementById('btn-clear-date');
  if (btnClearDate) {
    btnClearDate.addEventListener('click', clearCurrentDateAttendance);
  }

  // 新增學生按鈕
  const btnAddStudent = document.getElementById('btn-add-student');
  if (btnAddStudent) {
    btnAddStudent.addEventListener('click', showAddStudentModal);
  }

  // 匯出 Excel (本社)
  const btnExportClubExcel = document.getElementById('btn-export-club-excel');
  if (btnExportClubExcel) {
    btnExportClubExcel.addEventListener('click', exportCurrentClubExcel);
  }

  // 匯出 Excel (全校所有社團活頁簿)
  const btnExportAllExcel = document.getElementById('btn-export-all-excel');
  if (btnExportAllExcel) {
    btnExportAllExcel.addEventListener('click', exportAllClubsWorkbook);
  }

  // 匯出 CSV
  const btnExportCsv = document.getElementById('btn-export-csv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportCurrentClubCsv);
  }

  // 列印 / PDF
  const btnPrint = document.getElementById('btn-print-view');
  if (btnPrint) {
    btnPrint.addEventListener('click', triggerPrint);
  }

  // 資料管理 (備份/還原/重設)
  const btnBackup = document.getElementById('btn-backup-json');
  if (btnBackup) {
    btnBackup.addEventListener('click', exportBackupJson);
  }

  const btnRestore = document.getElementById('btn-restore-json');
  const fileRestoreInput = document.getElementById('file-restore-input');
  if (btnRestore && fileRestoreInput) {
    btnRestore.addEventListener('click', () => fileRestoreInput.click());
    fileRestoreInput.addEventListener('change', importBackupJson);
  }

  const btnReset = document.getElementById('btn-reset-default');
  if (btnReset) {
    btnReset.addEventListener('click', resetToDefault);
  }
}

// ==========================================
// 6. 介面渲染核心
// ==========================================
function renderApp() {
  if (!appData) return;

  renderClubTabs();
  renderDateSelector();
  renderClubHeader();
  renderStudentList();
  renderStatsDashboard();
}

/**
 * 渲染頂部社團標籤卡片
 */
function renderClubTabs() {
  const container = document.getElementById('club-tabs-container');
  if (!container || !appData.clubs) return;

  container.innerHTML = appData.clubs.map(club => {
    const isActive = club.id === currentClubId;
    const activeClasses = isActive
      ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400 font-semibold border-blue-600'
      : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 hover:border-slate-300';
    
    return `
      <button 
        onclick="switchClub('${club.id}')"
        class="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition-all duration-150 shrink-0 ${activeClasses}"
      >
        <span class="w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-blue-500'}"></span>
        <span class="truncate">${club.name}</span>
        <span class="text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-500'}">
          ${club.studentCount}人
        </span>
      </button>
    `;
  }).join('');
}

function switchClub(clubId) {
  currentClubId = clubId;
  const club = getCurrentClub();
  // Check if current date is in club's activeDates
  if (club && club.activeDates && !club.activeDates.includes(currentDate)) {
    currentDate = club.activeDates[0];
  }
  renderApp();
}

function getCurrentClub() {
  if (!appData || !appData.clubs) return null;
  return appData.clubs.find(c => c.id === currentClubId) || appData.clubs[0];
}

/**
 * 渲染週二日期下拉選單
 */
function renderDateSelector() {
  const select = document.getElementById('date-select');
  const club = getCurrentClub();
  if (!select || !club) return;

  const dates = club.activeDates || appData.tuesdayDates || [];
  
  select.innerHTML = dates.map(d => {
    const isSelected = d === currentDate;
    const label = `${formatRocDate(d)} - 第7、8節`;
    return `<option value="${d}" ${isSelected ? 'selected' : ''}>${label}</option>`;
  }).join('');

  // 更新當前日期標題文字
  const dateTitleEl = document.getElementById('current-date-title');
  if (dateTitleEl) {
    dateTitleEl.innerHTML = `
      <i class="fa-regular fa-calendar-check text-blue-600 mr-2"></i>
      <span class="font-bold text-slate-800">${formatRocDate(currentDate)}</span>
      <span class="text-xs bg-blue-100 text-blue-800 font-semibold px-2.5 py-0.5 rounded-full ml-2">固定週二 第7節 & 第8節</span>
    `;
  }
}

/**
 * 日期前後切換
 */
function navigateDate(direction) {
  const club = getCurrentClub();
  if (!club) return;
  const dates = club.activeDates || appData.tuesdayDates || [];
  const idx = dates.indexOf(currentDate);
  if (idx !== -1) {
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < dates.length) {
      currentDate = dates[nextIdx];
      renderApp();
    } else {
      showToast(direction > 0 ? '已達最後一週活動日期' : '已達第一週活動日期', 'info');
    }
  }
}

/**
 * 自訂/新增週二日期 (嚴格限定每週二)
 */
function promptAddCustomDate() {
  const input = prompt('請輸入要新增或自訂的社團活動日期 (格式: YYYY-MM-DD)：\n⚠️ 南投國中規定：社團點名日期一律固定為「每週二」！', currentDate);
  if (!input) return;

  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    alert('❌ 日期格式不正確！請依 YYYY-MM-DD 格式輸入（例如 2026-11-24）');
    return;
  }

  let finalDate = trimmed;
  if (!isTuesday(trimmed)) {
    finalDate = snapToTuesday(trimmed);
    alert(`⚠️ 您輸入的日期 (${trimmed}) 並非週二！\n系統已依南投國中社團規定，自動調整為最近之【週二】：${finalDate} (${formatRocDate(finalDate)})`);
  }

  const club = getCurrentClub();
  if (club) {
    if (!club.activeDates.includes(finalDate)) {
      club.activeDates.push(finalDate);
      club.activeDates.sort();
    }
  }
  if (!appData.tuesdayDates.includes(finalDate)) {
    appData.tuesdayDates.push(finalDate);
    appData.tuesdayDates.sort();
  }

  currentDate = finalDate;
  saveData();
  renderApp();
  showToast(`📅 已成功切換至週二日期：${formatRocDate(finalDate)}`, 'success');
}

/**
 * 渲染社團詳細資訊表頭
 */
function renderClubHeader() {
  const club = getCurrentClub();
  if (!club) return;

  const nameEl = document.getElementById('club-info-name');
  const teacherEl = document.getElementById('club-info-teacher');
  const locationEl = document.getElementById('club-info-location');
  const feeEl = document.getElementById('club-info-fee');
  const officerEl = document.getElementById('club-info-officer');

  if (nameEl) nameEl.textContent = club.name;
  if (teacherEl) teacherEl.textContent = club.teacher || '未指定';
  if (locationEl) locationEl.textContent = club.location || '校內指定教室';
  if (feeEl) feeEl.textContent = club.fee || '無';

  if (officerEl) {
    const officers = club.officers || [];
    if (officers.length > 0) {
      officerEl.innerHTML = officers.map((o, idx) => {
        const title = idx === 0 ? '👑 社長' : (idx === 1 ? '副社' : '幹部');
        const badgeColor = idx === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700';
        return `<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${badgeColor}">
          ${title}: ${o.name || (o.class + '-' + o.seat)}
        </span>`;
      }).join(' ');
    } else {
      officerEl.innerHTML = '<span class="text-xs text-slate-400">尚無幹部登記</span>';
    }
  }
}

/**
 * 渲染學生點名名單表格
 */
function renderStudentList() {
  const club = getCurrentClub();
  const tableBody = document.getElementById('students-table-body');
  const countBadge = document.getElementById('filtered-count-badge');
  if (!club || !tableBody) return;

  let students = club.students || [];

  // 關鍵字搜尋過濾
  if (searchQuery) {
    students = students.filter(s => 
      s.name.toLowerCase().includes(searchQuery) ||
      s.class.toLowerCase().includes(searchQuery) ||
      String(s.seat).includes(searchQuery)
    );
  }

  // 出席狀態過濾
  if (filterStatus !== 'ALL') {
    students = students.filter(s => {
      const att = s.attendance[currentDate] || { p7: '', p8: '' };
      if (filterStatus === 'PRESENT') return att.p7 === 'O' && att.p8 === 'O';
      if (filterStatus === 'ABSENT') return att.p7 === 'X' || att.p8 === 'X';
      if (filterStatus === 'LEAVE') return ['事', '病', '公', '喪'].includes(att.p7) || ['事', '病', '公', '喪'].includes(att.p8);
      return true;
    });
  }

  if (countBadge) {
    countBadge.textContent = `共 ${students.length} / ${club.studentCount} 人`;
  }

  if (students.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-12 text-slate-400">
          <i class="fa-solid fa-user-slash text-3xl mb-2 block"></i>
          沒有符合條件的學生名單
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = students.map((s, idx) => {
    const att = s.attendance[currentDate] || { p7: 'O', p8: 'O', note: '' };
    const p7Meta = STATUS_LABELS[att.p7] || STATUS_LABELS[''];
    const p8Meta = STATUS_LABELS[att.p8] || STATUS_LABELS[''];
    const isPres = s.role === '社長' || (s.role && s.role.includes('社'));

    return `
      <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100 student-row" data-student-num="${s.num}">
        <!-- 序號 -->
        <td class="px-3 py-3 text-center text-xs font-mono text-slate-400">
          ${s.num || idx + 1}
        </td>

        <!-- 班級座號 -->
        <td class="px-3 py-3 text-center whitespace-nowrap">
          <span class="inline-flex items-center gap-1 font-mono text-sm font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
            ${s.class}班 ${s.seat}號
          </span>
        </td>

        <!-- 姓名與幹部 -->
        <td class="px-4 py-3 whitespace-nowrap">
          <div class="flex items-center gap-1.5">
            <span class="font-bold text-slate-800 text-base">${s.name}</span>
            ${isPres ? '<span class="text-xs bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded shadow-sm">👑社長</span>' : ''}
            ${s.gender ? `<span class="text-xs text-slate-400 ml-1">(${s.gender})</span>` : ''}
          </div>
        </td>

        <!-- 第7節 點名狀態 -->
        <td class="px-3 py-3 text-center">
          <button 
            type="button"
            onclick="cycleStatus('${club.id}', ${s.num}, 'p7')"
            title="點擊切換狀態 (O出席 / X缺席 / 事 / 病 / 公 / 喪)"
            class="status-btn px-3 py-1.5 rounded-lg border text-sm font-bold shadow-sm inline-flex items-center gap-1.5 ${p7Meta.bg}"
          >
            <i class="fa-solid ${p7Meta.icon} text-xs"></i>
            <span>${p7Meta.text}</span>
            <span class="font-mono text-xs opacity-75">(${att.p7 || '無'})</span>
          </button>
        </td>

        <!-- 第8節 點名狀態 -->
        <td class="px-3 py-3 text-center">
          <button 
            type="button"
            onclick="cycleStatus('${club.id}', ${s.num}, 'p8')"
            title="點擊切換狀態 (O出席 / X缺席 / 事 / 病 / 公 / 喪)"
            class="status-btn px-3 py-1.5 rounded-lg border text-sm font-bold shadow-sm inline-flex items-center gap-1.5 ${p8Meta.bg}"
          >
            <i class="fa-solid ${p8Meta.icon} text-xs"></i>
            <span>${p8Meta.text}</span>
            <span class="font-mono text-xs opacity-75">(${att.p8 || '無'})</span>
          </button>
        </td>

        <!-- 違規與課堂備註 -->
        <td class="px-3 py-3">
          <input 
            type="text" 
            value="${escapeHtml(att.note || '')}" 
            placeholder="點擊輸入課堂紀律/違規/表現備註..."
            onblur="updateStudentNote('${club.id}', ${s.num}, this.value)"
            class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition bg-white"
          />
        </td>

        <!-- 操作 -->
        <td class="px-3 py-3 text-center whitespace-nowrap">
          <button 
            type="button"
            onclick="syncStudentP7ToP8('${club.id}', ${s.num})"
            title="第8節同步第7節"
            class="text-xs text-blue-600 hover:text-blue-800 p-1.5 hover:bg-blue-50 rounded"
          >
            <i class="fa-solid fa-arrows-rotate"></i> 同步8節
          </button>
          <button 
            type="button"
            onclick="editStudent('${club.id}', ${s.num})"
            title="編輯學生"
            class="text-xs text-slate-500 hover:text-slate-800 p-1.5 hover:bg-slate-100 rounded ml-1"
          >
            <i class="fa-solid fa-pen"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 輪替切換點名狀態
 */
function cycleStatus(clubId, studentNum, period) {
  const club = appData.clubs.find(c => c.id === clubId);
  if (!club) return;
  const student = club.students.find(s => s.num === studentNum);
  if (!student) return;

  if (!student.attendance[currentDate]) {
    student.attendance[currentDate] = { p7: 'O', p8: 'O', note: '' };
  }

  const currentVal = student.attendance[currentDate][period] || '';
  const idx = STATUS_CYCLE.indexOf(currentVal);
  const nextVal = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];

  student.attendance[currentDate][period] = nextVal;
  saveData();
  renderStudentList();
  renderStatsDashboard();
}

/**
 * 個別學生第8節同步第7節
 */
function syncStudentP7ToP8(clubId, studentNum) {
  const club = appData.clubs.find(c => c.id === clubId);
  if (!club) return;
  const student = club.students.find(s => s.num === studentNum);
  if (!student || !student.attendance[currentDate]) return;

  student.attendance[currentDate].p8 = student.attendance[currentDate].p7;
  saveData();
  renderStudentList();
  renderStatsDashboard();
}

/**
 * 更新違規與備註文字
 */
function updateStudentNote(clubId, studentNum, noteText) {
  const club = appData.clubs.find(c => c.id === clubId);
  if (!club) return;
  const student = club.students.find(s => s.num === studentNum);
  if (!student) return;

  if (!student.attendance[currentDate]) {
    student.attendance[currentDate] = { p7: 'O', p8: 'O', note: '' };
  }
  student.attendance[currentDate].note = noteText.trim();
  saveData();
}

// ==========================================
// 7. 批次操作 (一鍵出席 / 同步 / 清除)
// ==========================================
function markAllPresent() {
  const club = getCurrentClub();
  if (!club) return;

  club.students.forEach(s => {
    if (!s.attendance[currentDate]) {
      s.attendance[currentDate] = { p7: 'O', p8: 'O', note: '' };
    } else {
      s.attendance[currentDate].p7 = 'O';
      s.attendance[currentDate].p8 = 'O';
    }
  });

  saveData();
  renderStudentList();
  renderStatsDashboard();
  showToast(`✅ ${club.name} 全體 ${club.studentCount} 位學生已標記為【全部出席 (O)】`, 'success');
}

function syncPeriod7ToPeriod8() {
  const club = getCurrentClub();
  if (!club) return;

  club.students.forEach(s => {
    if (s.attendance[currentDate]) {
      s.attendance[currentDate].p8 = s.attendance[currentDate].p7;
    }
  });

  saveData();
  renderStudentList();
  renderStatsDashboard();
  showToast(`🔄 已成功將第 7 節點名狀態全部同步至第 8 節！`, 'info');
}

function clearCurrentDateAttendance() {
  const club = getCurrentClub();
  if (!club) return;

  if (confirm(`確定要清除【${club.name}】在【${formatRocDate(currentDate)}】的所有點名紀錄嗎？`)) {
    club.students.forEach(s => {
      s.attendance[currentDate] = { p7: '', p8: '', note: '' };
    });

    saveData();
    renderStudentList();
    renderStatsDashboard();
    showToast(`🧹 已清除本日點名紀錄`, 'info');
  }
}

// ==========================================
// 8. 即時統計看板
// ==========================================
function renderStatsDashboard() {
  const club = getCurrentClub();
  if (!club) return;

  const total = club.students.length;
  let p7Present = 0, p7Absent = 0, p7Leave = 0;
  let p8Present = 0, p8Absent = 0, p8Leave = 0;

  club.students.forEach(s => {
    const att = s.attendance[currentDate] || { p7: '', p8: '' };
    if (att.p7 === 'O') p7Present++;
    else if (att.p7 === 'X') p7Absent++;
    else if (['事', '病', '公', '喪'].includes(att.p7)) p7Leave++;

    if (att.p8 === 'O') p8Present++;
    else if (att.p8 === 'X') p8Absent++;
    else if (['事', '病', '公', '喪'].includes(att.p8)) p8Leave++;
  });

  const p7Rate = total > 0 ? Math.round((p7Present / total) * 100) : 0;
  const p8Rate = total > 0 ? Math.round((p8Present / total) * 100) : 0;

  document.getElementById('stat-total-students').textContent = total;
  document.getElementById('stat-p7-present').textContent = p7Present;
  document.getElementById('stat-p7-absent').textContent = p7Absent;
  document.getElementById('stat-p7-leave').textContent = p7Leave;
  document.getElementById('stat-p7-rate').textContent = `${p7Rate}%`;

  document.getElementById('stat-p8-present').textContent = p8Present;
  document.getElementById('stat-p8-absent').textContent = p8Absent;
  document.getElementById('stat-p8-leave').textContent = p8Leave;
  document.getElementById('stat-p8-rate').textContent = `${p8Rate}%`;

  const barEl = document.getElementById('stat-rate-bar');
  if (barEl) {
    const avgRate = Math.round((p7Rate + p8Rate) / 2);
    barEl.style.width = `${avgRate}%`;
  }
}

// ==========================================
// 9. 學生名單管理 (新增/編輯/刪除)
// ==========================================
function showAddStudentModal() {
  const club = getCurrentClub();
  if (!club) return;

  const cls = prompt('請輸入學生班級代碼 (如 701, 802)：');
  if (!cls) return;
  const seat = prompt('請輸入學生座號 (如 12)：');
  if (!seat) return;
  const name = prompt('請輸入學生真實姓名：');
  if (!name) return;
  const gender = prompt('請輸入性別 (男 / 女)：', '男');
  const isPres = confirm('該名學生是否為【社長 / 幹部】？');

  const newNum = club.students.length > 0 ? Math.max(...club.students.map(s => s.num || 0)) + 1 : 1;
  const newStudent = {
    num: newNum,
    class: cls.trim(),
    seat: seat.trim(),
    name: name.trim(),
    gender: gender ? gender.trim() : '',
    role: isPres ? '社長' : '',
    attendance: {
      [currentDate]: { p7: 'O', p8: 'O', note: '' }
    }
  };

  club.students.push(newStudent);
  club.studentCount = club.students.length;
  if (isPres) {
    club.officers.push({ class: cls.trim(), seat: seat.trim(), name: name.trim() });
  }

  saveData();
  renderApp();
  showToast(`👤 已成功新增學生：${name} (${cls}班${seat}號)`, 'success');
}

function editStudent(clubId, studentNum) {
  const club = appData.clubs.find(c => c.id === clubId);
  if (!club) return;
  const s = club.students.find(st => st.num === studentNum);
  if (!s) return;

  const newName = prompt('修改學生姓名：', s.name);
  if (!newName) return;
  const newClass = prompt('修改學生班級：', s.class);
  const newSeat = prompt('修改學生座號：', s.seat);
  const newGender = prompt('修改學生性別 (男/女)：', s.gender);
  const isPres = confirm(`該生是否為幹部？\n目前狀態：${s.role || '一般社員'}`);

  s.name = newName.trim();
  if (newClass) s.class = newClass.trim();
  if (newSeat) s.seat = newSeat.trim();
  if (newGender) s.gender = newGender.trim();
  s.role = isPres ? '社長' : '';

  saveData();
  renderApp();
  showToast('✏️ 學生基本資料修改完成！', 'success');
}

// ==========================================
// 10. 匯出 Excel (本社點名單 / 全校各社活頁簿)
// ==========================================
function exportCurrentClubExcel() {
  const club = getCurrentClub();
  if (!club || typeof XLSX === 'undefined') {
    showToast('⚠️ SheetJS 程式庫尚未載入完成！', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();
  const ws = buildClubWorksheet(club);
  XLSX.utils.book_append_sheet(wb, ws, club.name.slice(0, 31));

  const fileName = `南投國中115社團點名單_${club.name}_${currentDate}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast(`📥 已成功匯出 Excel：${fileName}`, 'success');
}

function exportAllClubsWorkbook() {
  if (!appData || !appData.clubs || typeof XLSX === 'undefined') {
    showToast('⚠️ SheetJS 程式庫尚未載入完成！', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();

  appData.clubs.forEach(club => {
    const ws = buildClubWorksheet(club);
    // Excel sheet name max 31 chars and no illegal characters
    const cleanName = club.name.replace(/[\\/?*[\]]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, cleanName);
  });

  const fileName = `南投國中115學年度_各社團點名簿_全校完整版_${currentDate}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast(`📥 已成功匯出全校 13 個社團完整 Excel 活頁簿！`, 'success');
}

/**
 * 依據南投國中標準格式產生社團 Worksheet
 */
function buildClubWorksheet(club) {
  const dates = club.activeDates || appData.tuesdayDates || [];
  const rows = [];

  // Row 1: 大標題
  rows.push([`南投國中 115學年度 社團點名單 -【${club.name}】`]);

  // Row 2: 詮釋資料
  rows.push([`指導教師: ${club.teacher}  地點: ${club.location}  費用: ${club.fee}  時間: 週二第7-8節請老師確實點名。出席O 缺席X`]);

  // Row 3: 日期橫列
  const row3 = ['', '', '', '', ''];
  dates.forEach(d => {
    row3.push(formatShortRoc(d));
    row3.push('');
    row3.push('');
  });
  rows.push(row3);

  // Row 4: 欄位標題
  const row4 = ['序號', '班級', '座號', '姓名', '性別'];
  dates.forEach(() => {
    row4.push('7');
    row4.push('8');
    row4.push('違規');
  });
  rows.push(row4);

  // Row 5+: 學生資料與點名
  club.students.forEach((s, idx) => {
    const sRow = [
      s.num || idx + 1,
      s.class,
      s.seat,
      s.role ? `${s.name}(${s.role})` : s.name,
      s.gender
    ];

    dates.forEach(d => {
      const att = s.attendance[d] || { p7: '', p8: '', note: '' };
      sRow.push(att.p7 || '');
      sRow.push(att.p8 || '');
      sRow.push(att.note || '');
    });

    rows.push(sRow);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // 設定欄寬
  ws['!cols'] = [
    { wch: 6 },  // 序號
    { wch: 8 },  // 班級
    { wch: 8 },  // 座號
    { wch: 14 }, // 姓名
    { wch: 6 }   // 性別
  ];
  dates.forEach(() => {
    ws['!cols'].push({ wch: 5 });  // 7
    ws['!cols'].push({ wch: 5 });  // 8
    ws['!cols'].push({ wch: 12 }); // 違規
  });

  return ws;
}

// ==========================================
// 11. 匯出 CSV (UTF-8 BOM)
// ==========================================
function exportCurrentClubCsv() {
  const club = getCurrentClub();
  if (!club) return;

  const dates = club.activeDates || appData.tuesdayDates || [];
  let csv = '\uFEFF'; // UTF-8 BOM
  csv += `南投國中 115學年度 社團點名單 -【${club.name}】\n`;
  csv += `指導教師: ${club.teacher},地點: ${club.location},費用: ${club.fee},活動時間: 每週二第7-8節\n`;

  // 日期列
  const dateHeader = ['', '', '', '', ''];
  dates.forEach(d => {
    dateHeader.push(`"${formatShortRoc(d)}"`, '""', '""');
  });
  csv += dateHeader.join(',') + '\n';

  // 欄位標題
  const subHeader = ['序號', '班級', '座號', '姓名', '性別'];
  dates.forEach(() => {
    subHeader.push('第7節', '第8節', '違規/備註');
  });
  csv += subHeader.join(',') + '\n';

  // 學生列
  club.students.forEach((s, idx) => {
    const row = [
      s.num || idx + 1,
      `"${s.class}"`,
      `"${s.seat}"`,
      `"${s.name}"`,
      `"${s.gender}"`
    ];
    dates.forEach(d => {
      const att = s.attendance[d] || { p7: '', p8: '', note: '' };
      row.push(`"${att.p7}"`, `"${att.p8}"`, `"${att.note}"`);
    });
    csv += row.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `南投國中社團點名單_${club.name}_${currentDate}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 已成功匯出 CSV 檔案！', 'success');
}

// ==========================================
// 12. 友善列印 (Print / PDF)
// ==========================================
function triggerPrint() {
  const club = getCurrentClub();
  if (!club) return;

  // 準備列印專用內容
  const printTitleEl = document.getElementById('print-school-title');
  const printClubEl = document.getElementById('print-club-info');
  const printTableBody = document.getElementById('print-table-body');

  if (printTitleEl) {
    printTitleEl.textContent = `南投縣立南投國民中學 115學年度 第一學期 社團點名單`;
  }

  if (printClubEl) {
    printClubEl.innerHTML = `
      <div><strong>社團名稱：</strong>${club.name}</div>
      <div><strong>指導教師：</strong>${club.teacher || '___________'}</div>
      <div><strong>活動地點：</strong>${club.location}</div>
      <div><strong>點名日期：</strong>${formatRocDate(currentDate)} (週二第7-8節)</div>
    `;
  }

  if (printTableBody) {
    printTableBody.innerHTML = club.students.map((s, idx) => {
      const att = s.attendance[currentDate] || { p7: 'O', p8: 'O', note: '' };
      return `
        <tr>
          <td>${s.num || idx + 1}</td>
          <td>${s.class}</td>
          <td>${s.seat}</td>
          <td style="font-weight: bold; text-align: left; padding-left: 8px;">
            ${s.name} ${s.role ? `<span style="font-size: 8pt;">(${s.role})</span>` : ''}
          </td>
          <td>${s.gender}</td>
          <td style="font-size: 13pt; font-weight: bold;">${att.p7 || 'O'}</td>
          <td style="font-size: 13pt; font-weight: bold;">${att.p8 || 'O'}</td>
          <td style="text-align: left; padding-left: 6px;">${att.note || ''}</td>
        </tr>
      `;
    }).join('');
  }

  window.print();
}

// ==========================================
// 13. 資料備份與還原 (JSON)
// ==========================================
function exportBackupJson() {
  if (!appData) return;
  const jsonStr = JSON.stringify(appData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `南投國中社團點名系統_完整資料備份_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('💾 資料庫備份 JSON 已成功下載！', 'success');
}

function importBackupJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && imported.clubs && Array.isArray(imported.clubs)) {
        appData = imported;
        saveData();
        renderApp();
        showToast('🎉 成功從備份檔還原社團點名資料！', 'success');
      } else {
        alert('❌ 備份檔案結構不符！');
      }
    } catch (err) {
      alert('❌ 讀取 JSON 檔案失敗：' + err.message);
    }
  };
  reader.readAsText(file, 'utf-8');
}

// ==========================================
// 14. 輔助工具函式
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const colors = {
    'success': 'bg-emerald-600 text-white',
    'error': 'bg-rose-600 text-white',
    'info': 'bg-slate-800 text-white'
  };

  const toast = document.createElement('div');
  toast.className = `px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-medium transition-all duration-300 transform translate-y-2 opacity-0 ${colors[type] || colors.info}`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
