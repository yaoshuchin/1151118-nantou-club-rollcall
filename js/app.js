/**
 * 南投縣立南投國民中學 115學年度 社團點名系統
 * 核心應用程式邏輯 (app.js)
 * 密碼管制：nato
 * 活動時段：固定每週二 第7節與第8節
 * 點名分類：出席 (O) 與 缺席 (X)
 * 特殊註記：201陳揚宗、204陳紅妘 為資優鑑定生不用上第7節，第7節免出席
 */

// ==========================================
// 1. 常數與系統狀態
// ==========================================
const AUTH_KEY = 'nantou_club_auth_token_115';
const PASSWORD_CORRECT = 'nato';
// 更新至 v3 確保轉學生 (702班4號 張芸瑄) 資料完整清除，並保留其他社團最新點名紀錄
const STORAGE_KEY = 'nantou_clubs_database_115_v3';

// 點名分類：主要為出席與缺席，資優生第7節為免出席
const STATUS_CYCLE_NORMAL = ['O', 'X'];
const STATUS_CYCLE_GIFTED_P7 = ['免', 'O', 'X'];

const STATUS_LABELS = {
  'O': { text: '出席', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200', icon: 'fa-check' },
  'X': { text: '缺席', bg: 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200', icon: 'fa-xmark' },
  '免': { text: '免出席', bg: 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200', icon: 'fa-user-graduate' },
  '':  { text: '未記', bg: 'bg-slate-50 text-slate-400 border-slate-200', icon: 'fa-minus' }
};

let appData = null;
let currentClubId = null;
let currentDate = '2026-10-06';
let searchQuery = '';
let filterStatus = 'ALL'; // ALL, PRESENT, ABSENT, EXEMPT
let currentAbsenteeTab = 'weekly'; // weekly 或 semester

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
    let saved = localStorage.getItem(STORAGE_KEY);
    // 自動相容與平滑遷移舊版 LocalStorage 快取 (v2)
    if (!saved) {
      saved = localStorage.getItem('nantou_clubs_database_115_v2');
    }

    if (saved) {
      appData = JSON.parse(saved);
      removeTransferredStudents();
      ensureGiftedAnnotations();
      saveData();
    } else if (typeof INITIAL_CLUBS_DATA !== 'undefined') {
      appData = JSON.parse(JSON.stringify(INITIAL_CLUBS_DATA));
      removeTransferredStudents();
      ensureGiftedAnnotations();
      saveData();
    } else {
      console.error('No initial data available');
    }
  } catch (e) {
    console.error('Error loading data:', e);
    if (typeof INITIAL_CLUBS_DATA !== 'undefined') {
      appData = JSON.parse(JSON.stringify(INITIAL_CLUBS_DATA));
      removeTransferredStudents();
      ensureGiftedAnnotations();
    }
  }

  // 設定預設社團與日期
  if (appData && appData.clubs && appData.clubs.length > 0) {
    currentClubId = appData.clubs[0].id;
    if (appData.tuesdayDates && appData.tuesdayDates.length > 0) {
      currentDate = appData.tuesdayDates[0];
    }
  }
}

/**
 * 確保已轉學學生（702班4號 張芸瑄）自社團資料中完整刪除並重新排序號次
 */
function removeTransferredStudents() {
  if (!appData || !appData.clubs) return false;
  let modified = false;

  appData.clubs.forEach(club => {
    const initialLen = club.students.length;
    club.students = club.students.filter(s => {
      const isTransferred = (s.name === '張芸瑄' && (s.class === '702' || s.class === '102') && String(s.seat) === '4');
      return !isTransferred;
    });

    if (club.students.length !== initialLen) {
      modified = true;
      club.studentCount = club.students.length;
      club.students.forEach((s, idx) => {
        s.num = idx + 1;
      });
    }
  });

  return modified;
}

/**
 * 確保 201陳揚宗 與 204陳紅妘 的資優生備註與第7節免出席設定確實套用
 */
function ensureGiftedAnnotations() {
  if (!appData || !appData.clubs) return;

  const giftedTargets = [
    { name: '陳揚宗', classes: ['201', '801'] },
    { name: '陳紅妘', classes: ['204', '804'] }
  ];

  appData.clubs.forEach(club => {
    club.students.forEach(student => {
      const match = giftedTargets.find(g => g.name === student.name && g.classes.includes(student.class));
      if (match) {
        student.isGifted = true;
        student.specialTag = '資優生(第7節免出席)';
        
        // Ensure all attendance dates have p7='免' and proper note
        const dates = club.activeDates || appData.tuesdayDates || [];
        dates.forEach(d => {
          if (!student.attendance[d]) {
            student.attendance[d] = { p7: '免', p8: 'O', note: '資優鑑定生不用上第7節，不用出席' };
          } else {
            student.attendance[d].p7 = '免';
            if (!student.attendance[d].p8) student.attendance[d].p8 = 'O';
            if (!student.attendance[d].note) {
              student.attendance[d].note = '資優鑑定生不用上第7節，不用出席';
            }
          }
        });
      }
    });
  });
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
      removeTransferredStudents();
      ensureGiftedAnnotations();
      saveData();
      renderApp();
      showToast('🔄 已成功重設所有社團資料回原始狀態！', 'info');
    }
  }
}

// ==========================================
// 4. 週二日期嚴格管制與輔助運算
// ==========================================
function isTuesday(dateStr) {
  if (!dateStr) return false;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.getDay() === 2; // 0=Sun, 1=Mon, 2=Tue
}

function snapToTuesday(dateStr) {
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const day = d.getDay();
  const diff = 2 - day;
  d.setDate(d.getDate() + diff);
  
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dt = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dt}`;
}

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

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  const searchInput = document.getElementById('student-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderStudentList();
    });
  }

  // 全校跨社學生即時搜尋事件監聽 (支援打字即時預覽與 Enter 鍵立即全校定位)
  const globalSearchInput = document.getElementById('global-student-search');
  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (e) => {
      renderGlobalSearchResults(e.target.value);
    });
    globalSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleGlobalSearchSubmit();
      }
    });
  }

  // 快速輸入缺席名單事件監聽 (支援 Enter 快捷與按鈕)
  const quickAbsentInput = document.getElementById('quick-absent-input');
  if (quickAbsentInput) {
    quickAbsentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleQuickAbsentSubmit();
      }
    });
  }
  const quickAbsentBtn = document.getElementById('btn-quick-absent-submit');
  if (quickAbsentBtn) {
    quickAbsentBtn.addEventListener('click', handleQuickAbsentSubmit);
  }

  const filterSelect = document.getElementById('filter-status-select');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      filterStatus = e.target.value;
      renderStudentList();
    });
  }

  const dateSelect = document.getElementById('date-select');
  if (dateSelect) {
    dateSelect.addEventListener('change', (e) => {
      currentDate = e.target.value;
      renderApp();
    });
  }

  const prevDateBtn = document.getElementById('btn-prev-date');
  if (prevDateBtn) {
    prevDateBtn.addEventListener('click', () => navigateDate(-1));
  }
  const nextDateBtn = document.getElementById('btn-next-date');
  if (nextDateBtn) {
    nextDateBtn.addEventListener('click', () => navigateDate(1));
  }

  const addDateBtn = document.getElementById('btn-add-custom-date');
  if (addDateBtn) {
    addDateBtn.addEventListener('click', promptAddCustomDate);
  }

  const btnAllPresent = document.getElementById('btn-all-present');
  if (btnAllPresent) {
    btnAllPresent.addEventListener('click', markAllPresent);
  }

  const btnSyncP8 = document.getElementById('btn-sync-p8');
  if (btnSyncP8) {
    btnSyncP8.addEventListener('click', syncPeriod7ToPeriod8);
  }

  const btnClearDate = document.getElementById('btn-clear-date');
  if (btnClearDate) {
    btnClearDate.addEventListener('click', clearCurrentDateAttendance);
  }

  const btnAddStudent = document.getElementById('btn-add-student');
  if (btnAddStudent) {
    btnAddStudent.addEventListener('click', showAddStudentModal);
  }

  const btnExportClubExcel = document.getElementById('btn-export-club-excel');
  if (btnExportClubExcel) {
    btnExportClubExcel.addEventListener('click', exportCurrentClubExcel);
  }

  const btnExportAllExcel = document.getElementById('btn-export-all-excel');
  if (btnExportAllExcel) {
    btnExportAllExcel.addEventListener('click', exportAllClubsWorkbook);
  }

  const btnExportCsv = document.getElementById('btn-export-csv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportCurrentClubCsv);
  }

  const btnPrint = document.getElementById('btn-print-view');
  if (btnPrint) {
    btnPrint.addEventListener('click', triggerPrint);
  }

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

function renderClubTabs() {
  const container = document.getElementById('club-tabs-container');
  if (!container || !appData.clubs) return;

  container.innerHTML = appData.clubs.map(club => {
    const isActive = club.id === currentClubId;
    const activeClasses = isActive
      ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400 font-semibold border-blue-600'
      : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 hover:border-slate-300';
    
    // Check if club has gifted students
    const hasGifted = club.students.some(s => s.isGifted);

    return `
      <button 
        onclick="switchClub('${club.id}')"
        class="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition-all duration-150 shrink-0 ${activeClasses}"
      >
        <span class="w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-blue-500'}"></span>
        <span class="truncate">${club.name}</span>
        ${hasGifted ? '<span class="text-[10px] bg-purple-500 text-white px-1.5 py-0.2 rounded-full" title="含資優生免第7節">資優</span>' : ''}
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
  if (club && club.activeDates && !club.activeDates.includes(currentDate)) {
    currentDate = club.activeDates[0];
  }
  renderApp();
}

function getCurrentClub() {
  if (!appData || !appData.clubs) return null;
  return appData.clubs.find(c => c.id === currentClubId) || appData.clubs[0];
}

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

  const dateTitleEl = document.getElementById('current-date-title');
  if (dateTitleEl) {
    dateTitleEl.innerHTML = `
      <i class="fa-regular fa-calendar-check text-blue-600 mr-2"></i>
      <span class="font-bold text-slate-800">${formatRocDate(currentDate)}</span>
      <span class="text-xs bg-blue-100 text-blue-800 font-semibold px-2.5 py-0.5 rounded-full ml-2">固定週二 第7節 & 第8節</span>
    `;
  }
}

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
 * 渲染學生點名名單表格（二元點名：出席 / 缺席，資優生免第7節）
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
      String(s.seat).includes(searchQuery) ||
      (s.specialTag && s.specialTag.toLowerCase().includes(searchQuery))
    );
  }

  // 出席狀態過濾：出席、缺席、資優免出席
  if (filterStatus !== 'ALL') {
    students = students.filter(s => {
      const att = s.attendance[currentDate] || { p7: '', p8: '' };
      if (filterStatus === 'PRESENT') return att.p7 === 'O' && att.p8 === 'O';
      if (filterStatus === 'ABSENT') return att.p7 === 'X' || att.p8 === 'X';
      if (filterStatus === 'EXEMPT') return s.isGifted || att.p7 === '免';
      return true;
    });
  }

  if (countBadge) {
    countBadge.textContent = `共 ${students.length} / ${club.studentCount} 人`;
  }

  if (students.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-12 text-slate-400">
          <i class="fa-solid fa-user-slash text-3xl mb-2 block"></i>
          沒有符合條件的學生名單
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = students.map((s, idx) => {
    // 預設點名：資優生第7節免到，其餘預設出席 O
    const defaultP7 = s.isGifted ? '免' : 'O';
    const defaultNote = s.isGifted ? '資優鑑定生不用上第7節，不用出席' : '';
    const att = s.attendance[currentDate] || { p7: defaultP7, p8: 'O', note: defaultNote };
    
    const p7Meta = STATUS_LABELS[att.p7] || STATUS_LABELS['O'];
    const p8Meta = STATUS_LABELS[att.p8] || STATUS_LABELS['O'];
    const isPres = s.role === '社長' || (s.role && s.role.includes('社'));
    const isGifted = Boolean(s.isGifted);

    return `
      <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100 student-row ${isGifted ? 'bg-purple-50/30' : ''}" data-student-num="${s.num}">
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

        <!-- 姓名與身份註記 (社長 / 資優生) -->
        <td class="px-4 py-3 whitespace-nowrap">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="font-bold text-slate-900 text-base">${s.name}</span>
            ${isPres ? '<span class="text-xs bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded shadow-sm">👑 社長</span>' : ''}
            ${isGifted ? '<span class="text-xs bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full border border-purple-200 shadow-sm flex items-center gap-1"><i class="fa-solid fa-graduation-cap"></i> 資優生 (第7節免出席)</span>' : ''}
            ${s.gender ? `<span class="text-xs text-slate-400 ml-1">(${s.gender})</span>` : ''}
          </div>
        </td>

        <!-- 第7節 點名狀態 (出席 O / 缺席 X / 資優生 免) -->
        <td class="px-3 py-3 text-center">
          <button 
            type="button"
            onclick="cycleStatus('${club.id}', ${s.num}, 'p7')"
            title="點擊單鍵切換點名狀態"
            class="status-btn px-4 py-1.5 rounded-xl border text-sm font-bold shadow-sm inline-flex items-center gap-1.5 ${p7Meta.bg}"
          >
            <i class="fa-solid ${p7Meta.icon} text-xs"></i>
            <span>${p7Meta.text}</span>
            <span class="font-mono text-xs opacity-80">(${att.p7 || 'O'})</span>
          </button>
        </td>

        <!-- 第8節 點名狀態 (出席 O / 缺席 X) -->
        <td class="px-3 py-3 text-center">
          <button 
            type="button"
            onclick="cycleStatus('${club.id}', ${s.num}, 'p8')"
            title="點擊切換點名狀態 (出席 / 缺席)"
            class="status-btn px-4 py-1.5 rounded-xl border text-sm font-bold shadow-sm inline-flex items-center gap-1.5 ${p8Meta.bg}"
          >
            <i class="fa-solid ${p8Meta.icon} text-xs"></i>
            <span>${p8Meta.text}</span>
            <span class="font-mono text-xs opacity-80">(${att.p8 || 'O'})</span>
          </button>
        </td>

        <!-- 違規與備註欄位 (資優生預填不用上第7節) -->
        <td class="px-3 py-3">
          <input 
            type="text" 
            value="${escapeHtml(att.note !== undefined ? att.note : (isGifted ? '資優鑑定生不用上第7節，不用出席' : ''))}" 
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
 * 點名切換核心：點名分成【出席】與【缺席】；資優生第7節支援【免出席】
 */
function cycleStatus(clubId, studentNum, period) {
  const club = appData.clubs.find(c => c.id === clubId);
  if (!club) return;
  const student = club.students.find(s => s.num === studentNum);
  if (!student) return;

  const defaultP7 = student.isGifted ? '免' : 'O';
  const defaultNote = student.isGifted ? '資優鑑定生不用上第7節，不用出席' : '';

  if (!student.attendance[currentDate]) {
    student.attendance[currentDate] = { p7: defaultP7, p8: 'O', note: defaultNote };
  }

  const currentVal = student.attendance[currentDate][period] || (period === 'p7' ? defaultP7 : 'O');
  let nextVal = 'O';

  if (student.isGifted && period === 'p7') {
    // 資優生第7節：免 -> O -> X -> 免 循環
    const idx = STATUS_CYCLE_GIFTED_P7.indexOf(currentVal);
    nextVal = idx === -1 ? '免' : STATUS_CYCLE_GIFTED_P7[(idx + 1) % STATUS_CYCLE_GIFTED_P7.length];
  } else {
    // 點名分為「出席」與「缺席」：單鍵直接二元切換
    nextVal = currentVal === 'O' ? 'X' : 'O';
  }

  student.attendance[currentDate][period] = nextVal;
  saveData();
  renderStudentList();
  renderStatsDashboard();
}

function syncStudentP7ToP8(clubId, studentNum) {
  const club = appData.clubs.find(c => c.id === clubId);
  if (!club) return;
  const student = club.students.find(s => s.num === studentNum);
  if (!student || !student.attendance[currentDate]) return;

  // 資優生第7節免出席，第8節正常上課預設出席
  if (student.isGifted && student.attendance[currentDate].p7 === '免') {
    student.attendance[currentDate].p8 = 'O';
  } else {
    student.attendance[currentDate].p8 = student.attendance[currentDate].p7;
  }
  saveData();
  renderStudentList();
  renderStatsDashboard();
}

function updateStudentNote(clubId, studentNum, noteText) {
  const club = appData.clubs.find(c => c.id === clubId);
  if (!club) return;
  const student = club.students.find(s => s.num === studentNum);
  if (!student) return;

  if (!student.attendance[currentDate]) {
    student.attendance[currentDate] = { 
      p7: student.isGifted ? '免' : 'O', 
      p8: 'O', 
      note: '' 
    };
  }
  student.attendance[currentDate].note = noteText.trim();
  saveData();
}

// ==========================================
// 6.5 快速記缺席演算法與查詢比對
// ==========================================
/**
 * 解析年班座號代碼尋找學生
 * 支援格式：
 * 1. 5位數：
 *    - 10306 (1年3班6號) -> 班級: 103 或 703, 座號: 6
 *    - 70306 (7年3班6號) -> 班級: 703 或 103, 座號: 6
 *    - 20410 (2年4班10號) -> 班級: 204 或 804, 座號: 10
 *    - 80410 (8年4班10號) -> 班級: 804 或 204, 座號: 10
 *    - 30907 (3年9班7號) -> 班級: 309 或 909, 座號: 7
 * 2. 4位數：
 *    - 7036 (7年3班6號) -> 班級: 703/103, 座號: 6
 *    - 1036 (1年3班6號) -> 班級: 103/703, 座號: 6
 * 3. 帶分隔符：
 *    - 703-6, 103-06, 703 6, 204-10
 * 4. 學生姓名：直接比對姓名
 */
function findStudentByCode(code, club) {
  if (!code || !club || !club.students) return null;
  const trimmed = String(code).trim();
  if (!trimmed) return null;

  // 1. 直接姓名完全匹配
  const byName = club.students.find(s => s.name === trimmed);
  if (byName) return byName;

  let targetClasses = [];
  let targetSeat = null;

  // 2. 5 位數解析 (如 10306, 70306, 80410, 20410)
  const m5 = trimmed.match(/^([123789])(\d{2})(\d{2})$/);
  if (m5) {
    const g = parseInt(m5[1], 10);
    const c = m5[2];
    const st = parseInt(m5[3], 10);
    const g789 = g <= 3 ? g + 6 : g;
    const g123 = g >= 7 ? g - 6 : g;
    targetClasses = [`${g123}${c}`, `${g789}${c}`];
    targetSeat = String(st);
  }

  // 3. 4 位數解析 (如 7036, 1036)
  const m4 = !m5 && trimmed.match(/^([123789])(\d{2})(\d{1})$/);
  if (m4) {
    const g = parseInt(m4[1], 10);
    const c = m4[2];
    const st = parseInt(m4[3], 10);
    const g789 = g <= 3 ? g + 6 : g;
    const g123 = g >= 7 ? g - 6 : g;
    targetClasses = [`${g123}${c}`, `${g789}${c}`];
    targetSeat = String(st);
  }

  // 4. 分隔符號解析 (如 703-6, 103 06, 804-10)
  const mSep = !m5 && !m4 && trimmed.match(/^([123789]\d{2})[\s\-_#]+(\d{1,2})$/);
  if (mSep) {
    const clsRaw = mSep[1];
    const g = parseInt(clsRaw[0], 10);
    const c = clsRaw.slice(1);
    const st = parseInt(mSep[2], 10);
    const g789 = g <= 3 ? g + 6 : g;
    const g123 = g >= 7 ? g - 6 : g;
    targetClasses = [`${g123}${c}`, `${g789}${c}`];
    targetSeat = String(st);
  }

  if (targetClasses.length > 0 && targetSeat !== null) {
    return club.students.find(s => {
      const matchClass = targetClasses.includes(s.class);
      const matchSeat = String(parseInt(s.seat, 10)) === String(parseInt(targetSeat, 10));
      return matchClass && matchSeat;
    }) || null;
  }

  return null;
}

function findStudentAcrossAllClubs(code) {
  if (!appData || !appData.clubs) return null;
  for (const c of appData.clubs) {
    const st = findStudentByCode(code, c);
    if (st) return { club: c, student: st };
  }
  return null;
}

/**
 * 處理快速輸入缺席名單（支援單筆或多筆，全校跨社自動標記，免切換視窗、免確認彈窗）
 */
function handleQuickAbsentSubmit() {
  const inputEl = document.getElementById('quick-absent-input');
  const periodEl = document.getElementById('quick-absent-period');
  if (!inputEl) return;

  const rawVal = inputEl.value.trim();
  if (!rawVal) {
    showToast('請輸入要記缺席的年班座號代碼 (如 70102 或 10306)', 'info');
    inputEl.focus();
    return;
  }

  const periodMode = periodEl ? periodEl.value : 'both';
  const currentClub = getCurrentClub();
  if (!currentClub) return;

  const rawCodes = rawVal.split(/[,，;\s\n]+/).map(s => s.trim()).filter(Boolean);
  if (rawCodes.length === 0) return;

  let markedStudents = [];
  let notFoundCodes = [];
  let lastMarkedStudentInCurrentClub = null;

  rawCodes.forEach(code => {
    // 優先在當前檢視的社團查找學生；若不在本社，則自動於全校其他社團精確搜尋
    let student = findStudentByCode(code, currentClub);
    let targetClub = currentClub;

    if (!student) {
      const other = findStudentAcrossAllClubs(code);
      if (other) {
        student = other.student;
        targetClub = other.club;
      }
    }

    if (student) {
      if (!student.attendance[currentDate]) {
        student.attendance[currentDate] = { 
          p7: student.isGifted ? '免' : 'O', 
          p8: 'O', 
          note: student.isGifted ? '資優鑑定生不用上第7節，不用出席' : '' 
        };
      }

      if (periodMode === 'both') {
        student.attendance[currentDate].p8 = 'X';
        if (student.isGifted) {
          student.attendance[currentDate].p7 = '免';
        } else {
          student.attendance[currentDate].p7 = 'X';
        }
      } else if (periodMode === 'p7') {
        if (student.isGifted) {
          student.attendance[currentDate].p7 = '免';
        } else {
          student.attendance[currentDate].p7 = 'X';
        }
      } else if (periodMode === 'p8') {
        student.attendance[currentDate].p8 = 'X';
      }

      markedStudents.push({
        code,
        student,
        club: targetClub,
        isCurrentClub: (targetClub.id === currentClub.id)
      });

      if (targetClub.id === currentClub.id) {
        lastMarkedStudentInCurrentClub = student.num;
      }
    } else {
      notFoundCodes.push(code);
    }
  });

  if (markedStudents.length > 0) {
    saveData();
    renderStudentList();
    renderStatsDashboard();

    // 清空輸入框並重新聚焦
    inputEl.value = '';
    inputEl.focus();

    // 若有標記到本社學生，平滑捲動並閃爍醒目提示
    if (lastMarkedStudentInCurrentClub !== null) {
      setTimeout(() => {
        const row = document.querySelector(`tr[data-student-num="${lastMarkedStudentInCurrentClub}"]`);
        if (row) {
          row.classList.remove('highlight-row');
          void row.offsetWidth; // trigger reflow
          row.classList.add('highlight-row');
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }

    // 格式化回報訊息（不切換視窗、不跳確認彈窗，直接顯示成功標記名單與社團）
    const summary = markedStudents.map(m => {
      const giftedNote = m.student.isGifted ? ' (第7節資優免)' : '';
      return `${m.student.class}班${m.student.seat}號 ${m.student.name}【${m.club.name}】${giftedNote}`;
    }).join('、');

    showToast(`🚨 已成功為 ${markedStudents.length} 位學生登記【缺席 (X)】：${summary}`, 'error');
  }

  // 查無代碼
  if (notFoundCodes.length > 0) {
    showToast(`❌ 全校查無此學生代碼：${notFoundCodes.join(', ')}，請確認號碼是否正確！`, 'error');
  }
}

// ==========================================
// 6.6 批次大量匯入全校缺席名單 (免切換視窗)
// ==========================================
function openBatchAbsentModal() {
  const modal = document.getElementById('batch-absent-modal');
  if (modal) {
    modal.classList.remove('hidden');
    const textarea = document.getElementById('batch-absent-textarea');
    if (textarea) textarea.focus();
  }
}

function closeBatchAbsentModal() {
  const modal = document.getElementById('batch-absent-modal');
  if (modal) modal.classList.add('hidden');
}

function insertBatchExample(text) {
  const textarea = document.getElementById('batch-absent-textarea');
  if (textarea) {
    textarea.value = text;
    textarea.focus();
  }
}

function executeBatchAbsentImport() {
  const textarea = document.getElementById('batch-absent-textarea');
  const periodSelect = document.getElementById('batch-absent-period');
  const noteInput = document.getElementById('batch-absent-note');
  if (!textarea) return;

  const raw = textarea.value.trim();
  if (!raw) {
    alert('請先輸入或貼上要登記缺席的學生座號代碼或姓名！');
    textarea.focus();
    return;
  }

  const periodMode = periodSelect ? periodSelect.value : 'both';
  const customNote = noteInput ? noteInput.value.trim() : '';
  const currentClub = getCurrentClub();

  const rawCodes = raw.split(/[\r\n,，;；\s]+/).map(s => s.trim()).filter(Boolean);
  if (rawCodes.length === 0) return;

  let markedStudents = [];
  let notFoundCodes = [];

  rawCodes.forEach(code => {
    // 優先在當前社團找，若無則跨全校所有社團找
    let student = currentClub ? findStudentByCode(code, currentClub) : null;
    let studentClub = currentClub;

    if (!student) {
      const other = findStudentAcrossAllClubs(code);
      if (other) {
        student = other.student;
        studentClub = other.club;
      }
    }

    if (student) {
      if (!student.attendance[currentDate]) {
        student.attendance[currentDate] = { 
          p7: student.isGifted ? '免' : 'O', 
          p8: 'O', 
          note: student.isGifted ? '資優鑑定生不用上第7節，不用出席' : '' 
        };
      }

      if (periodMode === 'both') {
        student.attendance[currentDate].p8 = 'X';
        if (student.isGifted) {
          student.attendance[currentDate].p7 = '免';
        } else {
          student.attendance[currentDate].p7 = 'X';
        }
      } else if (periodMode === 'p7') {
        if (student.isGifted) {
          student.attendance[currentDate].p7 = '免';
        } else {
          student.attendance[currentDate].p7 = 'X';
        }
      } else if (periodMode === 'p8') {
        student.attendance[currentDate].p8 = 'X';
      }

      if (customNote) {
        student.attendance[currentDate].note = customNote;
      }

      markedStudents.push({
        code,
        student,
        club: studentClub
      });
    } else {
      notFoundCodes.push(code);
    }
  });

  if (markedStudents.length > 0) {
    saveData();
    renderStudentList();
    renderStatsDashboard();

    // 顯示結果面板
    const resultContainer = document.getElementById('batch-absent-result-container');
    const resultTitle = document.getElementById('batch-absent-result-title');
    const resultBody = document.getElementById('batch-absent-result-body');

    if (resultContainer && resultBody) {
      resultContainer.classList.remove('hidden');
      resultTitle.innerHTML = `<span class="text-rose-700 font-bold">✅ 成功登記 ${markedStudents.length} 人缺席${notFoundCodes.length > 0 ? `，⚠️ ${notFoundCodes.length} 筆未找到` : ''}</span>`;
      
      let html = '<div class="space-y-1">';
      markedStudents.forEach(m => {
        const giftedTag = m.student.isGifted ? ' (第7節資優免)' : '';
        html += `
          <div class="flex items-center justify-between p-2 rounded bg-rose-50 text-rose-900 border border-rose-200">
            <span class="font-bold">${m.student.class}班 ${m.student.seat}號 ${escapeHtml(m.student.name)} ${giftedTag}</span>
            <span class="text-xs bg-rose-200 text-rose-800 font-semibold px-2 py-0.5 rounded">${escapeHtml(m.club.name)}</span>
          </div>
        `;
      });

      if (notFoundCodes.length > 0) {
        html += `
          <div class="p-2 rounded bg-amber-50 text-amber-900 border border-amber-200 mt-2 font-bold">
            ❌ 查無以下學生代碼：${escapeHtml(notFoundCodes.join(', '))}
          </div>
        `;
      }
      html += '</div>';
      resultBody.innerHTML = html;
    }

    showToast(`🎉 已成功一次性跨社登記 ${markedStudents.length} 位學生缺席！`, 'success');
  } else {
    alert(`❌ 全校查無任何輸入之學生代碼：\n${notFoundCodes.join(', ')}`);
  }
}

// ==========================================
// 7. 批次操作 (一鍵出席 / 同步 / 清除)
// ==========================================
function markAllPresent() {
  const club = getCurrentClub();
  if (!club) return;

  club.students.forEach(s => {
    const isG = Boolean(s.isGifted);
    if (!s.attendance[currentDate]) {
      s.attendance[currentDate] = { 
        p7: isG ? '免' : 'O', 
        p8: 'O', 
        note: isG ? '資優鑑定生不用上第7節，不用出席' : '' 
      };
    } else {
      s.attendance[currentDate].p7 = isG ? '免' : 'O';
      s.attendance[currentDate].p8 = 'O';
      if (isG && !s.attendance[currentDate].note) {
        s.attendance[currentDate].note = '資優鑑定生不用上第7節，不用出席';
      }
    }
  });

  saveData();
  renderStudentList();
  renderStatsDashboard();
  const hasGifted = club.students.some(s => s.isGifted);
  showToast(`✅ ${club.name} 全體已標記【全員出席 (O)】${hasGifted ? '（資優生第7節維持免出席）' : ''}`, 'success');
}

function syncPeriod7ToPeriod8() {
  const club = getCurrentClub();
  if (!club) return;

  club.students.forEach(s => {
    if (s.attendance[currentDate]) {
      if (s.isGifted && s.attendance[currentDate].p7 === '免') {
        s.attendance[currentDate].p8 = 'O';
      } else {
        s.attendance[currentDate].p8 = s.attendance[currentDate].p7;
      }
    }
  });

  saveData();
  renderStudentList();
  renderStatsDashboard();
  showToast(`🔄 已成功將第 7 節點名狀態同步至第 8 節！`, 'info');
}

function clearCurrentDateAttendance() {
  const club = getCurrentClub();
  if (!club) return;

  if (confirm(`確定要清除【${club.name}】在【${formatRocDate(currentDate)}】的所有點名紀錄嗎？`)) {
    club.students.forEach(s => {
      s.attendance[currentDate] = { p7: '', p8: '', note: s.isGifted ? '資優鑑定生不用上第7節，不用出席' : '' };
    });

    saveData();
    renderStudentList();
    renderStatsDashboard();
    showToast(`🧹 已清除本日點名紀錄`, 'info');
  }
}

// ==========================================
// 8. 即時統計看板（出席與缺席二元統計）
// ==========================================
function renderStatsDashboard() {
  const club = getCurrentClub();
  if (!club) return;

  const total = club.students.length;
  let p7Present = 0, p7Absent = 0, p7Exempt = 0;
  let p8Present = 0, p8Absent = 0;

  club.students.forEach(s => {
    const att = s.attendance[currentDate] || { p7: 'O', p8: 'O' };
    if (att.p7 === 'O') p7Present++;
    else if (att.p7 === 'X') p7Absent++;
    else if (att.p7 === '免' || s.isGifted) p7Exempt++;

    if (att.p8 === 'O') p8Present++;
    else if (att.p8 === 'X') p8Absent++;
  });

  // 計算有效應到人數（扣除第7節資優免出席人數）
  const p7EffectiveTotal = total - p7Exempt;
  const p7Rate = p7EffectiveTotal > 0 ? Math.round((p7Present / p7EffectiveTotal) * 100) : 100;
  const p8Rate = total > 0 ? Math.round((p8Present / total) * 100) : 100;

  document.getElementById('stat-total-students').textContent = total;
  document.getElementById('stat-p7-present').textContent = p7Present;
  document.getElementById('stat-p7-absent').textContent = p7Absent;
  document.getElementById('stat-p7-leave').textContent = p7Exempt; // 顯示免到人數
  document.getElementById('stat-p7-rate').textContent = `${p7Rate}%`;

  document.getElementById('stat-p8-present').textContent = p8Present;
  document.getElementById('stat-p8-absent').textContent = p8Absent;
  document.getElementById('stat-p8-rate').textContent = `${p8Rate}%`;

  const barEl = document.getElementById('stat-rate-bar');
  if (barEl) {
    const avgRate = Math.round((p7Rate + p8Rate) / 2);
    barEl.style.width = `${avgRate}%`;
  }

  // 同步計算並渲染全校缺席即時看板
  renderGlobalAbsentDashboard();
}

// ==========================================
// 9. 學生名單管理 (新增/編輯/刪除)
// ==========================================
function showAddStudentModal() {
  const club = getCurrentClub();
  if (!club) return;

  const cls = prompt('請輸入學生班級代碼 (如 701, 802, 201)：');
  if (!cls) return;
  const seat = prompt('請輸入學生座號 (如 12)：');
  if (!seat) return;
  const name = prompt('請輸入學生真實姓名：');
  if (!name) return;
  const gender = prompt('請輸入性別 (男 / 女)：', '男');
  const isGifted = confirm('該名學生是否為【資優鑑定生】（第7節免出席）？');
  const isPres = confirm('該名學生是否為【社長 / 幹部】？');

  const newNum = club.students.length > 0 ? Math.max(...club.students.map(s => s.num || 0)) + 1 : 1;
  const newStudent = {
    num: newNum,
    class: cls.trim(),
    seat: seat.trim(),
    name: name.trim(),
    gender: gender ? gender.trim() : '',
    role: isPres ? '社長' : '',
    isGifted: isGifted,
    specialTag: isGifted ? '資優生(第7節免出席)' : '',
    attendance: {
      [currentDate]: { 
        p7: isGifted ? '免' : 'O', 
        p8: 'O', 
        note: isGifted ? '資優鑑定生不用上第7節，不用出席' : '' 
      }
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
  const isGifted = confirm(`該生是否為【資優鑑定生】？\n（目前狀態：${s.isGifted ? '是（第7節免出席）' : '否'}）`);
  const isPres = confirm(`該生是否為幹部？\n（目前狀態：${s.role || '一般社員'}）`);

  s.name = newName.trim();
  if (newClass) s.class = newClass.trim();
  if (newSeat) s.seat = newSeat.trim();
  if (newGender) s.gender = newGender.trim();
  s.isGifted = isGifted;
  s.specialTag = isGifted ? '資優生(第7節免出席)' : '';
  s.role = isPres ? '社長' : '';

  if (isGifted && s.attendance[currentDate]) {
    s.attendance[currentDate].p7 = '免';
    if (!s.attendance[currentDate].note) {
      s.attendance[currentDate].note = '資優鑑定生不用上第7節，不用出席';
    }
  }

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
    const cleanName = club.name.replace(/[\\/?*[\]]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, cleanName);
  });

  const fileName = `南投國中115學年度_各社團點名簿_全校完整版_${currentDate}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast(`📥 已成功匯出全校 13 個社團完整 Excel 活頁簿！`, 'success');
}

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
    row4.push('違規/備註');
  });
  rows.push(row4);

  // Row 5+: 學生資料與點名
  club.students.forEach((s, idx) => {
    let displayName = s.name;
    if (s.role) displayName += `(${s.role})`;
    if (s.isGifted) displayName += `[資優生]`;

    const sRow = [
      s.num || idx + 1,
      s.class,
      s.seat,
      displayName,
      s.gender
    ];

    dates.forEach(d => {
      const att = s.attendance[d] || { p7: s.isGifted ? '免' : 'O', p8: 'O', note: s.isGifted ? '資優鑑定生不用上第7節，不用出席' : '' };
      sRow.push(att.p7 || '');
      sRow.push(att.p8 || '');
      sRow.push(att.note || '');
    });

    rows.push(sRow);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 6 },
    { wch: 8 },
    { wch: 8 },
    { wch: 18 },
    { wch: 6 }
  ];
  dates.forEach(() => {
    ws['!cols'].push({ wch: 6 });  // 7
    ws['!cols'].push({ wch: 6 });  // 8
    ws['!cols'].push({ wch: 22 }); // 備註
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
  let csv = '\uFEFF';
  csv += `南投國中 115學年度 社團點名單 -【${club.name}】\n`;
  csv += `指導教師: ${club.teacher},地點: ${club.location},費用: ${club.fee},活動時間: 每週二第7-8節,點名規則: 出席O / 缺席X\n`;

  const dateHeader = ['', '', '', '', ''];
  dates.forEach(d => {
    dateHeader.push(`"${formatShortRoc(d)}"`, '""', '""');
  });
  csv += dateHeader.join(',') + '\n';

  const subHeader = ['序號', '班級', '座號', '姓名', '性別'];
  dates.forEach(() => {
    subHeader.push('第7節', '第8節', '違規/備註');
  });
  csv += subHeader.join(',') + '\n';

  club.students.forEach((s, idx) => {
    let displayName = s.name;
    if (s.role) displayName += `(${s.role})`;
    if (s.isGifted) displayName += `[資優生]`;

    const row = [
      s.num || idx + 1,
      `"${s.class}"`,
      `"${s.seat}"`,
      `"${displayName}"`,
      `"${s.gender}"`
    ];
    dates.forEach(d => {
      const att = s.attendance[d] || { p7: s.isGifted ? '免' : 'O', p8: 'O', note: s.isGifted ? '資優鑑定生不用上第7節，不用出席' : '' };
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
      const att = s.attendance[currentDate] || { p7: s.isGifted ? '免' : 'O', p8: 'O', note: s.isGifted ? '資優鑑定生不用上第7節，不用出席' : '' };
      let printName = s.name;
      if (s.role) printName += ` <span style="font-size: 8pt;">(${s.role})</span>`;
      if (s.isGifted) printName += ` <span style="font-size: 8pt; color: #7e22ce;">[資優生·免7節]</span>`;

      return `
        <tr>
          <td>${s.num || idx + 1}</td>
          <td>${s.class}</td>
          <td>${s.seat}</td>
          <td style="font-weight: bold; text-align: left; padding-left: 8px;">
            ${printName}
          </td>
          <td>${s.gender}</td>
          <td style="font-size: 13pt; font-weight: bold;">${att.p7 || 'O'}</td>
          <td style="font-size: 13pt; font-weight: bold;">${att.p8 || 'O'}</td>
          <td style="text-align: left; padding-left: 6px; font-size: 8.5pt;">${att.note || ''}</td>
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
        ensureGiftedAnnotations();
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

// ==========================================
// 15. 全校缺席即時看板 (跨13社團監控)
// ==========================================
function renderGlobalAbsentDashboard() {
  if (!appData || !appData.clubs) return;

  let totalGlobalAbsentStudents = 0;
  const clubsWithAbsence = [];

  appData.clubs.forEach(c => {
    const absentStudents = c.students.filter(s => {
      const att = s.attendance[currentDate];
      return att && (att.p7 === 'X' || att.p8 === 'X');
    });

    if (absentStudents.length > 0) {
      totalGlobalAbsentStudents += absentStudents.length;
      clubsWithAbsence.push({
        id: c.id,
        name: c.name,
        count: absentStudents.length,
        students: absentStudents
      });
    }
  });

  const countEl = document.getElementById('stat-global-absent-count');
  if (countEl) {
    countEl.textContent = totalGlobalAbsentStudents;
    if (totalGlobalAbsentStudents > 0) {
      countEl.className = 'text-2xl font-black text-rose-400 font-mono tracking-tight animate-pulse';
    } else {
      countEl.className = 'text-2xl font-black text-emerald-400 font-mono tracking-tight';
    }
  }

  const clubsContainer = document.getElementById('stat-global-absent-clubs');
  if (clubsContainer) {
    if (totalGlobalAbsentStudents === 0) {
      clubsContainer.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
          <i class="fa-solid fa-circle-check text-emerald-400"></i> 今日全校 13 社團全員出席，零缺席！
        </span>
      `;
    } else {
      clubsContainer.innerHTML = clubsWithAbsence.map(item => {
        return `
          <button 
            type="button" 
            onclick="switchClub('${item.id}')" 
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold border border-rose-500/30 transition cursor-pointer"
            title="點擊切換至【${escapeHtml(item.name)}】"
          >
            <span>${escapeHtml(item.name)}</span>
            <span class="bg-rose-600 text-white text-[11px] px-1.5 py-0.2 rounded-full font-mono">${item.count}人</span>
          </button>
        `;
      }).join('');
    }
  }
}

// ==========================================
// 16. 全校跨社學生即時搜尋核心
// ==========================================
function searchGlobalStudents(rawQuery) {
  if (!appData || !appData.clubs || !rawQuery) return [];
  const q = String(rawQuery).trim().toLowerCase();
  if (!q) return [];

  const results = [];
  const seenStudentKeys = new Set();

  // 1. 先用精確代碼或全名比對 (支援 10306, 70306, 20410, 80410, 30907 等)
  appData.clubs.forEach(club => {
    const codeMatch = findStudentByCode(q, club);
    if (codeMatch) {
      const key = `${club.id}_${codeMatch.num}`;
      if (!seenStudentKeys.has(key)) {
        seenStudentKeys.add(key);
        results.push({ club, student: codeMatch });
      }
    }
  });

  // 2. 進行模糊搜尋（姓名、班級、座號、組合字串）
  appData.clubs.forEach(club => {
    club.students.forEach(s => {
      const key = `${club.id}_${s.num}`;
      if (seenStudentKeys.has(key)) return;

      const nameLower = (s.name || '').toLowerCase();
      const cls = String(s.class || '').toLowerCase();
      const seat = String(s.seat || '');
      const seatPadded = seat.padStart(2, '0');

      let altCls = cls;
      if (cls.length === 3) {
        const g = parseInt(cls[0], 10);
        if (g >= 7 && g <= 9) {
          altCls = `${g - 6}${cls.slice(1)}`;
        } else if (g >= 1 && g <= 3) {
          altCls = `${g + 6}${cls.slice(1)}`;
        }
      }

      const codeVariants = [
        `${cls}${seatPadded}`,
        `${altCls}${seatPadded}`,
        `${cls}${seat}`,
        `${altCls}${seat}`,
        `${cls}-${seat}`,
        `${altCls}-${seat}`,
        `${cls}班${seat}號`,
        `${altCls}班${seat}號`
      ];

      const matchName = nameLower.includes(q);
      const matchCls = cls.includes(q) || altCls.includes(q);
      const matchCode = codeVariants.some(v => v.toLowerCase().includes(q));
      const matchClub = (club.name || '').toLowerCase().includes(q);

      if (matchName || matchCls || matchCode || matchClub) {
        seenStudentKeys.add(key);
        results.push({ club, student: s });
      }
    });
  });

  return results;
}

function renderGlobalSearchResults(query) {
  const trimmed = query ? query.trim() : '';
  const clearBtn = document.getElementById('btn-global-search-clear');
  const panel = document.getElementById('global-search-results-panel');
  const countEl = document.getElementById('global-search-count');
  const listEl = document.getElementById('global-search-list');

  if (!panel || !listEl) return;

  if (!trimmed) {
    panel.classList.add('hidden');
    if (clearBtn) clearBtn.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }

  if (clearBtn) clearBtn.classList.remove('hidden');
  panel.classList.remove('hidden');

  const results = searchGlobalStudents(trimmed);
  if (countEl) {
    countEl.textContent = `搜尋結果 (${results.length} 筆)`;
  }

  if (results.length === 0) {
    listEl.innerHTML = `
      <div class="col-span-full py-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        <i class="fa-solid fa-user-xmark text-2xl mb-1 text-slate-300"></i>
        <div class="text-xs">查無符合「${escapeHtml(trimmed)}」的學生，請確認年班座號代碼或姓名</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = results.map(item => {
    const c = item.club;
    const s = item.student;
    const att = s.attendance[currentDate] || { p7: s.isGifted ? '免' : 'O', p8: 'O' };
    const isAbsent = att.p7 === 'X' || att.p8 === 'X';
    const statusBadge = isAbsent 
      ? `<span class="bg-rose-100 text-rose-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-rose-200">本日有缺席 (第7節:${att.p7 || 'O'} / 第8節:${att.p8 || 'O'})</span>`
      : `<span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">本日出席正常 (第7節:${att.p7 || 'O'} / 第8節:${att.p8 || 'O'})</span>`;

    return `
      <div class="bg-slate-50 hover:bg-blue-50/50 p-3 rounded-xl border border-slate-200 hover:border-blue-300 transition flex flex-col justify-between gap-2 shadow-xs">
        <div>
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              ${escapeHtml(s.name)}
              <span class="font-mono text-xs font-semibold text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">${s.class}班 ${s.seat}號</span>
              ${s.gender ? `<span class="text-[11px] text-slate-400">(${s.gender})</span>` : ''}
            </span>
            <span class="text-xs font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md truncate max-w-[120px]">${escapeHtml(c.name)}</span>
          </div>
          <div class="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>指導老師: <strong class="text-slate-700">${escapeHtml(c.teacher || '無')}</strong></span>
            <span>地點: <strong class="text-slate-700">${escapeHtml(c.location || '校內教室')}</strong></span>
            ${s.role ? `<span class="text-amber-700 font-bold bg-amber-50 px-1.5 rounded border border-amber-200">👑 ${s.role}</span>` : ''}
            ${s.isGifted ? `<span class="text-purple-700 font-bold bg-purple-50 px-1.5 rounded border border-purple-200">資優生(免第7節)</span>` : ''}
          </div>
          <div class="mt-2">
            ${statusBadge}
          </div>
        </div>
        <div class="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-200/60 mt-1">
          <button 
            type="button" 
            onclick="jumpToStudentInClub('${c.id}', ${s.num})" 
            class="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] transition flex items-center gap-1 shadow-xs"
          >
            <i class="fa-solid fa-arrow-right-to-bracket text-[10px]"></i> 前往本社點名
          </button>
          <button 
            type="button" 
            onclick="quickToggleAttendance('${c.id}', ${s.num}, 'X')" 
            class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition cursor-pointer"
            title="快速記為缺席"
          >
            記缺席
          </button>
          <button 
            type="button" 
            onclick="quickToggleAttendance('${c.id}', ${s.num}, 'O')" 
            class="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[11px] transition cursor-pointer"
            title="快速記為出席"
          >
            記出席
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function handleGlobalSearchSubmit() {
  const input = document.getElementById('global-student-search');
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    showToast('請輸入要搜尋的學生姓名或年班座號代碼 (如 70102、10306 或 陳揚宗)', 'info');
    input.focus();
    return;
  }

  // 1. 即時渲染搜尋面板
  renderGlobalSearchResults(val);

  // 2. 進行跨校比對並直接切換至第一筆學生所在社團並平滑滾動定位
  const results = searchGlobalStudents(val);
  if (results.length > 0) {
    const target = results[0];
    jumpToStudentInClub(target.club.id, target.student.num);
    const giftedTag = target.student.isGifted ? ' (資優生·第7節免)' : '';
    showToast(`🎯 已找到【${target.student.class}班${target.student.seat}號 ${target.student.name}】，已自動切換至【${target.club.name}】並為您定位！${giftedTag}`, 'success');
  } else {
    showToast(`❌ 全校查無符合「${val}」的學生，請確認代碼或姓名！`, 'error');
  }
}

function setGlobalSearch(code) {
  const input = document.getElementById('global-student-search');
  if (input) {
    input.value = code;
    handleGlobalSearchSubmit();
  }
}

function clearGlobalSearch() {
  const input = document.getElementById('global-student-search');
  if (input) {
    input.value = '';
    renderGlobalSearchResults('');
  }
}

function jumpToStudentInClub(clubId, studentNum) {
  // 清除下方社內搜尋過濾條件，確保目標學生在列表中可見
  searchQuery = '';
  const innerSearch = document.getElementById('student-search');
  if (innerSearch) innerSearch.value = '';
  filterStatus = 'ALL';
  const filterSelect = document.getElementById('filter-status-select');
  if (filterSelect) filterSelect.value = 'ALL';

  switchClub(clubId);

  // 平滑滾動並醒目閃爍
  setTimeout(() => {
    const row = document.querySelector(`tr[data-student-num="${studentNum}"]`);
    if (row) {
      row.classList.remove('highlight-row');
      void row.offsetWidth;
      row.classList.add('highlight-row');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 120);
}

function quickToggleAttendance(clubId, studentNum, status) {
  const club = appData.clubs.find(c => c.id === clubId);
  if (!club) return;
  const student = club.students.find(s => s.num === studentNum);
  if (!student) return;

  if (!student.attendance[currentDate]) {
    student.attendance[currentDate] = { 
      p7: student.isGifted ? '免' : 'O', 
      p8: 'O', 
      note: student.isGifted ? '資優鑑定生不用上第7節，不用出席' : '' 
    };
  }

  if (status === 'X') {
    if (student.isGifted) {
      student.attendance[currentDate].p7 = '免';
      student.attendance[currentDate].p8 = 'X';
    } else {
      student.attendance[currentDate].p7 = 'X';
      student.attendance[currentDate].p8 = 'X';
    }
  } else if (status === 'O') {
    if (student.isGifted) {
      student.attendance[currentDate].p7 = '免';
      student.attendance[currentDate].p8 = 'O';
    } else {
      student.attendance[currentDate].p7 = 'O';
      student.attendance[currentDate].p8 = 'O';
    }
  }

  saveData();
  renderStudentList();
  renderStatsDashboard();

  const searchInput = document.getElementById('global-student-search');
  if (searchInput && searchInput.value) {
    renderGlobalSearchResults(searchInput.value);
  }
  showToast(`已更新 ${student.name} 的本日點名為【${status === 'X' ? '缺席 (X)' : '出席 (O)'}】`, status === 'X' ? 'error' : 'success');
}

// ==========================================
// 17. 全校缺席名單管理與匯出 Modal 核心
// ==========================================
function openAbsenteeModal(type = 'weekly') {
  currentAbsenteeTab = type;
  const modal = document.getElementById('absentee-modal');
  if (!modal) return;

  const dateSelect = document.getElementById('modal-date-select');
  if (dateSelect && appData && appData.tuesdayDates) {
    dateSelect.innerHTML = appData.tuesdayDates.map(d => {
      return `<option value="${d}" ${d === currentDate ? 'selected' : ''}>${formatRocDate(d)}</option>`;
    }).join('');
  }

  updateAbsenteeModalTabsVisuals();
  renderAbsenteeModalContent();
  modal.classList.remove('hidden');
}

function closeAbsenteeModal() {
  const modal = document.getElementById('absentee-modal');
  if (modal) modal.classList.add('hidden');
}

function switchAbsenteeTab(tab) {
  currentAbsenteeTab = tab;
  updateAbsenteeModalTabsVisuals();
  renderAbsenteeModalContent();
}

function updateAbsenteeModalTabsVisuals() {
  const btnWeekly = document.getElementById('tab-btn-weekly');
  const btnSemester = document.getElementById('tab-btn-semester');
  const weeklyControls = document.getElementById('modal-weekly-controls');
  const colCumul = document.getElementById('modal-col-cumulative');

  if (currentAbsenteeTab === 'weekly') {
    if (btnWeekly) {
      btnWeekly.className = 'px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm bg-white text-rose-700';
    }
    if (btnSemester) {
      btnSemester.className = 'px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition';
    }
    if (weeklyControls) weeklyControls.classList.remove('hidden');
    if (colCumul) colCumul.textContent = '節次情形';
  } else {
    if (btnWeekly) {
      btnWeekly.className = 'px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition';
    }
    if (btnSemester) {
      btnSemester.className = 'px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm bg-white text-rose-700';
    }
    if (weeklyControls) weeklyControls.classList.add('hidden');
    if (colCumul) colCumul.textContent = '累計缺席次數';
  }
}

function getWeeklyAbsentList(dateStr) {
  if (!appData || !appData.clubs) return [];
  const list = [];
  appData.clubs.forEach(club => {
    club.students.forEach(s => {
      const att = s.attendance[dateStr];
      if (att && (att.p7 === 'X' || att.p8 === 'X')) {
        list.push({
          date: dateStr,
          clubId: club.id,
          clubName: club.name,
          teacher: club.teacher,
          student: s,
          p7: att.p7,
          p8: att.p8,
          note: att.note || ''
        });
      }
    });
  });
  return list;
}

function getAllSemesterAbsentList() {
  if (!appData || !appData.clubs) return [];
  const dates = appData.tuesdayDates || [];
  const list = [];

  // 計算全學期每位學生的缺席累計總次數
  const studentCumulative = new Map();
  dates.forEach(d => {
    appData.clubs.forEach(club => {
      club.students.forEach(s => {
        const att = s.attendance[d];
        if (att && (att.p7 === 'X' || att.p8 === 'X')) {
          const key = `${club.id}_${s.num}`;
          studentCumulative.set(key, (studentCumulative.get(key) || 0) + 1);
        }
      });
    });
  });

  // 整理清單
  dates.forEach(d => {
    appData.clubs.forEach(club => {
      club.students.forEach(s => {
        const att = s.attendance[d];
        if (att && (att.p7 === 'X' || att.p8 === 'X')) {
          const key = `${club.id}_${s.num}`;
          list.push({
            date: d,
            clubId: club.id,
            clubName: club.name,
            teacher: club.teacher,
            student: s,
            p7: att.p7,
            p8: att.p8,
            note: att.note || '',
            cumulativeCount: studentCumulative.get(key) || 1
          });
        }
      });
    });
  });

  return list;
}

function renderAbsenteeModalContent() {
  const tableBody = document.getElementById('modal-absent-table-body');
  const summaryEl = document.getElementById('modal-absent-summary');
  if (!tableBody) return;

  if (currentAbsenteeTab === 'weekly') {
    const dateSelect = document.getElementById('modal-date-select');
    const targetDate = dateSelect ? dateSelect.value : currentDate;
    const list = getWeeklyAbsentList(targetDate);

    if (summaryEl) {
      summaryEl.innerHTML = `<span class="text-rose-600 font-bold">【${formatRocDate(targetDate)}】全校共 ${list.length} 位學生缺席</span>`;
    }

    if (list.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="py-12 text-center text-emerald-600 bg-emerald-50/40">
            <i class="fa-solid fa-circle-check text-3xl mb-2 block"></i>
            <span class="font-bold text-sm">🎉 太棒了！【${formatRocDate(targetDate)}】全校 13 個社團全員出席，零缺席！</span>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = list.map((item, idx) => {
      const s = item.student;
      const isGifted = Boolean(s.isGifted);
      const isPres = Boolean(s.role);

      const p7Badge = item.p7 === 'X' 
        ? '<span class="bg-rose-100 text-rose-800 border border-rose-300 font-bold px-2 py-0.5 rounded text-[11px]">第7節: 缺席</span>'
        : (item.p7 === '免' ? '<span class="bg-purple-100 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded text-[11px]">第7節: 免</span>' : '<span class="text-slate-400 text-[11px]">第7節: 出席</span>');

      const p8Badge = item.p8 === 'X' 
        ? '<span class="bg-rose-100 text-rose-800 border border-rose-300 font-bold px-2 py-0.5 rounded text-[11px]">第8節: 缺席</span>'
        : '<span class="text-slate-400 text-[11px]">第8節: 出席</span>';

      const periodDesc = (item.p7 === 'X' && item.p8 === 'X') 
        ? '<span class="bg-rose-600 text-white font-bold px-2 py-0.5 rounded-full text-[11px]">7,8節均缺</span>'
        : (item.p7 === 'X' ? '<span class="bg-rose-500 text-white font-bold px-2 py-0.5 rounded-full text-[11px]">第7節缺</span>' : '<span class="bg-rose-500 text-white font-bold px-2 py-0.5 rounded-full text-[11px]">第8節缺</span>');

      return `
        <tr class="hover:bg-rose-50/40 transition">
          <td class="px-3 py-2.5 text-center font-mono text-slate-400">${idx + 1}</td>
          <td class="px-3 py-2.5 text-center font-mono text-slate-600 whitespace-nowrap">${formatShortRoc(item.date)}</td>
          <td class="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">
            <span class="cursor-pointer hover:text-blue-600" onclick="switchClub('${item.clubId}'); closeAbsenteeModal();" title="切換至此社團">
              ${escapeHtml(item.clubName)}
            </span>
          </td>
          <td class="px-3 py-2.5 text-center whitespace-nowrap font-mono font-bold text-slate-700">
            ${s.class}班 ${s.seat}號
          </td>
          <td class="px-3 py-2.5 whitespace-nowrap">
            <span class="font-bold text-slate-900">${escapeHtml(s.name)}</span>
            ${isPres ? '<span class="ml-1 text-[10px] bg-amber-100 text-amber-800 px-1 rounded font-bold">幹部</span>' : ''}
            ${isGifted ? '<span class="ml-1 text-[10px] bg-purple-100 text-purple-800 px-1 rounded font-bold">資優生</span>' : ''}
          </td>
          <td class="px-2 py-2.5 text-center text-slate-500">${s.gender || '-'}</td>
          <td class="px-3 py-2.5 text-center whitespace-nowrap flex flex-wrap items-center justify-center gap-1">
            ${p7Badge} ${p8Badge}
          </td>
          <td class="px-3 py-2.5 text-center whitespace-nowrap">
            ${periodDesc}
          </td>
          <td class="px-3 py-2.5 text-slate-600 text-xs">
            ${escapeHtml(item.note || '—')}
          </td>
          <td class="px-2 py-2.5 text-center whitespace-nowrap">
            <button 
              type="button" 
              onclick="jumpToStudentInClub('${item.clubId}', ${s.num}); closeAbsenteeModal();"
              class="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs"
            >
              檢視
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } else {
    // Semester cumulative list
    const list = getAllSemesterAbsentList();

    if (summaryEl) {
      summaryEl.innerHTML = `<span class="text-rose-600 font-bold">115學年度 第一學期 全校累計共有 ${list.length} 人次缺席</span>`;
    }

    if (list.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="py-12 text-center text-emerald-600 bg-emerald-50/40">
            <i class="fa-solid fa-circle-check text-3xl mb-2 block"></i>
            <span class="font-bold text-sm">🎉 全學期目前尚無任何缺席紀錄，全員全勤！</span>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = list.map((item, idx) => {
      const s = item.student;
      const isGifted = Boolean(s.isGifted);
      const isPres = Boolean(s.role);

      const periodDesc = (item.p7 === 'X' && item.p8 === 'X') 
        ? '7,8節均缺' 
        : (item.p7 === 'X' ? '第7節缺席' : '第8節缺席');

      return `
        <tr class="hover:bg-rose-50/40 transition">
          <td class="px-3 py-2.5 text-center font-mono text-slate-400">${idx + 1}</td>
          <td class="px-3 py-2.5 text-center font-mono text-slate-600 whitespace-nowrap">${formatRocDate(item.date)}</td>
          <td class="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">
            <span class="cursor-pointer hover:text-blue-600" onclick="switchClub('${item.clubId}'); closeAbsenteeModal();">
              ${escapeHtml(item.clubName)}
            </span>
          </td>
          <td class="px-3 py-2.5 text-center whitespace-nowrap font-mono font-bold text-slate-700">
            ${s.class}班 ${s.seat}號
          </td>
          <td class="px-3 py-2.5 whitespace-nowrap">
            <span class="font-bold text-slate-900">${escapeHtml(s.name)}</span>
            ${isPres ? '<span class="ml-1 text-[10px] bg-amber-100 text-amber-800 px-1 rounded font-bold">幹部</span>' : ''}
            ${isGifted ? '<span class="ml-1 text-[10px] bg-purple-100 text-purple-800 px-1 rounded font-bold">資優生</span>' : ''}
          </td>
          <td class="px-2 py-2.5 text-center text-slate-500">${s.gender || '-'}</td>
          <td class="px-3 py-2.5 text-center whitespace-nowrap">
            <span class="bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-bold">${periodDesc}</span>
          </td>
          <td class="px-3 py-2.5 text-center whitespace-nowrap">
            <span class="bg-rose-600 text-white font-mono px-2 py-0.5 rounded-full text-xs font-bold">
              累計 ${item.cumulativeCount} 次
            </span>
          </td>
          <td class="px-3 py-2.5 text-slate-600 text-xs">
            ${escapeHtml(item.note || '—')}
          </td>
          <td class="px-2 py-2.5 text-center whitespace-nowrap">
            <button 
              type="button" 
              onclick="jumpToStudentInClub('${item.clubId}', ${s.num}); closeAbsenteeModal();"
              class="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs"
            >
              檢視
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
}

function exportCurrentAbsenteeExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('⚠️ SheetJS 程式庫尚未載入完成！', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();

  if (currentAbsenteeTab === 'weekly') {
    const dateSelect = document.getElementById('modal-date-select');
    const targetDate = dateSelect ? dateSelect.value : currentDate;
    const list = getWeeklyAbsentList(targetDate);

    const rows = [
      [`南投縣立南投國民中學 115學年度 社團點名缺席名單 -【${formatRocDate(targetDate)}】`],
      [`統計時間: ${new Date().toLocaleString()}  固定每週二第7節與第8節點名  缺席總計: ${list.length} 人`],
      ['項次', '活動日期', '社團名稱', '指導教師', '班級', '座號', '學生姓名', '性別', '缺席第7節', '缺席第8節', '違規/課堂備註']
    ];

    list.forEach((item, idx) => {
      const s = item.student;
      rows.push([
        idx + 1,
        item.date,
        item.clubName,
        item.teacher || '',
        s.class,
        s.seat,
        s.name + (s.isGifted ? ' [資優生]' : '') + (s.role ? ` (${s.role})` : ''),
        s.gender || '',
        item.p7 === 'X' ? '缺席' : (item.p7 === '免' ? '免出席' : '出席'),
        item.p8 === 'X' ? '缺席' : '出席',
        item.note || ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 12 },
      { wch: 16 },
      { wch: 12 },
      { wch: 8 },
      { wch: 6 },
      { wch: 16 },
      { wch: 6 },
      { wch: 12 },
      { wch: 12 },
      { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, '本週缺席名單');
    const fileName = `南投國中115社團點名_缺席名單_${targetDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`📥 已成功匯出本週缺席 Excel：${fileName}`, 'success');

  } else {
    const list = getAllSemesterAbsentList();

    const rows = [
      [`南投縣立南投國民中學 115學年度 第一學期 全校社團活動全期累計缺席總名冊`],
      [`統計時間: ${new Date().toLocaleString()}  社團總數: 13 社  全期累計缺席人次: ${list.length} 次`],
      ['項次', '活動日期', '社團名稱', '指導教師', '班級', '座號', '學生姓名', '性別', '缺席節次', '個人累計缺席次數', '違規/課堂備註']
    ];

    list.forEach((item, idx) => {
      const s = item.student;
      rows.push([
        idx + 1,
        item.date,
        item.clubName,
        item.teacher || '',
        s.class,
        s.seat,
        s.name + (s.isGifted ? ' [資優生]' : '') + (s.role ? ` (${s.role})` : ''),
        s.gender || '',
        (item.p7 === 'X' && item.p8 === 'X') ? '第7,8節均缺' : (item.p7 === 'X' ? '第7節缺席' : '第8節缺席'),
        item.cumulativeCount,
        item.note || ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 12 },
      { wch: 16 },
      { wch: 12 },
      { wch: 8 },
      { wch: 6 },
      { wch: 16 },
      { wch: 6 },
      { wch: 14 },
      { wch: 16 },
      { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, '全期累計缺席名冊');
    const fileName = `南投國中115社團點名_全期缺席總名冊_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`📥 已成功匯出全期缺席總名冊 Excel：${fileName}`, 'success');
  }
}

function exportCurrentAbsenteeCsv() {
  let csv = '\uFEFF';

  if (currentAbsenteeTab === 'weekly') {
    const dateSelect = document.getElementById('modal-date-select');
    const targetDate = dateSelect ? dateSelect.value : currentDate;
    const list = getWeeklyAbsentList(targetDate);

    csv += `南投縣立南投國民中學 115學年度 社團點名每週缺席名單\n`;
    csv += `活動日期: ${targetDate},時間: 週二第7-8節,缺席總人數: ${list.length}\n`;
    csv += `項次,活動日期,社團名稱,指導教師,班級,座號,學生姓名,性別,缺席第7節,缺席第8節,違規備註\n`;

    list.forEach((item, idx) => {
      const s = item.student;
      const row = [
        idx + 1,
        `"${item.date}"`,
        `"${item.clubName}"`,
        `"${item.teacher || ''}"`,
        `"${s.class}"`,
        `"${s.seat}"`,
        `"${s.name}"`,
        `"${s.gender || ''}"`,
        `"${item.p7 === 'X' ? '缺席' : (item.p7 === '免' ? '免出席' : '出席')}"`,
        `"${item.p8 === 'X' ? '缺席' : '出席'}"`,
        `"${item.note || ''}"`
      ];
      csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `南投國中社團點名_每週缺席名單_${targetDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📥 已成功匯出缺席名單 CSV 檔案！', 'success');

  } else {
    const list = getAllSemesterAbsentList();

    csv += `南投縣立南投國民中學 115學年度 第一學期 各社團全期累計缺席總名冊\n`;
    csv += `統計範圍: 全學期週二社團活動,累計缺席人次: ${list.length}\n`;
    csv += `項次,活動日期,社團名稱,指導教師,班級,座號,學生姓名,性別,缺席節次,個人累計缺席次數,違規備註\n`;

    list.forEach((item, idx) => {
      const s = item.student;
      const row = [
        idx + 1,
        `"${item.date}"`,
        `"${item.clubName}"`,
        `"${item.teacher || ''}"`,
        `"${s.class}"`,
        `"${s.seat}"`,
        `"${s.name}"`,
        `"${s.gender || ''}"`,
        `"${(item.p7 === 'X' && item.p8 === 'X') ? '第7,8節均缺' : (item.p7 === 'X' ? '第7節缺席' : '第8節缺席')}"`,
        `"${item.cumulativeCount}"`,
        `"${item.note || ''}"`
      ];
      csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `南投國中社團點名_全期累計缺席總名冊_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📥 已成功匯出全期缺席總名冊 CSV 檔案！', 'success');
  }
}

function printCurrentAbsenteeList() {
  const printTitleEl = document.getElementById('print-school-title');
  const printClubEl = document.getElementById('print-club-info');
  const printTableBody = document.getElementById('print-table-body');
  if (!printTitleEl || !printClubEl || !printTableBody) {
    window.print();
    return;
  }

  if (currentAbsenteeTab === 'weekly') {
    const dateSelect = document.getElementById('modal-date-select');
    const targetDate = dateSelect ? dateSelect.value : currentDate;
    const list = getWeeklyAbsentList(targetDate);

    printTitleEl.textContent = `南投縣立南投國民中學 115學年度 社團點名【缺席名單】統計表`;
    printClubEl.innerHTML = `
      <div><strong>統計時段：</strong>${formatRocDate(targetDate)} (固定每週二第7節與第8節)</div>
      <div><strong>全校缺席人數：</strong>${list.length} 人</div>
      <div><strong>列印時間：</strong>${new Date().toLocaleString()}</div>
    `;

    if (list.length === 0) {
      printTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="padding: 24px; text-align: center; color: #16a34a; font-weight: bold;">
            太棒了！本週全校 13 社團全員出席，零缺席！
          </td>
        </tr>
      `;
    } else {
      printTableBody.innerHTML = list.map((item, idx) => {
        const s = item.student;
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${s.class}</td>
            <td>${s.seat}</td>
            <td style="font-weight: bold; text-align: left; padding-left: 8px;">
              ${s.name} <span style="font-size: 8pt; color: #2563eb;">[${item.clubName}]</span>
            </td>
            <td>${s.gender || ''}</td>
            <td style="font-size: 11pt; font-weight: bold; color: ${item.p7 === 'X' ? '#dc2626' : '#16a34a'};">${item.p7 || 'O'}</td>
            <td style="font-size: 11pt; font-weight: bold; color: ${item.p8 === 'X' ? '#dc2626' : '#16a34a'};">${item.p8 || 'O'}</td>
            <td style="text-align: left; padding-left: 6px; font-size: 8.5pt;">${item.note || ''}</td>
          </tr>
        `;
      }).join('');
    }

  } else {
    const list = getAllSemesterAbsentList();
    printTitleEl.textContent = `南投縣立南投國民中學 115學年度 第一學期 全校社團【全期累計缺席總名冊】`;
    printClubEl.innerHTML = `
      <div><strong>統計範圍：</strong>115學年度第一學期 各週二社團活動</div>
      <div><strong>全期累計缺席人次：</strong>${list.length} 人次</div>
      <div><strong>列印時間：</strong>${new Date().toLocaleString()}</div>
    `;

    if (list.length === 0) {
      printTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="padding: 24px; text-align: center; color: #16a34a; font-weight: bold;">
            全學期各社團均全員出席，尚無任何缺席紀錄！
          </td>
        </tr>
      `;
    } else {
      printTableBody.innerHTML = list.map((item, idx) => {
        const s = item.student;
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${s.class}</td>
            <td>${s.seat}</td>
            <td style="font-weight: bold; text-align: left; padding-left: 8px;">
              ${s.name} <span style="font-size: 8pt; color: #2563eb;">[${item.clubName}·${formatShortRoc(item.date)}]</span>
            </td>
            <td>${s.gender || ''}</td>
            <td style="font-size: 11pt; font-weight: bold; color: #dc2626;">${item.p7}</td>
            <td style="font-size: 11pt; font-weight: bold; color: #dc2626;">${item.p8}</td>
            <td style="text-align: left; padding-left: 6px; font-size: 8.5pt;">(累計${item.cumulativeCount}次) ${item.note || ''}</td>
          </tr>
        `;
      }).join('');
    }
  }

  window.print();
}
