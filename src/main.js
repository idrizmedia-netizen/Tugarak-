import './styles.css';
import {
  watchAuth, registerTeacher, loginTeacher, loginWithGoogle, completeGoogleRegistration,
  resetPassword, logout, isAdmin, getUserDoc, getLockInfo, registerFail, clearFails,
  waitForRegistration, ensureGoogleUserDoc, isGoogleUser, handleRedirectResult, watchUserDoc,
  resendVerificationEmail, refreshEmailVerified, syncEmailVerifiedFlag
} from './auth.js';
import {
  watchAllTeachers, setTeacherStatus, watchMyGroups, createGroup, updateGroup, deleteGroup,
  watchGroupStudents, addStudent, deleteStudent, addGrade,
  watchNotifications, createNotification,
  rejectTeacher, resubmitApplication, updateTeacherProfile, blockTeacher, unblockTeacher,
  watchSubscriptionSettings, saveSubscriptionSettings, chooseSubscriptionPlan, markPlanContacted,
  activateSubscription, cancelSubscription, watchAds, addAd, updateAd, deleteAd,
  getGroupDocsOnce, addGroupDoc, deleteGroupDoc,
  getAttendanceOnce, saveAttendance,
  findApprovedTeacherByEmail, addCoTeacher, removeCoTeacher,
  getAllGroupsAdminOnce, getAllStudentsAdminOnce,
  getWorkPlanOnce, saveWorkPlanItems,
  addStudentsBatch, syncTeacherDirectory,
  updateStudent, setStudentGrades, updateGroupPaySettings, updateStudentPayment, applyPayDeadlines
} from './db.js';
import { auth } from './firebase.js';
import { parseRosterFile, parseWorkPlanFile } from './importParsers.js';
import { t, LANGS, getLang, setLang, contractText } from './i18n.js';

/** Rasmni kichraytirib, siqilgan base64 (JPEG) shaklga o'giradi.
 *  Firebase Storage o'rniga to'g'ridan-to'g'ri Firestore'da saqlash uchun
 *  (Spark/bepul reja bilan mos ishlashi maqsadida) rasm hajmi cheklanadi. */
function fileToCompressedBase64(file, maxWidth = 480, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        // JPEG shaffoflikni bilmaydi: oq fon chizilmasa, shaffof PNG qora bo'lib qoladi.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}



let state = {
  view: 'boot', authTab: 'login', theme: localStorage.getItem('theme') || 'light',
  firebaseUser: null, role: null, userDoc: null,
  teachers: [], groups: [], students: [], activeGroupId: null,
  modal: null, toast: null, pendingRegisterContract: false, authEmailTry: '',
  // Forma qiymatlari alohida saqlanadi, shunda modal ochilib-yopilganda
  // yoki boshqa sabab bilan sahifa qayta chizilganda (masalan, xato parol
  // taymeri) foydalanuvchi yozgan matn o'chib ketmaydi.
  regForm: { name: '', email: '', phone: '', password: '' },
  loginForm: { email: '', password: '' },
  contractReturnView: null,
  notifications: [],
  subscription: { enabled: false, plans: { free: { price: 0, discount: 0, features: [] }, monthly: { price: 0, discount: 0, features: [] }, yearly: { price: 0, discount: 0, features: [] } } },
  profileForm: { name: '', phone: '' },
  ad: { enabled: false, title: '', text: '', link: '', image: null },
  ads: [],
  adDismissed: false,
  groupDocs: [],
  attendance: [],
  workPlan: [],
  allGroupsAdmin: [],
  allStudentsAdmin: [],
  studentQuery: '', studentSort: 'added', teacherQuery: '',
};

let unsubTeachers = null, unsubGroups = null, unsubStudents = null, unsubNotifications = null, unsubSubscription = null, unsubAds = null, unsubUserDoc = null;
let adminDataLoadedAt = 0, adminDataLoading = false;
let syncedGroupId = null, extrasRun = 0, directoryBackfillStarted = false;

/** Foydalanuvchi almashganda/chiqqanda oldingi akkaunt ma'lumotlari xotirada qolib ketmasligi uchun. */
function resetSessionState() {
  syncedGroupId = null; extrasRun++;
  state.teachers = []; state.groups = []; state.students = []; state.activeGroupId = null;
  state.notifications = []; state.ads = []; state.groupDocs = []; state.attendance = []; state.workPlan = [];
  state.allGroupsAdmin = []; state.allStudentsAdmin = []; state.modal = null; state.adDismissed = false;
}

/** Admin statistikasi uchun guruh va o'quvchilarni BIR MARTA o'qiydi (real-vaqtli tinglovchi o'rniga).
 *  force=false bo'lsa, oxirgi yuklashdan 5 daqiqa o'tmagan bo'lsa qayta o'qimaydi. */
async function loadAdminDataOnce(force) {
  if (adminDataLoading) return;
  if (!force && Date.now() - adminDataLoadedAt < 5 * 60 * 1000) return;
  adminDataLoading = true;
  const run = authRun;
  try {
    const [groups, students] = await Promise.all([getAllGroupsAdminOnce(), getAllStudentsAdminOnce()]);
    if (run !== authRun) return; // foydalanuvchi almashgan
    state.allGroupsAdmin = groups; state.allStudentsAdmin = students;
    adminDataLoadedAt = Date.now();
    render();
  } catch (err) {
    console.warn('Admin statistikasini yuklab bo\u2019lmadi:', err.code || err);
  } finally { adminDataLoading = false; }
}

/** Admin birinchi marta kirganda tasdiqlangan o'qituvchilarni hamkor-qidiruv katalogiga bir martalik ko'chiradi. */
async function backfillDirectoryOnce(list) {
  if (directoryBackfillStarted) return;
  try { if (localStorage.getItem('dirBackfill:v1')) return; } catch (e) { /* e'tiborsiz */ }
  const approved = list.filter(tc => tc.status === 'approved');
  if (!approved.length) return;
  directoryBackfillStarted = true;
  try {
    await syncTeacherDirectory(approved);
    try { localStorage.setItem('dirBackfill:v1', '1'); } catch (e) { /* e'tiborsiz */ }
  } catch (e) {
    directoryBackfillStarted = false;
    console.warn('Hamkor katalogini yangilab bo\u2019lmadi:', e);
  }
}
const uid = () => 'x' + Math.random().toString(36).slice(2, 9);

function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------- XAVFSIZLIK YORDAMCHILARI ----------
   Firestore'dan kelgan HAR QANDAY qiymat (rasm, fayl, havola, baho) HTML'ga qo'yilishidan oldin
   shulardan o'tishi kerak. Avval proofDocs/photo/fileData/ad.link/grade.value tekshirilmasdan
   qo'yilardi: zararli foydalanuvchi atribut ichiga kod yozib, admin brauzerida ishlatishi mumkin edi. */
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
/** Faqat data:image/... ko'rinishidagi rasm; aks holda bo'sh satr. */
function safeImgSrc(v) {
  return (typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(v)) ? esc(v) : '';
}
/** Yuklab olinadigan hujjat uchun faqat data: havola (HTML/JS turlari emas). */
function safeFileHref(v) {
  return (typeof v === 'string' && /^data:(application\/(pdf|msword|octet-stream|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|image\/(png|jpe?g));base64,/i.test(v)) ? esc(v) : '#';
}
/** Faqat http/https havolalar (javascript: va boshqalarni o'tkazmaydi). */
function safeHttpUrl(u) {
  try {
    const x = new URL(String(u || ''), location.origin);
    return /^https?:$/.test(x.protocol) ? x.href : '#';
  } catch (e) { return '#'; }
}
/** Mahalliy (UTC emas!) sana: YYYY-MM-DD. toISOString() Toshkentda 00:00-05:00 oralig'ida kechagi sanani berardi. */
function localDateStr(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Joriy o'quv yili (1-sentabrdan 31-avgustgacha) chegaralari, millisekundda. */
function academicYearRange() {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return { start: new Date(y, 8, 1).getTime(), end: new Date(y + 1, 8, 1).getTime() };
}

function friendlyError(err) {
  const code = err?.code || '';
  const map = {
    'app/in-app-browser': t('errInApp'),
    'app/invalid': t('errInvalid'),
    'auth/user-not-found': t('errUserNotFound'),
    'auth/wrong-password': t('errWrongPassword'),
    'auth/invalid-credential': t('errInvalidCredential'),
    'auth/email-already-in-use': t('errEmailInUse'),
    'auth/weak-password': t('errWeakPassword'),
    'auth/invalid-email': t('errInvalidEmail'),
    'auth/too-many-requests': t('errTooMany'),
    'auth/popup-closed-by-user': t('errPopupClosed'),
    'auth/popup-blocked': t('errPopupClosed'),
    'auth/cancelled-popup-request': t('errPopupClosed'),
    'auth/network-request-failed': t('errNetwork'),
    'auth/unauthorized-domain': t('errUnauthorizedDomain'),
    'auth/user-disabled': t('errUserDisabled'),
    'unavailable': t('errNetwork'),
    'permission-denied': t('errPermission'),
  };
  if (!map[code]) console.warn('Xato:', err);
  // Ichki xato matnlari (err.message) foydalanuvchiga ko'rsatilmaydi.
  return map[code] || t('errGeneric');
}

function toast(msg, kind) {
  state.toast = { msg, kind: kind || 'info' };
  render();
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { state.toast = null; render(); }, 3400);
}

/* ================= AUTH STATE WIRING ================= */
/* ---------- PWA: "Ilovani o'rnatish" tugmasi ---------- */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  render();
});
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; render(); });

let authRun = 0;
watchAuth(async (user) => {
  const run = ++authRun;
  const stale = () => run !== authRun;
  state.firebaseUser = user;
  if (unsubTeachers) { unsubTeachers(); unsubTeachers = null; }
  if (unsubGroups) { unsubGroups(); unsubGroups = null; }
  if (unsubStudents) { unsubStudents(); unsubStudents = null; }
  if (unsubNotifications) { unsubNotifications(); unsubNotifications = null; }
  if (unsubSubscription) { unsubSubscription(); unsubSubscription = null; }
  if (unsubAds) { unsubAds(); unsubAds = null; }
  adminDataLoadedAt = 0;
  if (unsubUserDoc) { unsubUserDoc(); unsubUserDoc = null; }
  resetSessionState();

  if (!user) {
    state.role = null; state.userDoc = null; state.notifications = [];
    const publicViews = ['landing', 'teacherAuth', 'adminAuth', 'contractView'];
    if (!publicViews.includes(state.view)) state.view = 'landing';
    render();
    return;
  }

  // Tizimga kirgan har qanday foydalanuvchi (admin yoki o'qituvchi)
  // bildirishnomalarni, obuna sozlamalarini va reklamani ko'ra oladi.
  unsubNotifications = watchNotifications(list => { state.notifications = list; render(); });
  unsubSubscription = watchSubscriptionSettings(sub => { state.subscription = sub; render(); });
  unsubAds = watchAds(list => { state.ads = list; render(); });

  // Yangi ro'yxatdan o'tgan foydalanuvchining profili yozilib bo'lguncha kutamiz (poyga holati).
  await waitForRegistration();
  if (stale()) return;
  const admin = await isAdmin(user.uid);
  if (stale()) return;
  if (admin) {
    state.role = 'admin';
    state.view = 'adminDash';
    unsubTeachers = watchAllTeachers(list => { state.teachers = list; backfillDirectoryOnce(list); render(); });
    loadAdminDataOnce(true);
    render();
    return;
  }

  state.role = 'teacher';
  let udoc = await getUserDoc(user.uid);
  if (stale()) return;
  if (!udoc && isGoogleUser(user)) {
    // Google orqali birinchi kirish: boshlang'ich hujjat shu yerda yaratiladi (admin emasligi tekshirilgan).
    try { udoc = await ensureGoogleUserDoc(user); }
    catch (e) { console.error('Google profili yaratilmadi:', e); }
    if (stale()) return;
  }
  if (!udoc) {
    // Profili yo'q hisob (masalan, ro'yxatdan o'tish uzilgan) — bo'sh panel ko'rsatmasdan chiqarib yuboramiz.
    toast(t('errGeneric'), 'error');
    await logout();
    return;
  }
  applyTeacherDoc(user, udoc);
  syncEmailVerifiedFlag(user, udoc).catch(() => {}); // admin ariza ko'rganda email holati ko'rinadi
  // Profil real vaqtda kuzatiladi: holat (status) o'zgarsa interfeys darhol yangilanadi.
  unsubUserDoc = watchUserDoc(user.uid, d => {
    if (stale() || !d) return;
    const prev = state.userDoc;
    if (prev && prev.status === d.status) { state.userDoc = d; render(); return; }
    applyTeacherDoc(user, d);
  });
});

/** O'qituvchi hujjati (status) bo'yicha mos ekranni va guruh obunasini o'rnatadi. */
function applyTeacherDoc(user, udoc) {
  state.userDoc = udoc;
  if (unsubGroups) { unsubGroups(); unsubGroups = null; }
  if (udoc.status === 'incomplete') { state.view = 'googleComplete'; render(); return; }
  if (udoc.status === 'approved') {
    if (state.view !== 'subscription') state.view = 'teacherDash';
    unsubGroups = watchMyGroups(user.uid, list => {
      state.groups = list;
      // Faol guruh yo'q bo'lsa yoki o'chirilgan bo'lsa — birinchisini tanlaymiz.
      if (!state.activeGroupId || !list.some(g => g.id === state.activeGroupId)) {
        state.activeGroupId = list.length ? list[0].id : null;
      }
      syncActiveGroup(); // faqat faol guruh O'ZGARGANDA qayta obuna bo'ladi (ortiqcha o'qishlar yo'q)
      render();
    });
  } else {
    state.view = 'teacherPending';
  }
  render();
}

function subscribeStudentsIfNeeded() {
  if (unsubStudents) { unsubStudents(); unsubStudents = null; }
  if (state.activeGroupId) {
    unsubStudents = watchGroupStudents(state.activeGroupId, list => { state.students = list; render(); });
  } else {
    state.students = [];
  }
}
// Har bir yuklash natijasi faqat shu paytda ham faol bo'lgan guruhga yoziladi —
// guruhlar tez almashtirilganda eski guruh ma'lumoti yangisining ustiga yozilib qolmaydi.
async function loadGroupDocsOnce() {
  const gid = state.activeGroupId;
  const docs = gid ? await getGroupDocsOnce(gid) : [];
  if (gid === state.activeGroupId) state.groupDocs = docs;
}
async function loadAttendanceOnce() {
  const gid = state.activeGroupId;
  const list = gid ? await getAttendanceOnce(gid) : [];
  if (gid === state.activeGroupId) state.attendance = list;
}
async function loadWorkPlanOnce() {
  const gid = state.activeGroupId;
  const items = gid ? await getWorkPlanOnce(gid) : [];
  if (gid === state.activeGroupId) state.workPlan = items;
}
function loadGroupExtrasOnce() {
  const run = ++extrasRun;
  // Hujjatlar (katta base64 fayllar) faqat "Hujjatlar" oynasi ochilganda yuklanadi — ortiqcha o'qish yo'q.
  state.groupDocs = []; state.attendance = []; state.workPlan = [];
  Promise.all([loadAttendanceOnce(), loadWorkPlanOnce()])
    .then(() => { if (run === extrasRun) render(); })
    .catch(err => console.error('Guruh qo\u2019shimcha ma\u2019lumotlarini yuklashda xato:', err));
}
function syncActiveGroup() {
  if (state.activeGroupId === syncedGroupId) return;
  syncedGroupId = state.activeGroupId;
  subscribeStudentsIfNeeded();
  loadGroupExtrasOnce();
}

/* ================= RENDER ================= */
/* Har bir Firestore yangilanishi (yangi o'quvchi, bildirishnoma, reklama...) butun sahifani qayta chizadi.
   Avval shu paytda ochiq turgan oynadagi yozilayotgan matn (ism, izoh, narx...) o'chib ketardi.
   Endi qayta chizishdan oldin id'si bor maydonlar qiymati va fokus saqlanib, keyin tiklanadi. */
function captureFormState() {
  const snap = {};
  document.querySelectorAll('#app input[id], #app textarea[id], #app select[id]').forEach(el => {
    if (el.type === 'file') return;
    snap[el.id] = el.type === 'checkbox' || el.type === 'radio' ? { checked: el.checked } : { value: el.value };
  });
  const ae = document.activeElement;
  const active = ae && ae.id && snap[ae.id]
    ? { id: ae.id, start: ae.selectionStart ?? null, end: ae.selectionEnd ?? null } : null;
  return { snap, active };
}
function restoreFormState({ snap, active }) {
  for (const id in snap) {
    const el = document.getElementById(id);
    if (!el || el.type === 'file') continue;
    if ('checked' in snap[id]) el.checked = snap[id].checked;
    else if (el.value !== snap[id].value) el.value = snap[id].value;
  }
  if (active) {
    const el = document.getElementById(active.id);
    if (el) {
      el.focus({ preventScroll: true });
      try { if (active.start !== null) el.setSelectionRange(active.start, active.end); } catch (e) { /* date/email kabi turlarda yo'q */ }
    }
  }
}
function render() {
  const saved = captureFormState();
  renderInner();
  restoreFormState(saved);
}
function renderInner() {
  const app = document.getElementById('app');
  document.body.classList.toggle('dark', state.theme === 'dark');

  if (state.view === 'boot') { app.innerHTML = `<div class="spinner"></div>`; return; }

  if (state.view === 'contractView') {
    app.innerHTML = renderContractView() + renderToast();
    attachHandlers();
    return;
  }

  if (!state.firebaseUser) {
    app.innerHTML = renderAuthGate();
  } else if (state.role === 'admin') {
    if (state.view === 'adminNotifications') app.innerHTML = renderShell(renderAdminNotificationsView(), 'adminNotifications');
    else if (state.view === 'adminSubscription') app.innerHTML = renderShell(renderAdminSubscriptionView(), 'adminSubscription');
    else if (state.view === 'adminAds') app.innerHTML = renderShell(renderAdminAdsView(), 'adminAds');
    else if (state.view === 'adminReports') app.innerHTML = renderShell(renderAdminReportsView(), 'adminReports');
    else app.innerHTML = renderShell(renderAdminDash(), 'adminDash');
  } else if (state.view === 'googleComplete') {
    app.innerHTML = renderGoogleCompleteScreen();
  } else if (state.view === 'teacherPending' || (state.userDoc && state.userDoc.status !== 'approved')) {
    app.innerHTML = renderShell(renderTeacherPending(), 'teacherDash');
  } else if (state.view === 'subscription') {
    app.innerHTML = renderShell(renderSubscriptionView(), 'subscription');
  } else {
    app.innerHTML = renderShell(renderTeacherDash(), 'teacherDash');
  }
  attachHandlers();
}

function langSwitcherHTML(fixed) {
  const cur = getLang();
  const btns = LANGS.map(l => `<button data-lang="${l.code}" style="border:none;background:${l.code === cur ? 'var(--teal)' : 'transparent'};color:${l.code === cur ? '#fff' : 'var(--ink-soft)'};font-size:11px;font-weight:700;padding:4px 8px;border-radius:16px;cursor:pointer;">${l.code.toUpperCase()}</button>`).join('');
  const wrap = `<div style="display:flex;gap:2px;background:var(--paper-2);border:1px solid var(--line);border-radius:20px;padding:3px;">${btns}</div>`;
  if (!fixed) return wrap;
  return `<div style="position:fixed;top:14px;right:14px;z-index:150;display:flex;gap:8px;align-items:center;">
    ${deferredInstallPrompt ? `<button class="btn btn-outline" id="installBtn" style="padding:6px 12px;font-size:12px;background:var(--surface);">\u{1F4F2} ${t('installApp')}</button>` : ''}
    ${wrap}<button class="theme-toggle" id="themeToggle" aria-label="Tun/kun rejimi"></button></div>`;
}

function sealSVG(size) {
  size = size || 38;
  return `<svg class="seal" width="${size}" height="${size}" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
    <circle cx="30" cy="30" r="28" fill="none" stroke="var(--gold)" stroke-width="2.5"/>
    <circle cx="30" cy="30" r="21" fill="var(--navy)"/>
    <path d="M20 33 L26 39 L40 23" fill="none" stroke="var(--teal)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="30" cy="30" r="28" fill="none" stroke="var(--gold)" stroke-width="1" stroke-dasharray="2 3"/>
  </svg>`;
}

/* ---------- OBUNA HOLATI VA CHEKLOVLAR ---------- */
function getSubStatus() {
  const ud = state.userDoc;
  const plan = ud?.plan || 'free';
  if (plan === 'free') return { plan: 'free', state: 'active' };
  const expiresAtMs = ud?.planExpiresAt?.toMillis ? ud.planExpiresAt.toMillis() : null;
  if (!expiresAtMs) return { plan, state: 'active' };
  // Muddat tugashi bilan darhol bepul reja cheklovlariga qaytariladi
  // (imtiyoz muddati berilmaydi).
  if (Date.now() <= expiresAtMs) return { plan, state: 'active', expiresAtMs, daysLeft: daysBetween(localDateStr(), ymdOf(new Date(expiresAtMs))) };
  return { plan, state: 'expired', expiresAtMs };
}
function ymdOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
/** Email/parol bilan ro'yxatdan o'tgan va emailini hali tasdiqlamagan o'qituvchiga eslatma. */
function emailVerifyBannerHTML() {
  const u = state.firebaseUser;
  if (!u || state.role !== 'teacher' || u.emailVerified) return '';
  return `<div class="no-print" style="margin-bottom:16px;padding:10px 12px;border-radius:8px;font-size:13px;background:#C9992C15;border:1px solid #C9992C55;color:var(--gold);">
    \u2709 ${t('verifyBanner', { email: esc(u.email || '') })}
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-outline" id="resendVerifyBtn">${t('verifyResend')}</button>
      <button class="btn btn-teal" id="checkVerifyBtn">${t('verifyCheck')}</button>
    </div></div>`;
}
const SUB_WARN_DAYS = 7;
/** Pullik obuna tugashiga 7 kun va undan kam qolganda ogohlantirish. */
function subExpiringBannerHTML(status) {
  if (status.plan === 'free' || status.state !== 'active' || !status.expiresAtMs) return '';
  if (status.daysLeft === null || status.daysLeft > SUB_WARN_DAYS) return '';
  const date = fmtDMY(ymdOf(new Date(status.expiresAtMs)));
  const msg = status.daysLeft <= 0 ? t('subExpiringToday', { date }) : t('subExpiringBanner', { n: status.daysLeft, date });
  return `<div class="no-print" style="margin-bottom:16px;padding:10px 12px;border-radius:8px;font-size:13px;background:#C9992C15;border:1px solid #C9992C55;color:var(--gold);">${msg} <button class="link-btn" data-navto="subscription">${t('subRenewBtn')}</button></div>`;
}
function getGroupLimit() {
  const status = getSubStatus();
  const plans = state.subscription?.plans || {};
  const key = status.state === 'expired' ? 'free' : status.plan;
  const limit = plans[key]?.maxGroups;
  return typeof limit === 'number' ? limit : 0; // 0 = cheksiz
}
function ownGroups() { return state.groups.filter(g => g.teacherId === state.firebaseUser?.uid); }
function sortedGroupsForLimit() {
  return [...ownGroups()].sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
}
function isGroupLocked(group) {
  if (group.teacherId !== state.firebaseUser?.uid) return false; // hamkor sifatida qo'shilgan guruh egasining rejasiga bog'liq
  const limit = getGroupLimit();
  if (!limit) return false;
  const sorted = sortedGroupsForLimit();
  const idx = sorted.findIndex(g => g.id === group.id);
  return idx >= limit;
}
function atGroupLimit() {
  const limit = getGroupLimit();
  if (!limit) return false;
  return ownGroups().length >= limit;
}
function getStudentLimit() {
  const status = getSubStatus();
  const plans = state.subscription?.plans || {};
  const key = status.state === 'expired' ? 'free' : status.plan;
  const limit = plans[key]?.maxStudents;
  return typeof limit === 'number' ? limit : 0; // 0 = cheksiz
}
function atStudentLimit(groupId) {
  const limit = getStudentLimit();
  if (!limit) return false;
  return state.students.filter(s => s.groupId === groupId).length >= limit;
}

function hasUnreadNotifications() {
  const seenCount = parseInt(localStorage.getItem('notif-seenCount') || '0');
  return state.notifications.length > seenCount;
}

function topbar() {
  const who = state.role === 'admin' ? t('adminTitle') : (state.userDoc?.fullName || state.firebaseUser?.displayName || '');
  const unread = state.firebaseUser && hasUnreadNotifications();
  return `<div class="topbar">
    <div class="brandwrap">${sealSVG(34)}<div class="brand">TUGARAK<span>+</span></div></div>
    <div class="topbar-right">
      ${langSwitcherHTML(false)}
      ${deferredInstallPrompt ? `<button class="btn btn-outline" id="installBtn" style="padding:6px 12px;font-size:12px;">\u{1F4F2} ${t('installApp')}</button>` : ''}
      <button class="theme-toggle" id="themeToggle" aria-label="Tun/kun rejimi"></button>
      ${state.firebaseUser ? `<button class="logout-btn" id="notifBell" style="position:relative;font-size:16px;line-height:1;">\u{1F514}${unread ? '<span style="position:absolute;top:2px;right:2px;width:8px;height:8px;border-radius:50%;background:var(--danger);"></span>' : ''}</button>
      <button class="userchip" id="profileBtn" style="border:none;background:transparent;cursor:pointer;padding:0;"><div class="avatar-sm">${esc((who || '?').slice(0, 1).toUpperCase())}</div><span>${esc(who || '')}</span></button>
      <button class="logout-btn" id="logoutBtn">${t('logout')}</button>` : ''}
    </div>
  </div>`;
}

function renderShell(inner, activeView) {
  const role = state.role;
  const nav = role === 'admin'
    ? [['adminDash', '\u{1F5C2}', t('navApprovals')], ['adminNotifications', '\u{1F4E2}', t('navNotifications')], ['adminSubscription', '\u{1F4B3}', t('navSubscription')], ['adminAds', '\u{1F4E3}', t('navAds')], ['adminReports', '\u{1F4CA}', t('navReports')]]
    : [['teacherDash', '\u{1F3E0}', t('navTeacher')], ['subscription', '\u{1F4B3}', t('navSubscription')]];
  const navBtn = (v, ic, l, cls) => `<button class="${v === activeView ? 'active' : ''}" data-navto="${v}">${cls === 'bottom' ? `${ic}<span>${l}</span>` : `${ic} ${l}`}</button>`;
  return `${renderTopAdCarousel()}${topbar()}
  <div class="shell">
    <div class="sidebar no-print">${nav.map(([v, ic, l]) => navBtn(v, ic, l)).join('')}
    </div>
    <div class="main">${inner}</div>
  </div>
  <div class="bottomnav no-print">${nav.map(([v, ic, l]) => navBtn(v, ic, l, 'bottom')).join('')}</div>
  ${renderModal()}${renderToast()}`;
}

function renderToast() {
  if (!state.toast) return '';
  const bg = state.toast.kind === 'error' ? 'var(--danger)' : 'var(--teal)';
  return `<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:11px 20px;border-radius:10px;font-size:13.5px;font-weight:600;box-shadow:var(--shadow);z-index:200;">${esc(state.toast.msg)}</div>`;
}

/* ---------- AUTH GATE ---------- */
function renderAuthGate() {
  let inner;
  if (state.view === 'teacherAuth') inner = `<div class="auth-wrap">${renderTeacherAuthCard()}</div>`;
  else if (state.view === 'adminAuth') inner = `<div class="auth-wrap">${renderAdminAuthCard()}</div>`;
  else inner = `<div class="auth-wrap">
    <div class="auth-card" style="max-width:440px;">
      <div class="auth-title">${sealSVG(52)}<h1>TUGARAK<span style="color:var(--teal)">+</span></h1>
        <div class="muted">${t('tagline')}</div>
      </div>
      <button class="btn btn-teal block" data-goto="teacherAuth" style="margin-bottom:10px;">\u{1F9D1}\u200D\u{1F3EB} ${t('teacherRoleBtn')}</button>
      <button class="btn btn-outline block" data-goto="adminAuth">\u{1F6E1} ${t('adminRoleBtn')}</button>
      <div class="divider"></div>
      <div class="muted" style="text-align:center;font-size:12px;">${t('footerNote')}</div>
    </div>
  </div>`;
  // Modal (masalan shartnoma oynasi) va toast xabarnomasi kirishdan oldingi
  // sahifalarda ham ko'rinishi uchun shu yerda ham qo'shiladi.
  return `${langSwitcherHTML(true)}${inner}${renderModal()}${renderToast()}`;
}
function backToLanding() { return `<button class="link-btn" data-goto="landing" style="margin-bottom:14px;">${t('back')}</button>`; }

/* ---------- SHARTNOMA (alohida sahifa, modal emas) ---------- */
function renderContractView() {
  return `${langSwitcherHTML(true)}<div class="auth-wrap"><div class="auth-card" style="max-width:520px;">
    <div style="text-align:center;margin-bottom:6px;">${sealSVG(48)}<div class="brand" style="font-size:17px;margin-top:4px;">TUGARAK<span style="color:var(--teal)">+</span></div></div>
    <h2 style="text-align:center;margin-top:6px;">${t('contractPageTitle')}</h2>
    <div class="contract-text" style="max-height:360px;">${contractText()}</div>
    <label class="check-row"><input type="checkbox" id="contractCheck"> <span>${t('contractCheck')}</span></label>
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button type="button" class="btn btn-outline block" id="contractBackBtn">${t('cancel')}</button>
      <button type="button" class="btn btn-teal block" id="contractAcceptBtn">${t('accept')}</button>
    </div>
  </div></div>`;
}

function renderTeacherAuthCard() {
  const lockInfo = getLockInfo('teacher::' + (state.authEmailTry || ''));
  return `<div class="auth-card">${backToLanding()}
    <div class="auth-title">${sealSVG(46)}<h1>${t('teacherTitle')}</h1><div class="muted">${t('teacherSubtitle')}</div></div>
    <div class="auth-tabs">
      <button data-tab="login" class="${state.authTab === 'login' ? 'active' : ''}">${t('tabLogin')}</button>
      <button data-tab="register" class="${state.authTab === 'register' ? 'active' : ''}">${t('tabRegister')}</button>
    </div>
    ${state.authTab === 'login' ? renderTeacherLoginForm(lockInfo) : renderTeacherRegisterForm()}
  </div>`;
}

function renderTeacherLoginForm(lockInfo) {
  const f = state.loginForm;
  return `<form id="teacherLoginForm">
    <button type="button" class="btn btn-google" id="googleLoginBtn">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.4 29.4 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.6 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5c-7.8 0-14.5 4.5-17.7 10.2z"/><path fill="#4CAF50" d="M24 43.5c5.1 0 9.8-2 13.3-5.2l-6.1-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.4 0-9.9-3.1-11.3-7.6l-6.5 5C9.4 39 16.1 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.9 2.6-2.6 4.7-4.9 6.1l6.1 5.2C39.9 36.6 43.5 30.9 43.5 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
      ${t('googleBtn')}
    </button>
    <div class="divider"></div>
    <label>${t('emailLabel')}</label><input type="email" id="tlEmail" required placeholder="siz@example.com" value="${esc(f.email)}">
    <label>${t('passLabel')}</label><input type="password" id="tlPass" required placeholder="${t('passPh')}" value="${esc(f.password)}">
    ${lockInfo.locked ? `<div class="timer-box"><div>${t('lockedMsg')}</div><div class="big" id="lockCountdown">${lockInfo.remaining}s</div><div class="muted">${t('lockedWait')}</div></div>` : ''}
    <button class="btn btn-primary block" style="margin-top:16px;" ${lockInfo.locked ? 'disabled' : ''}>${t('loginBtn')}</button>
    <div style="text-align:center;margin-top:12px;"><button type="button" class="link-btn" id="forgotBtn">${t('forgotBtn')}</button></div>
  </form>`;
}

function renderTeacherRegisterForm() {
  const f = state.regForm;
  return `<form id="teacherRegForm">
    <label>${t('fullNameLabel')}</label><input type="text" id="rName" required placeholder="${t('fullNamePh')}" value="${esc(f.name)}">
    <label>${t('emailLabel')}</label><input type="email" id="rEmail" required placeholder="${t('emailPh')}" value="${esc(f.email)}">
    <label>${t('phoneLabel')}</label><input type="tel" id="rPhone" required placeholder="${t('phonePh')}" value="${esc(f.phone)}">
    <label>${t('passLabel')}</label><input type="password" id="rPass" required minlength="6" placeholder="${t('passMinPh')}" value="${esc(f.password)}">
    <div class="divider"></div>
    <div class="muted" style="margin-bottom:8px;">${t('contractIntroReg')}</div>
    <button type="button" class="btn btn-outline block" id="openContractBtn">${t('contractBtn')}</button>
    <div id="contractStatus" class="muted" style="margin-top:8px;">${state.pendingRegisterContract ? t('contractAccepted') : t('contractNotAccepted')}</div>
    <button class="btn btn-primary block" style="margin-top:16px;" ${state.pendingRegisterContract ? '' : 'disabled'}>${t('submitApp')}</button>
  </form>`;
}

function renderAdminAuthCard() {
  return `<div class="auth-card">${backToLanding()}
    <div class="auth-title">${sealSVG(46)}<h1>${t('adminTitle')}</h1><div class="muted">${t('adminSubtitle')}</div></div>
    <button type="button" class="btn btn-google" id="adminGoogleLoginBtn">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.4 29.4 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.6 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5c-7.8 0-14.5 4.5-17.7 10.2z"/><path fill="#4CAF50" d="M24 43.5c5.1 0 9.8-2 13.3-5.2l-6.1-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.4 0-9.9-3.1-11.3-7.6l-6.5 5C9.4 39 16.1 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.9 2.6-2.6 4.7-4.9 6.1l6.1 5.2C39.9 36.6 43.5 30.9 43.5 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
      ${t('googleBtn')}
    </button>
    <div class="muted" style="margin-top:14px;font-size:11.5px;text-align:center;">${t('adminNote')}</div>
  </div>`;
}

function renderGoogleCompleteScreen() {
  return `${langSwitcherHTML(true)}<div class="auth-wrap"><div class="auth-card">
    <div class="auth-title">${sealSVG(46)}<h1>${t('gcTitle')}</h1>
      <div class="muted">${esc(state.firebaseUser?.email || '')}</div></div>
    <form id="googleCompleteForm">
      <label>${t('gcPhoneLabel')}</label><input type="tel" id="gcPhone" required placeholder="${t('phonePh')}" value="${esc(state.regForm.phone)}">
      <div class="divider"></div>
      <div class="muted" style="margin-bottom:8px;">${t('gcContractIntro')}</div>
      <button type="button" class="btn btn-outline block" id="openContractBtn">${t('contractBtn')}</button>
      <div class="muted" style="margin-top:8px;">${state.pendingRegisterContract ? t('contractAccepted') : t('contractNotAccepted')}</div>
      <button class="btn btn-primary block" style="margin-top:16px;" ${state.pendingRegisterContract ? '' : 'disabled'}>${t('submitApp')}</button>
    </form>
  </div></div>${renderModal()}${renderToast()}`;
}

/* ---------- TEACHER PENDING ---------- */
function renderTeacherPending() {
  const ud = state.userDoc;
  const vb = emailVerifyBannerHTML();
  if (ud?.status === 'rejected') {
    return `${vb}<div class="card"><h2>${t('rejectedTitle')}</h2>
      <div class="error-box">${t('rejectedMsg')}</div>
      ${ud.rejectionReason ? `<div class="error-box" style="margin-top:10px;"><b>${t('rejectionReasonShown')}</b> ${esc(ud.rejectionReason)}</div>` : ''}
      <button class="btn btn-teal" id="openResubmitBtn" style="margin-top:16px;">${t('resubmitBtn')}</button>
    </div>`;
  }
  if (ud?.status === 'blocked') {
    return `${vb}<div class="card"><h2>${t('blockedTitle')}</h2>
      <div class="error-box">${t('blockedMsg')}</div>
    </div>`;
  }
  return `${vb}<div class="card"><h2>${t('pendingTitle')}</h2>
    <p class="muted">${t('pendingMsg', { name: esc(ud?.fullName || '') })}</p>
    ${ud?.resubmitReason ? `<div class="info-box" style="margin-top:10px;">\u{1F504} ${esc(ud.resubmitReason)}</div>` : ''}
    <div class="pill pending">${t('pendingPill')}</div></div>`;
}

/* ---------- ADMIN DASHBOARD ---------- */
function monthKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthShortLabel(key) {
  const [y, m] = key.split('-');
  const names = { uz: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'],
    ru: ['\u042f\u043d\u0432', '\u0424\u0435\u0432', '\u041c\u0430\u0440', '\u0410\u043f\u0440', '\u041c\u0430\u0439', '\u0418\u044e\u043d', '\u0418\u044e\u043b', '\u0410\u0432\u0433', '\u0421\u0435\u043d', '\u041e\u043a\u0442', '\u041d\u043e\u044f', '\u0414\u0435\u043a'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
  const arr = names[getLang()] || names.uz;
  return `${arr[parseInt(m) - 1]} ${y}`;
}
function renderAdminDash() {
  const pending = state.teachers.filter(tc => tc.status === 'pending');
  const approved = state.teachers.filter(tc => tc.status === 'approved');
  const rejected = state.teachers.filter(tc => tc.status === 'rejected');
  const blocked = state.teachers.filter(tc => tc.status === 'blocked');
  const tq = (state.teacherQuery || '').trim().toLowerCase();
  const matchTeacher = (tc) => !tq || [tc.fullName, tc.email, tc.phone].some(v => String(v || '').toLowerCase().includes(tq));
  const approvedShown = approved.filter(matchTeacher);

  // Eng faol o'qituvchilar: guruhlar soni bo'yicha reyting
  const groupCountByTeacher = {};
  state.allGroupsAdmin.forEach(g => { groupCountByTeacher[g.teacherId] = (groupCountByTeacher[g.teacherId] || 0) + 1; });
  const topTeachers = approved
    .map(tc => ({ ...tc, groupCount: groupCountByTeacher[tc.id] || 0 }))
    .sort((a, b) => b.groupCount - a.groupCount)
    .slice(0, 5)
    .filter(tc => tc.groupCount > 0);

  // Oylik yangi ro'yxatdan o'tishlar (oxirgi 6 oy)
  const monthCounts = {};
  state.teachers.forEach(tc => {
    if (!tc.createdAt?.toMillis) return;
    const key = monthKey(tc.createdAt.toMillis());
    monthCounts[key] = (monthCounts[key] || 0) + 1;
  });
  const monthKeys = Object.keys(monthCounts).sort().slice(-6);
  const maxMonthCount = Math.max(1, ...monthKeys.map(k => monthCounts[k]));

  return `
  <div class="stat-grid" style="margin-bottom:20px;">
    <div class="stat-card"><div class="num">${state.teachers.length}</div><div class="lbl">${t('statTotal')}</div></div>
    <div class="stat-card"><div class="num">${pending.length}</div><div class="lbl">${t('statPending')}</div></div>
    <div class="stat-card"><div class="num">${approved.length}</div><div class="lbl">${t('statApproved')}</div></div>
    <div class="stat-card"><div class="num">${rejected.length}</div><div class="lbl">${t('statRejected')}</div></div>
    ${blocked.length ? `<div class="stat-card"><div class="num">${blocked.length}</div><div class="lbl">${t('statBlocked')}</div></div>` : ''}
  </div>

  <div class="card">
    <h2>${t('statsTitle')}</h2>
    <div class="stat-grid" style="margin:14px 0;grid-template-columns:repeat(2,1fr);">
      <div class="stat-card"><div class="num">${state.allGroupsAdmin.length}</div><div class="lbl">${t('statsGroups')}</div></div>
      <div class="stat-card"><div class="num">${state.allStudentsAdmin.length}</div><div class="lbl">${t('statsStudents')}</div></div>
    </div>
    <div class="divider"></div>
    <h3 style="font-size:14px;margin:0 0 10px;">${t('mostActiveTitle')}</h3>
    ${topTeachers.length === 0 ? `<div class="muted">${t('mostActiveEmpty')}</div>` :
      topTeachers.map((tc, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--line);">
        <span><b>${i + 1}.</b> ${esc(tc.fullName)}</span>
        <span class="pill approved">${tc.groupCount} ${t('mostActiveGroupsSuffix')}</span>
      </div>`).join('')}
    <div class="divider"></div>
    <h3 style="font-size:14px;margin:0 0 10px;">${t('monthlyRegTitle')}</h3>
    ${monthKeys.length === 0 ? `<div class="muted">${t('mostActiveEmpty')}</div>` :
      monthKeys.map(k => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span class="muted" style="width:70px;font-size:12px;flex-shrink:0;">${monthShortLabel(k)}</span>
        <div class="progress-bar" style="flex:1;"><div style="width:${monthCounts[k] / maxMonthCount * 100}%;"></div></div>
        <span style="width:20px;font-size:12px;font-weight:700;text-align:right;">${monthCounts[k]}</span>
      </div>`).join('')}
  </div>

  <div class="card">
    <h2>${t('applicationsTitle')}</h2>
    <div class="muted">${t('applicationsDesc')}</div>
    <div class="divider"></div>
    ${pending.length === 0 ? `<div class="empty"><div class="big-icon">\u{1F4ED}</div>${t('emptyApps')}</div>` :
      pending.map(tc => `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 0;border-bottom:1px solid var(--line);">
        <div><b>${esc(tc.fullName)}</b> <span class="pill pending">${t('pendingPill')}</span><br>
        <span class="muted">${esc(tc.email)} \u00B7 ${esc(tc.phone || '')} \u00B7 ${tc.contractAccepted ? t('contractOk') : t('contractNo')}</span>
        ${tc.emailVerified === true ? `<br><span class="pill approved" style="margin-top:4px;">\u2709 ${t('verifiedPill')}</span>` : tc.emailVerified === false ? `<br><span class="pill rejected" style="margin-top:4px;">\u2709 ${t('unverifiedPill')}</span>` : ''}
        ${tc.resubmitReason ? `<div class="info-box" style="margin-top:6px;font-size:12px;">\u{1F504} ${esc(tc.resubmitReason)}</div>` : ''}
        ${tc.proofDocs?.length ? `<div style="margin-top:6px;">${tc.proofDocs.map(p => `<img src="${safeImgSrc(p)}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid var(--line);margin-right:4px;">`).join('')}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-teal" data-approve="${tc.id}">${t('approve')}</button>
          <button class="btn btn-danger" data-reject="${tc.id}">${t('reject')}</button>
        </div>
      </div>`).join('')}
  </div>
  <div class="card">
    <h2>${t('approvedTitle')}</h2>
    ${approved.length || tq ? `<input type="text" id="teacherSearch" placeholder="${t('teacherSearchPh')}" value="${esc(state.teacherQuery)}" style="margin-top:10px;">` : ''}
    <div class="divider"></div>
    ${approved.length === 0 ? `<div class="empty">${t('emptyApproved')}</div>` : approvedShown.length === 0 ? `<div class="empty">${t('noSearchResults')}</div>` : `
    <div style="overflow-x:auto;"><table><thead><tr><th>${t('colName')}</th><th>${t('colEmail')}</th><th>${t('colPhone')}</th><th></th></tr></thead><tbody>
    ${approvedShown.map(tc => `<tr><td>${esc(tc.fullName)}</td><td>${esc(tc.email)}</td><td>${esc(tc.phone || '')}</td>
      <td style="white-space:nowrap;"><button class="link-btn" data-block="${tc.id}" style="color:var(--danger);">${t('blockBtn')}</button></td></tr>`).join('')}
    </tbody></table></div>`}
  </div>
  ${blocked.length ? `<div class="card"><h2>${t('blockedListTitle')}</h2><div class="divider"></div>
    ${blocked.map(tc => `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);">
      <div><b>${esc(tc.fullName)}</b> <span class="pill rejected">${t('blockedPill')}</span><br><span class="muted">${esc(tc.email)} \u00B7 ${esc(tc.phone || '')}</span></div>
      <button class="btn btn-teal" data-unblock="${tc.id}">${t('unblockBtn')}</button></div>`).join('')}
  </div>` : ''}
  ${rejected.length ? `<div class="card"><h2>${t('rejectedListTitle')}</h2><div class="divider"></div>
    ${rejected.map(tc => `<div class="muted" style="padding:6px 0;">${esc(tc.fullName)} \u2014 ${esc(tc.email)}${tc.rejectionReason ? `<br><span style="color:var(--danger);font-size:12px;">${t('rejectionReasonShown')} ${esc(tc.rejectionReason)}</span>` : ''}</div>`).join('')}</div>` : ''}
  `;
}

/* ---------- OBUNA: admin boshqaruvi ---------- */
/* ---------- ADMIN: alohida sahifalar (sidebar orqali) ---------- */
function renderAdminNotificationsView() {
  return `<div class="card">
    <h2>${t('notifSectionTitle')}</h2>
    <div class="muted">${t('notifSectionDesc')}</div>
    <div class="divider"></div>
    <label>${t('notifTitleLabel')}</label><input type="text" id="notifTitle" placeholder="${t('notifTitlePh')}">
    <label>${t('notifMsgLabel')}</label>
    <textarea id="notifMessage" rows="3" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:14px;font-family:inherit;" placeholder="${t('notifMsgPh')}"></textarea>
    <button class="btn btn-teal" id="sendNotifBtn" style="margin-top:12px;">${t('notifSend')}</button>
  </div>`;
}
function renderAdminSubscriptionView() {
  return `${renderSubscriptionAdminCard()}${renderSubscriptionRequestsCard()}`;
}

function renderAdminReportsView() {
  const groups = state.allGroupsAdmin || [];
  const students = state.allStudentsAdmin || [];
  const groupAvg = (g) => {
    const gs = students.filter(s => s.groupId === g.id && s.grades?.length);
    if (!gs.length) return null;
    return gs.reduce((a, s) => a + studentAvg(s), 0) / gs.length;
  };
  const ranked = groups
    .map(g => ({ ...g, avg: groupAvg(g), studentCount: students.filter(s => s.groupId === g.id).length }))
    .filter(g => g.avg !== null)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);
  const overallAvg = (() => {
    const withGrades = students.filter(s => s.grades?.length);
    if (!withGrades.length) return 0;
    return withGrades.reduce((a, s) => a + studentAvg(s), 0) / withGrades.length;
  })();
  const teacherNameByUid = {};
  state.teachers.forEach(tc => { teacherNameByUid[tc.id] = tc.fullName; });

  return `<div class="card" id="reportPrintArea">
    <div style="display:none;" class="jurnal-header">
      <h2 style="text-align:center;margin:0 0 4px;">TUGARAK+ \u2014 TIZIM BO'YICHA HISOBOT</h2>
      <p style="text-align:center;margin:0 0 16px;">${t('reportGeneratedAt')} ${new Date().toLocaleDateString()}</p>
    </div>
    <h2 style="margin:0;">${t('adminReportsTitle')}</h2>
    <div class="muted">${t('adminReportsDesc')}</div>
    <div class="stat-grid" style="margin:16px 0;">
      <div class="stat-card"><div class="num">${state.teachers.filter(tc => tc.status === 'approved').length}</div><div class="lbl">${t('reportTotalTeachers')}</div></div>
      <div class="stat-card"><div class="num">${groups.length}</div><div class="lbl">${t('reportTotalGroups')}</div></div>
      <div class="stat-card"><div class="num">${students.length}</div><div class="lbl">${t('reportTotalStudents')}</div></div>
      <div class="stat-card"><div class="num">${overallAvg.toFixed(2)}</div><div class="lbl">${t('reportAvgScore')}</div></div>
    </div>
    <div class="divider"></div>
    <h3 style="font-size:14px;margin:0 0 10px;">${t('adminTopGroupsTitle')}</h3>
    ${ranked.length === 0 ? `<div class="empty">${t('adminTopGroupsEmpty')}</div>` : `
    <table><thead><tr><th>\u2116</th><th>${t('mGroupNameLabel')}</th><th>${t('colName')}</th><th>${t('profileStudents')}</th><th>${t('colAvg')}</th></tr></thead><tbody>
    ${ranked.map((g, i) => `<tr><td>${i + 1}</td><td><b>${esc(g.name)}</b></td><td>${esc(teacherNameByUid[g.teacherId] || '\u2014')}</td><td>${g.studentCount}</td><td><b>${g.avg.toFixed(2)}</b></td></tr>`).join('')}
    </tbody></table>`}
    <div class="no-print" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;">
      <button class="btn btn-primary" id="downloadReportBtn">${t('adminDownloadReport')}</button>
      <button class="btn btn-outline" id="adminExcelBtn">${t('exportExcelBtn')}</button>
      <button class="btn btn-outline" id="adminRefreshBtn">${t('refreshBtn')}</button>
    </div>
  </div>`;
}

function renderAdminAdsView() {
  const todayStr = localDateStr();
  return `<div class="card">
    <h2>${t('adsAdminTitle')}</h2>
    <div class="muted">${t('adsAdminDesc')}</div>
    <div class="divider"></div>
    <label>${t('adsTitleLabel')}</label><input type="text" id="adTitle" placeholder="${t('adsTitlePh')}">
    <label>${t('adsTextLabel')}</label>
    <textarea id="adText" rows="2" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:14px;font-family:inherit;" placeholder="${t('adsTextPh')}"></textarea>
    <label>${t('adsLinkLabel')}</label><input type="text" id="adLink" placeholder="${t('adsLinkPh')}">
    <div class="grid2">
      <div><label>${t('adsStartDateLabel')}</label><input type="date" id="adStartDate" value="${todayStr}"></div>
      <div><label>${t('adsEndDateLabel')}</label><input type="date" id="adEndDate"></div>
    </div>
    <label>${t('adsImageLabel')}</label>
    <div class="upload-drop" id="adImageDropZone" style="margin-top:6px;">
      <input type="file" id="adImageInput" accept="image/*" style="display:none;">${t('mPickPhoto')}
    </div>
    <div id="adImagePreviewWrap"></div>
    <button class="btn btn-teal" id="saveAdBtn" style="margin-top:16px;">${t('adsSave')}</button>
  </div>
  <div class="card">
    <h3 style="margin:0 0 10px;font-size:14px;">${t('adsPreview')}</h3>
    ${state.ads.length === 0 ? `<div class="empty">${t('docEmpty')}</div>` :
      state.ads.map(ad => {
        const isLive = isAdCurrentlyActive(ad);
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${ad.image ? `<img src="${safeImgSrc(ad.image)}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--line);">` : ''}
          <div>
            <b>${esc(ad.title || '')}</b> <span class="pill ${isLive ? 'approved' : 'pending'}">${isLive ? t('adsLive') : t('adsNotLive')}</span><br>
            <span class="muted" style="font-size:12px;">${esc((ad.text || '').slice(0, 60))}</span><br>
            <span class="muted" style="font-size:11px;">${esc(ad.startDate || '\u2014')} \u2192 ${esc(ad.endDate || t('adsNoEndDate'))}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <label class="check-row" style="margin:0;"><input type="checkbox" data-toggle-ad="${ad.id}" ${ad.enabled ? 'checked' : ''}> <span style="font-size:12px;">${t('adsEnableToggle')}</span></label>
          <button class="link-btn" data-delad="${ad.id}" style="color:var(--danger);">${t('docDelete')}</button>
        </div>
      </div>`;
      }).join('')}
  </div>`;
}

function isAdCurrentlyActive(ad) {
  if (!ad.enabled) return false;
  const today = localDateStr();
  if (ad.startDate && today < ad.startDate) return false;
  if (ad.endDate && today > ad.endDate) return false;
  return true;
}

function renderTopAdCarousel() {
  const active = (state.ads || []).filter(isAdCurrentlyActive);
  if (!active.length || state.adDismissed) return '';
  return `<div class="ad-carousel no-print" id="adCarousel">
    <button class="ad-carousel-close" id="adCarouselClose" aria-label="Yopish">\u2715</button>
    <div class="ad-carousel-track" id="adBannerTrack">
      ${active.map(ad => `<a class="ad-slide" href="${esc(safeHttpUrl(ad.link))}" target="${ad.link ? '_blank' : '_self'}" rel="noopener noreferrer">
        ${ad.image ? `<img class="ad-slide-thumb" src="${safeImgSrc(ad.image)}">` : ''}
        <div class="ad-slide-body">
          <span class="ad-slide-label">${t('adsBannerLabel')}</span>
          <div class="ad-slide-title">${esc(ad.title || '')}</div>
          <div class="ad-slide-text">${esc(ad.text || '')}</div>
        </div>
      </a>`).join('')}
    </div>
    ${active.length > 1 ? `<div class="ad-dots">${active.map((_, i) => `<span class="ad-dot ${i === 0 ? 'active' : ''}"></span>`).join('')}</div>` : ''}
  </div>`;
}

function renderSubscriptionAdminCard() {
  const sub = state.subscription || {};
  const plans = sub.plans || {};
  const planCard = (key, labelKey) => {
    const p = plans[key] || { price: 0, discount: 0, maxGroups: 0, features: [] };
    return `<div class="card" style="margin-bottom:0;">
      <h3 style="margin:0 0 10px;font-size:15px;">${t(labelKey)}</h3>
      <label>${t('subPriceLabel')}</label><input type="text" inputmode="numeric" id="subPrice_${key}" value="${p.price || 0}">
      <label>${t('subDiscountLabel')}</label><input type="text" inputmode="numeric" id="subDiscount_${key}" value="${p.discount || 0}">
      <label>${t('subMaxGroupsLabel')}</label><input type="text" inputmode="numeric" id="subMaxGroups_${key}" value="${p.maxGroups ?? 0}">
      <label>${t('subMaxStudentsLabel')}</label><input type="text" inputmode="numeric" id="subMaxStudents_${key}" value="${p.maxStudents ?? 0}">
      <div class="info-box" style="font-size:11px;padding:7px 10px;">${t('subLimitNote')}</div>
      <label>${t('subFeaturesLabel')}</label>
      <textarea id="subFeatures_${key}" rows="4" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:13px;font-family:inherit;">${esc((p.features || []).join('\n'))}</textarea>
    </div>`;
  };
  return `<div class="card">
    <h2>${t('subAdminTitle')}</h2>
    <div class="muted">${t('subAdminDesc')}</div>
    <div class="divider"></div>
    <label class="check-row" style="margin-top:0;"><input type="checkbox" id="subEnabled" ${sub.enabled ? 'checked' : ''}> <span>${t('subEnableToggle')}</span></label>
    <div class="divider"></div>
    <div class="plan-grid">
      ${planCard('free', 'subFree')}
      ${planCard('monthly', 'subMonthly')}
      ${planCard('yearly', 'subYearly')}
    </div>
    <button class="btn btn-teal" id="saveSubBtn" style="margin-top:16px;">${t('subSavePlans')}</button>
  </div>`;
}

/* ---------- OBUNA SO'ROVLARI (admin ko'rinishi) ---------- */
function renderSubscriptionRequestsCard() {
  const planLabels = { free: 'subFree', monthly: 'subMonthly', yearly: 'subYearly' };
  const requests = state.teachers.filter(tc => tc.selectedPlan);
  return `<div class="card">
    <h2>${t('subRequestsTitle')}</h2>
    <div class="muted">${t('subRequestsDesc')}</div>
    <div class="divider"></div>
    ${requests.length === 0 ? `<div class="empty">${t('subRequestsEmpty')}</div>` :
      requests.map(tc => {
        const isActivePlan = tc.plan === tc.selectedPlan;
        return `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 0;border-bottom:1px solid var(--line);">
        <div>
          <b>${esc(tc.fullName)}</b> <span class="tag-subject">${t(planLabels[tc.selectedPlan] || 'subFree')}</span>
          <span class="pill ${tc.planContacted ? 'approved' : 'pending'}">${tc.planContacted ? t('subRequestContacted') : t('subRequestNew')}</span>
          ${isActivePlan ? `<span class="pill approved">\u2705 ${t('subActivateBtn')}</span>` : ''}<br>
          <span class="muted">${esc(tc.email)} \u00B7 ${esc(tc.phone || '')}</span>
        </div>
        <div style="display:flex;gap:8px;">
          ${!tc.planContacted ? `<button class="btn btn-outline" data-markcontacted="${tc.id}">${t('subMarkContacted')}</button>` : ''}
          ${!isActivePlan ? `<button class="btn btn-teal" data-activateplan="${tc.id}" data-plankey="${tc.selectedPlan}">${t('subActivateBtn')}</button>` : ''}
        </div>
      </div>`;
      }).join('')}
  </div>`;
}

/* ---------- OBUNA: o'qituvchi ko'rinishi ---------- */
function renderSubscriptionView() {
  const sub = state.subscription || {};
  const plans = sub.plans || {};
  const myPlan = state.userDoc?.plan || 'free';
  const status = getSubStatus();
  const fmt = (n) => Number(n || 0).toLocaleString();
  const ICONS = { free: '\u{1F331}', monthly: '\u2B50', yearly: '\u{1F451}' };
  const planCard = (key, labelKey) => {
    const p = plans[key] || { price: 0, discount: 0, features: [] };
    const finalPrice = p.discount ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
    const isCurrent = myPlan === key;
    return `<div class="plan-card plan-${key}" style="${isCurrent ? 'box-shadow:0 0 0 3px var(--teal);' : ''}">
      ${key === 'yearly' ? `<div class="plan-badge">\u2728 ${t('subBestValue')}</div>` : ''}
      <div class="plan-icon">${ICONS[key]}</div>
      <h3 style="margin:0 0 6px;font-size:18px;">${t(labelKey)}</h3>
      ${p.discount ? `<div class="muted" style="text-decoration:line-through;">${fmt(p.price)}</div>` : ''}
      <div class="plan-price">
        ${key === 'free' ? t('subFree') : fmt(finalPrice)}
        ${key !== 'free' ? `<span style="font-size:13px;color:var(--ink-soft);font-weight:600;">${key === 'monthly' ? t('subPricePerMonth') : t('subPricePerYear')}</span>` : ''}
      </div>
      ${p.discount ? `<div class="pill approved">-${num(p.discount)}% ${t('subDiscount')}</div>` : '<div style="height:24px;"></div>'}
      <ul class="plan-features">
        ${(p.features || []).map(f => `<li><span>\u2705</span><span>${esc(f)}</span></li>`).join('') || `<li class="muted">\u2014</li>`}
      </ul>
      ${isCurrent ? `<div class="pill approved" style="margin-bottom:8px;">${t('subCurrent')}</div>${key !== 'free' ? `<button class="btn btn-outline block" data-chooseplan="${key}">${t('subRenewBtn')}</button>` : ''}` : `<button class="btn ${key === 'yearly' ? 'btn-primary' : key === 'monthly' ? 'btn-teal' : 'btn-outline'} block" data-chooseplan="${key}">${t('subChoose')}</button>`}
    </div>`;
  };
  return `
  <div class="card">
    <h2 style="margin:0;">${t('subTitle')}</h2>
    <div class="muted">${t('subDesc')}</div>
    ${!sub.enabled ? `<div class="info-box" style="margin-top:12px;">${t('subDisabledNote')}</div>` : ''}
    ${sub.enabled && myPlan !== 'free' && status.state === 'active' ? `<div class="info-box" style="margin-top:12px;">${t('subActiveUntil')} ${status.expiresAtMs ? new Date(status.expiresAtMs).toLocaleDateString() : '\u2014'}</div>
    <button class="btn btn-danger" id="cancelSubBtn" style="margin-top:12px;">${t('subCancelBtn')}</button>` : ''}
    ${status.state === 'expired' ? `<div class="error-box" style="margin-top:12px;">${t('subExpiredBanner', { limit: (plans.free?.maxGroups ?? 1) })}</div>` : ''}
  </div>
  <div class="plan-grid">
    ${planCard('free', 'subFree')}
    ${planCard('monthly', 'subMonthly')}
    ${planCard('yearly', 'subYearly')}
  </div>`;
}

/* ---------- TEACHER DASHBOARD ---------- */
/** Bahoni (sana + fan + qiymat bo'yicha) topadi: ro'yxat tartibi o'zgarsa ham to'g'ri bahoga tegadi. */
function findGrade(s, ref) {
  if (!ref) return null;
  return (s.grades || []).find(g => g.date === ref.date && g.subject === ref.subject && num(g.value) === ref.value) || null;
}
function validGradeValues(s) { return (s.grades || []).map(g => num(g.value)).filter(v => v >= 1 && v <= 5); }
function studentAvg(s) { const v = validGradeValues(s); if (!v.length) return 0; return v.reduce((a, b) => a + b, 0) / v.length; }
function studentAttendancePercent(studentId) {
  if (!state.attendance.length) return null;
  let total = 0, present = 0;
  state.attendance.forEach(a => {
    if (a.records && Object.prototype.hasOwnProperty.call(a.records, studentId)) {
      total++;
      if (a.records[studentId]) present++;
    }
  });
  if (!total) return null;
  return Math.round((present / total) * 100);
}
function gradeClass(v) { if (v >= 5) return 'g5'; if (v >= 4) return 'g4'; if (v >= 3) return 'g3'; return 'g2'; }
function levelLabel(avg) {
  if (avg === 0) return { label: t('levelUngraded'), c: 'var(--ink-soft)' };
  if (avg >= 4.5) return { label: t('levelExcellent'), c: 'var(--teal)' };
  if (avg >= 3.5) return { label: t('levelGood'), c: '#2E6FA8' };
  if (avg >= 3) return { label: t('levelSatisfactory'), c: 'var(--gold)' };
  return { label: t('levelUnsatisfactory'), c: 'var(--danger)' };
}

/* ---------- TO'LOV (oylik to'lov muddati) ----------
   O'quvchida: payDue — keyingi to'lov muddati, payDay — har oyning to'lov kuni, paidThrough — oxirgi
   to'langan muddat, payHistory — to'lovlar tarixi. "To'ladi" bosilganda paidThrough = payDue bo'ladi
   va payDue bir oyga suriladi. Shu tufayli holat har doim sanadan hisoblanadi (qo'shimcha yangilash kerak emas). */
const PAY_WARN_DAYS = 3;
const pad2 = (n) => String(n).padStart(2, '0');
function parseYMD(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function daysBetween(fromStr, toStr) {
  const a = parseYMD(fromStr), b = parseYMD(toStr);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}
/** Sanani bir oyga suradi, oyning kuni (day) saqlanadi (qisqa oyda oxirgi kunga tushadi). */
function addMonthKeepDay(dateStr, day) {
  const p = parseYMD(dateStr);
  if (!p) return '';
  let y = p.y, m = p.m + 1;
  if (m > 12) { m = 1; y++; }
  return `${y}-${pad2(m)}-${pad2(Math.min(day || p.d, daysInMonth(y, m)))}`;
}
/** Bugundan boshlab eng yaqin to'lov kuni (bugun ham hisoblanadi). */
function nextDueFromDay(payDay, todayStr) {
  const t0 = parseYMD(todayStr || localDateStr());
  const cand = Math.min(payDay, daysInMonth(t0.y, t0.m));
  if (cand >= t0.d) return `${t0.y}-${pad2(t0.m)}-${pad2(cand)}`;
  return addMonthKeepDay(`${t0.y}-${pad2(t0.m)}-${pad2(t0.d)}`, payDay);
}
function validPayDay(v) { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null; }
function fmtDMY(str) { const p = parseYMD(str); return p ? `${pad2(p.d)}.${pad2(p.m)}.${p.y}` : ''; }
function fmtMoney(n) { return Number(n || 0).toLocaleString('ru-RU'); }

function payStatus(s) {
  if (!parseYMD(s.payDue)) return { kind: 'none' };
  const today = localDateStr();
  if (parseYMD(s.paidThrough) && s.paidThrough >= today) return { kind: 'paid', until: s.paidThrough };
  const days = daysBetween(today, s.payDue);
  if (days < 0) return { kind: 'overdue', days: -days };
  if (days <= PAY_WARN_DAYS) return { kind: 'soon', days };
  return { kind: 'ok', days };
}
function payText(st) {
  if (st.kind === 'paid') return t('payStatusPaid', { date: fmtDMY(st.until) });
  if (st.kind === 'overdue') return t('payStatusOverdue', { n: st.days });
  if (st.kind === 'soon') return st.days === 0 ? t('payStatusToday') : t('payDaysLeft', { n: st.days });
  if (st.kind === 'ok') return t('payDaysLeft', { n: st.days });
  return t('payStatusNone');
}
function payStyle(kind) {
  if (kind === 'paid') return 'background:var(--teal);color:#fff;';
  if (kind === 'overdue') return 'background:var(--danger);color:#fff;';
  if (kind === 'soon') return 'background:var(--gold);color:#fff;';
  if (kind === 'ok') return 'background:var(--paper-2);color:var(--ink);';
  return 'background:transparent;color:var(--ink-soft);border:1px dashed var(--line);';
}
function monthCollected(students) {
  const now = new Date();
  let sum = 0;
  students.forEach(s => (Array.isArray(s.payHistory) ? s.payHistory : []).forEach(h => {
    const at = num(h.at);
    if (!at) return;
    const d = new Date(at);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) sum += num(h.amount);
  }));
  return sum;
}
/** Faol guruhda to'lov kuni belgilangan bo'lsa, yangi o'quvchilar uchun boshlang'ich muddat. */
function groupPayDefaults() {
  const g = state.groups.find(x => x.id === state.activeGroupId);
  const day = validPayDay(g?.payDay);
  return day ? { payDay: day, payDue: nextDueFromDay(day) } : {};
}
async function markStudentPaid(s, amount) {
  if (!parseYMD(s.payDue)) { toast(t('payNoDue'), 'error'); return false; }
  const day = validPayDay(s.payDay) || parseYMD(s.payDue).d;
  const hist = Array.isArray(s.payHistory) ? s.payHistory : [];
  const entry = { at: Date.now(), due: s.payDue, amount: Math.max(0, Math.round(num(amount))), prev: s.paidThrough || '' };
  await updateStudentPayment(s.id, {
    paidThrough: s.payDue, payDue: addMonthKeepDay(s.payDue, day), payDay: day,
    payHistory: [...hist, entry].slice(-24)
  });
  toast(t('payMarked'), 'info');
  return true;
}

/** Qidiruv va saralash. Standart tartib — qo'shilgan vaqti bo'yicha. */
function visibleStudents(students) {
  const q = (state.studentQuery || '').trim().toLowerCase();
  let list = q ? students.filter(s => (s.fullName || '').toLowerCase().includes(q) || (s.className || '').toLowerCase().includes(q)) : [...students];
  const created = (s) => s.createdAt?.toMillis ? s.createdAt.toMillis() : Infinity; // hali yozilayotgani oxirida
  const byName = (a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'uz');
  const graded = (s) => (s.grades && validGradeValues(s).length) ? studentAvg(s) : null;
  const sort = state.studentSort;
  if (sort === 'nameAsc') list.sort(byName);
  else if (sort === 'avgDesc') list.sort((a, b) => (graded(b) ?? -1) - (graded(a) ?? -1) || byName(a, b));
  else if (sort === 'avgAsc') list.sort((a, b) => (graded(a) ?? 99) - (graded(b) ?? 99) || byName(a, b));
  else if (sort === 'pay') {
    const rank = { overdue: 0, soon: 1, ok: 2, none: 3, paid: 4 };
    list.sort((a, b) => rank[payStatus(a).kind] - rank[payStatus(b).kind] || byName(a, b));
  } else list.sort((a, b) => created(a) - created(b));
  return list;
}

function renderTeacherDash() {
  const myGroups = state.groups;
  const activeGroup = myGroups.find(g => g.id === state.activeGroupId) || myGroups[0];
  // MUHIM: agar activeGroupId hali sozlanmagan (null) bo'lsa-yu, birinchi guruh
  // "standart" sifatida ko'rsatilayotgan bo'lsa — uni haqiqiy tanlangan holatga
  // sinxronlaymiz. Aks holda "O'chirish"/"Tahrirlash" kabi tugmalar noto'g'ri
  // (bo'sh) ID bilan ishlab, "ruxsat yo'q" xatosini berardi.
  if (activeGroup && state.activeGroupId !== activeGroup.id) {
    state.activeGroupId = activeGroup.id;
    syncActiveGroup();
  }
  const status = getSubStatus();
  const limit = getGroupLimit();
  return `
  ${status.state === 'expired' ? `<div class="error-box no-print" style="margin-bottom:16px;">${t('subExpiredBanner', { limit })} <button class="link-btn" data-navto="subscription">${t('subRenewBtn')}</button></div>` : ''}
  ${emailVerifyBannerHTML()}
  ${subExpiringBannerHTML(status)}
  <div class="card no-print">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div><h2 style="margin:0;">${t('groupsTitle')}</h2><div class="muted">${t('groupsDesc')}</div></div>
      <button class="btn btn-teal" id="newGroupBtn">${t('newGroupBtn')}</button>
    </div>
    ${myGroups.length ? `<div class="divider"></div><div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${myGroups.map(g => `<button class="btn ${g.id === state.activeGroupId ? 'btn-primary' : 'btn-outline'}" data-selectgroup="${g.id}">${isGroupLocked(g) ? '\u{1F512} ' : ''}${esc(g.name)} <span class="muted" style="opacity:.8">\u00B7 ${esc(g.subject)}</span></button>`).join('')}
    </div>` : `<div class="empty" style="padding-top:14px;"><div class="big-icon">\u{1F4DA}</div>${t('emptyGroups')}</div>`}
  </div>
  ${activeGroup ? renderGroupPanel(activeGroup) : ''}
  `;
}

function renderPayBanner(students) {
  if (!students.some(s => parseYMD(s.payDue))) return '';
  const rows = students.map(s => ({ s, st: payStatus(s) }));
  const overdue = rows.filter(x => x.st.kind === 'overdue').sort((a, b) => b.st.days - a.st.days);
  const soon = rows.filter(x => x.st.kind === 'soon').sort((a, b) => a.st.days - b.st.days);
  const paidCount = rows.filter(x => x.st.kind === 'paid').length;
  const total = monthCollected(students);
  const names = (arr, label) => arr.slice(0, 8).map(x => `${esc(x.s.fullName)} (${label(x.st)})`).join(', ') + (arr.length > 8 ? ` +${arr.length - 8}` : '');
  return `<div class="info-box no-print" style="margin-top:14px;">
    <b>${t('payBannerTitle')}</b>
    ${overdue.length ? `<div style="color:var(--danger);margin-top:6px;">\u26A0 <b>${t('payBannerOverdue', { n: overdue.length })}:</b> ${names(overdue, st => `${st.days} ${t('payDayShort')}`)}</div>` : ''}
    ${soon.length ? `<div style="margin-top:6px;color:var(--gold);">\u23F0 <b>${t('payBannerSoon', { days: PAY_WARN_DAYS, n: soon.length })}:</b> ${names(soon, st => st.days === 0 ? t('payStatusToday') : `${st.days} ${t('payDayShort')}`)}</div>` : ''}
    <div class="muted" style="margin-top:6px;">${t('payBannerPaid', { n: paidCount })}${total ? ` \u00B7 ${t('payMonthTotal', { sum: fmtMoney(total) })}` : ''}</div>
  </div>`;
}

function renderGroupPanel(group) {
  const locked = isGroupLocked(group);
  const students = state.students.filter(s => s.groupId === group.id);
  const shown = visibleStudents(students);
  const withGrades = students.filter(s => s.grades && s.grades.length);
  const avg = withGrades.length ? withGrades.reduce((a, s) => a + studentAvg(s), 0) / withGrades.length : 0;
  const isOwner = group.teacherId === state.firebaseUser?.uid;
  const sortOpt = (v, key) => `<option value="${v}" ${state.studentSort === v ? 'selected' : ''}>${t(key)}</option>`;
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div><h2 style="margin:0;">${esc(group.name)}</h2><span class="tag-subject">${esc(group.subject)}</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;" class="no-print">
        <button class="btn btn-teal" id="addStudentMenuBtn" ${locked ? 'disabled' : ''}>${t('addStudentMenuBtn')}</button>
        <button class="btn btn-outline" id="attendanceBtn" ${locked ? 'disabled' : ''}>${t('attendanceBtn')}</button>
        <button class="btn btn-outline" id="payBtn" ${locked ? 'disabled' : ''}>${t('payBtn')}</button>
        <button class="btn btn-outline" id="docsBtn">${t('docsBtn')}</button>
        <button class="btn btn-outline" id="reportsMenuBtn">${t('reportsMenuBtn')}</button>
        ${isOwner ? `<button class="btn btn-outline" id="groupSettingsBtn">${t('groupSettingsBtn')}</button>` : ''}
      </div>
    </div>
    ${locked ? `<div class="error-box" style="margin-top:12px;"><b>${t('groupLockedTitle')}</b><br>${t('groupLockedMsg')} <button class="link-btn" data-navto="subscription">${t('subRenewBtn')}</button></div>` : ''}
    ${renderPayBanner(students)}
    <div class="divider"></div>
    ${students.length === 0 ? `<div class="empty"><div class="big-icon">\u{1F9D2}</div>${t('emptyStudents')}</div>` : `
    <div class="no-print" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
      <input type="text" id="studentSearch" placeholder="${t('searchPh')}" value="${esc(state.studentQuery)}" style="flex:1;min-width:180px;">
      <select id="studentSort" style="flex:0 1 260px;">
        ${sortOpt('added', 'sortAdded')}${sortOpt('nameAsc', 'sortNameAsc')}${sortOpt('avgDesc', 'sortAvgDesc')}${sortOpt('avgAsc', 'sortAvgAsc')}${sortOpt('pay', 'sortPay')}
      </select>
    </div>
    <div style="display:none;" class="jurnal-header" id="jurnalHeader">
      <h2 style="text-align:center;margin:0 0 4px;">TO'GARAK JURNALI</h2>
      <p style="text-align:center;margin:0 0 4px;">"${esc(group.name)}" to'garagi \u2014 ${esc(group.subject)}</p>
      <p style="text-align:center;margin:0 0 16px;">Rahbar: ${esc(state.userDoc?.fullName || '')} &nbsp;\u00B7&nbsp; ${new Date().getFullYear()}-${new Date().getFullYear() + 1} o'quv yili</p>
    </div>
    ${shown.length === 0 ? `<div class="empty">${t('noSearchResults')}</div>` : `
    <div style="overflow-x:auto;">
    <table><thead><tr><th>${t('colNum')}</th><th>${t('colPhoto')}</th><th>${t('colFullName')}</th><th>${t('colClass')}</th><th>${t('colGrades')}</th><th>${t('colAvg')}</th><th>${t('colLevel')}</th><th>${t('colAttendance')}</th><th>${t('payColLabel')}</th><th class="no-print"></th></tr></thead><tbody>
    ${shown.map((s, i) => {
      const a = studentAvg(s); const lvl = levelLabel(a);
      const att = studentAttendancePercent(s.id);
      const ps = payStatus(s);
      return `<tr>
        <td>${i + 1}</td>
        <td>${s.photo ? `<img class="student-photo" src="${safeImgSrc(s.photo)}">` : '\u2014'}</td>
        <td><b>${esc(s.fullName)}</b>${s.fromPhoto ? ` <span class="muted" style="font-size:11px;">${t('fromPhotoTag')}</span>` : ''}</td>
        <td>${esc(s.className || '\u2014')}</td>
        <td>${(s.grades || []).map((g, gi) => `<span class="grade ${gradeClass(num(g.value))}" ${locked ? '' : `data-editgrade="${s.id}:${gi}" role="button" tabindex="0" style="cursor:pointer;"`} title="${esc(g.subject)}${g.period ? ' \u00B7 ' + esc(periodLabel(g.period)) : ''}">${num(g.value)}</span>`).join(' ') || '<span class="muted">\u2014</span>'}
          <button class="link-btn no-print" data-addgrade="${s.id}" style="margin-left:6px;" ${locked ? 'disabled' : ''}>${t('addGradeLink')}</button></td>
        <td><b>${a ? a.toFixed(2) : '\u2014'}</b></td>
        <td><span style="color:${lvl.c};font-weight:700;">${lvl.label}</span>
          <div class="progress-bar" style="margin-top:4px;"><div style="width:${Math.min(100, a / 5 * 100)}%;"></div></div></td>
        <td>${att === null ? '<span class="muted">\u2014</span>' : `<b>${att}%</b>`}</td>
        <td style="white-space:nowrap;">
          <button type="button" data-paystudent="${s.id}" ${locked ? 'disabled' : ''} style="border:none;border-radius:14px;padding:3px 9px;font-size:11.5px;font-weight:700;cursor:pointer;${payStyle(ps.kind)}">${esc(payText(ps))}</button>
          ${ps.kind === 'ok' || ps.kind === 'soon' || ps.kind === 'overdue' ? `<button class="link-btn no-print" data-quickpay="${s.id}" title="${t('payQuickTitle')}" style="margin-left:4px;font-size:15px;" ${locked ? 'disabled' : ''}>\u2713</button>` : ''}
        </td>
        <td class="no-print" style="white-space:nowrap;">
          <button class="link-btn" data-editstudent="${s.id}" ${locked ? 'disabled' : ''}>${t('editLink')}</button>
          <button class="link-btn" data-delstudent="${s.id}" style="color:var(--danger);margin-left:8px;" ${locked ? 'disabled' : ''}>${t('deleteLink')}</button></td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`}
    <div class="divider"></div>
    <div class="muted">${t('groupAvgLabel')} <b style="color:var(--navy)">${avg.toFixed(2)}</b> / 5.00 &nbsp;\u00B7&nbsp; ${t('groupProgressLabel')} <b style="color:var(--teal)">${withGrades.length ? Math.round(withGrades.filter(s => studentAvg(s) >= 3).length / withGrades.length * 100) : 0}%</b></div>
    `}
  </div>`;
}

/* ---------- MODALS ---------- */
function renderModal() {
  if (!state.modal) return '';
  const m = state.modal;
  if (m.type === 'editStudent') {
    const s = state.students.find(x => x.id === m.studentId);
    if (!s) return '';
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:440px;">
      <h2>${t('editStudentTitle')}</h2>
      <label>${t('mFioLabel')}</label><input type="text" id="esName" value="${esc(s.fullName || '')}">
      <label>${t('mClassLabel')}</label><input type="text" id="esClass" value="${esc(s.className || '')}">
      <div class="grid2">
        <div><label>${t('birthDateLabel')}</label><input type="date" id="esBirth" value="${esc(s.birthDate || '')}"></div>
        <div><label>${t('addressLabel')}</label><input type="text" id="esAddress" value="${esc(s.address || '')}"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="esSave">${t('mSave')}</button>
      </div></div></div>`;
  }
  if (m.type === 'editGrade') {
    const s = state.students.find(x => x.id === m.studentId);
    const g = s ? findGrade(s, m.ref) : null;
    if (!g) return '';
    const v = num(g.value);
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:380px;">
      <h2>${t('editGradeTitle')}</h2>
      <label>${t('mSubjectShortLabel')}</label><input type="text" id="grSubject" value="${esc(g.subject || '')}">
      <label>${t('mGradeLabel')}</label>
      <select id="grValue">${[5, 4, 3, 2].map(n => `<option value="${n}" ${v === n ? 'selected' : ''}>${t(['', '', 'gradeUnsatisfactory', 'gradeSatisfactory', 'gradeGood', 'gradeExcellent'][n])}</option>`).join('')}</select>
      <label>${t('mPeriodLabel')}</label>
      <select id="grPeriod">${monthOptionsHTML(monthIndexOf(g.period), true)}</select>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="grSave">${t('mSave')}</button>
      </div>
      <button class="btn btn-danger block" id="grDelete" style="margin-top:10px;">${t('gradeDelete')}</button>
    </div></div>`;
  }
  if (m.type === 'paySettings') {
    const group = state.groups.find(g => g.id === m.groupId);
    if (!group) return '';
    const isOwner = group.teacherId === state.firebaseUser?.uid;
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:440px;">
      <h2>${t('paySettingsTitle')}</h2>
      <label>${t('payFeeLabel')}</label><input type="text" inputmode="numeric" id="psFee" value="${num(group.fee) || ''}" ${isOwner ? '' : 'disabled'}>
      ${isOwner ? '' : `<div class="muted" style="font-size:12px;margin-top:4px;">${t('payOwnerOnly')}</div>`}
      <label>${t('payDayLabel')}</label><input type="text" inputmode="numeric" id="psDay" value="${validPayDay(group.payDay) || ''}" placeholder="1\u201331">
      <label class="check-row"><input type="checkbox" id="psApplyAll"> <span>${t('payApplyAll')}</span></label>
      <div class="muted" style="font-size:12px;margin-top:4px;">${t('payApplyHint')}</div>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="psSave">${t('mSave')}</button>
      </div></div></div>`;
  }
  if (m.type === 'studentPay') {
    const s = state.students.find(x => x.id === m.studentId);
    if (!s) return '';
    const group = state.groups.find(g => g.id === s.groupId);
    const ps = payStatus(s);
    const hist = (Array.isArray(s.payHistory) ? s.payHistory : []).slice().reverse().slice(0, 12);
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:460px;">
      <h2>${t('payStudentTitle', { name: esc(s.fullName) })}</h2>
      <div style="margin:6px 0 4px;"><span style="display:inline-block;border-radius:14px;padding:3px 10px;font-size:12px;font-weight:700;${payStyle(ps.kind)}">${esc(payText(ps))}</span></div>
      <label>${t('payDueLabel')}</label><input type="date" id="spDue" value="${esc(s.payDue || '')}">
      <button class="btn btn-outline block" id="spSaveDue" style="margin-top:8px;">${t('payDueSave')}</button>
      <div class="divider"></div>
      <label>${t('payAmountLabel')}</label><input type="text" inputmode="numeric" id="spAmount" value="${num(group?.fee) || ''}">
      <button class="btn btn-teal block" id="spMarkPaid" style="margin-top:8px;">${t('payMarkPaid')}</button>
      <div class="divider"></div>
      <h3 style="font-size:14px;margin:0 0 8px;">${t('payHistoryTitle')}</h3>
      ${hist.length === 0 ? `<div class="muted" style="font-size:12.5px;">${t('payHistoryEmpty')}</div>` : hist.map(h => `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--line);font-size:13px;">
        <span>${esc(formatDateDMY(new Date(num(h.at))))} \u2014 <b>${fmtMoney(num(h.amount))}</b> ${t('payCurrency')}</span>
        <span class="muted">${t('payHistoryDue')}: ${esc(fmtDMY(h.due))}</span></div>`).join('')}
      ${hist.length ? `<button class="link-btn" id="spUndo" style="color:var(--danger);margin-top:8px;">${t('payUndo')}</button>` : ''}
      <button class="btn btn-outline block" id="modalCancel" style="margin-top:16px;">${t('mClose')}</button>
    </div></div>`;
  }
  if (m.type === 'newGroup') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:420px;">
      <h2>${t('mNewGroupTitle')}</h2>
      <label>${t('mGroupNameLabel')}</label><input type="text" id="ngName" placeholder="${t('mGroupNamePh')}">
      <label>${t('mSubjectLabel')}</label><input type="text" id="ngSubject" placeholder="${t('mSubjectPh')}">
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="ngSave">${t('mCreate')}</button>
      </div></div></div>`;
  }
  if (m.type === 'addStudent') {
    const tab = m.tab || 'manual';
    const tabBtn = (key, label) => `<button data-addstudenttab="${key}" class="${tab === key ? 'active' : ''}">${label}</button>`;
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:480px;">
      <h2>${t('mAddStudentTitle')}</h2>
      <div class="auth-tabs">${tabBtn('manual', t('tabManual'))}${tabBtn('photo', t('tabPhoto'))}${tabBtn('file', t('tabFile'))}</div>
      ${tab === 'manual' ? `
        <label>${t('mFioLabel')}</label><input type="text" id="amName" placeholder="${t('mFioPh')}">
        <label>${t('mClassLabel')}</label><input type="text" id="amClass" placeholder="${t('mClassPh')}">
        <div class="grid2">
          <div><label>${t('birthDateLabel')}</label><input type="date" id="amBirthDate"></div>
          <div><label>${t('addressLabel')}</label><input type="text" id="amAddress"></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:18px;">
          <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
          <button class="btn btn-teal block" id="amSave">${t('mAdd')}</button>
        </div>` : ''}
      ${tab === 'photo' ? `
        <div class="muted" style="margin-top:12px;">${t('mPhotoDesc')}</div>
        <div class="upload-drop" id="photoDropZone" style="margin-top:10px;">
          <input type="file" id="photoInput" accept="image/*" style="display:none;">${t('mPickPhoto')}
        </div>
        <div id="photoPreviewWrap"></div>
        <label>${t('mFioLabel')}</label><input type="text" id="apName" placeholder="${t('mFioPh')}">
        <label>${t('mClassLabel')}</label><input type="text" id="apClass" placeholder="${t('mClassPh')}">
        <div style="display:flex;gap:10px;margin-top:18px;">
          <button class="btn btn-outline block" id="modalCancel">${t('mClose')}</button>
          <button class="btn btn-teal block" id="apSave">${t('mAdd')}</button>
        </div>` : ''}
      ${tab === 'file' ? `
        <div class="muted" style="margin-top:12px;">${t('mBulkDesc')}</div>
        <div class="upload-drop" id="bulkFileDropZone" style="margin-top:10px;">
          <input type="file" id="bulkFileInput" accept=".csv,.xlsx,.xls,.docx" style="display:none;">${t('mPickFile')}
        </div>
        <label>${t('mBulkClassLabel')}</label><input type="text" id="bulkClass" placeholder="${t('mClassPh')}">
        <label>${t('mBulkNamesLabel')}</label>
        <textarea id="bulkNamesArea" rows="7" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:13.5px;font-family:inherit;" placeholder="${t('mBulkNamesPh')}"></textarea>
        <div style="display:flex;gap:10px;margin-top:18px;">
          <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
          <button class="btn btn-teal block" id="bulkSave">${t('mBulkAddAll')}</button>
        </div>` : ''}
      </div></div>`;
  }
  if (m.type === 'addGrade') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:380px;">
      <h2>${t('mGradeTitle')}</h2>
      <label>${t('mSubjectShortLabel')}</label><input type="text" id="agSubject" placeholder="${t('mSubjectShortPh')}">
      <label>${t('mGradeLabel')}</label>
      <select id="agValue"><option value="5">${t('gradeExcellent')}</option><option value="4">${t('gradeGood')}</option><option value="3">${t('gradeSatisfactory')}</option><option value="2">${t('gradeUnsatisfactory')}</option></select>
      <label>${t('mPeriodLabel')}</label>
      <select id="agPeriod">${monthOptionsHTML()}</select>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="agSave">${t('mSave')}</button>
      </div></div></div>`;
  }
  if (m.type === 'reportsMenu') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:360px;">
      <h2>${t('reportsMenuBtn')}</h2>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
        <button class="btn btn-outline block" id="quarterlyBtn">${t('quarterlyBtn')}</button>
        <button class="btn btn-outline block" data-openattreport>${t('attReportBtn')}</button>
        <button class="btn btn-outline block" id="excelExportBtn">${t('exportExcelBtn')}</button>
        <button class="btn btn-primary block" id="printBtn">${t('exportPrintBtn')}</button>
      </div>
      <button class="btn btn-outline block" id="modalCancel" style="margin-top:16px;">${t('mClose')}</button>
    </div></div>`;
  }
  if (m.type === 'groupSettings') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:360px;">
      <h2>${t('groupSettingsBtn')}</h2>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
        <button class="btn btn-outline block" id="openCoTeacherBtn">${t('coTeacherBtn')}</button>
        <button class="btn btn-outline block" id="openEditGroupBtn">${t('editGroupBtn')}</button>
        <button class="btn btn-danger block" id="openDeleteGroupBtn">${t('deleteGroupBtn')}</button>
      </div>
      <button class="btn btn-outline block" id="modalCancel" style="margin-top:16px;">${t('mClose')}</button>
    </div></div>`;
  }
  if (m.type === 'notifications') {
    return `<div class="modal-bg" id="modalBg"><div class="modal">
      <h2>${t('mNotifTitle')}</h2>
      ${state.notifications.length === 0 ? `<div class="empty"><div class="big-icon">\u{1F4EC}</div>${t('mNotifEmpty')}</div>` :
        state.notifications.map(n => `<div style="padding:12px 0;border-bottom:1px solid var(--line);">
          <b>${esc(n.title)}</b>
          <div class="muted" style="margin:4px 0;white-space:pre-wrap;">${esc(n.message)}</div>
          <div class="muted" style="font-size:11px;">${n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : t('justNow')}</div>
        </div>`).join('')}
      <button class="btn btn-outline block" id="modalCancel" style="margin-top:16px;">${t('mClose')}</button>
    </div></div>`;
  }
  if (m.type === 'quarterly') {
    return `<div class="modal-bg" id="modalBg"><div class="modal">
      <h2>${t('mQuarterlyTitle')}</h2>
      ${renderQuarterlyContent(m.groupId)}
      <button class="btn btn-outline block" id="modalCancel" style="margin-top:16px;">${t('mClose')}</button>
    </div></div>`;
  }
  if (m.type === 'rejectReason') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:420px;">
      <h2>${t('rejectReasonTitle')}</h2>
      <label>${t('rejectReasonLabel')}</label>
      <textarea id="rejectReasonArea" rows="4" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:13.5px;font-family:inherit;" placeholder="${t('rejectReasonPh')}"></textarea>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-danger block" id="rejectConfirmBtn">${t('rejectConfirm')}</button>
      </div></div></div>`;
  }
  if (m.type === 'resubmit') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:460px;">
      <h2>${t('resubmitTitle')}</h2>
      <label>${t('resubmitReasonLabel')}</label>
      <textarea id="resubmitReasonArea" rows="3" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:13.5px;font-family:inherit;" placeholder="${t('resubmitReasonPh')}"></textarea>
      <label>${t('resubmitProofLabel')}</label>
      <div class="upload-drop" id="proofDropZone" style="margin-top:8px;">
        <input type="file" id="proofInput" accept="image/*" style="display:none;">${t('mPickPhoto')}
      </div>
      <div id="proofPreviewWrap"></div>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="resubmitSendBtn">${t('resubmitSend')}</button>
      </div></div></div>`;
  }
  if (m.type === 'profile') {
    const ud = state.userDoc || {};
    const myGroups = state.groups;
    const myStudents = state.students.filter(s => myGroups.some(g => g.id === s.groupId));
    const avg = myStudents.length ? myStudents.reduce((a, s) => a + studentAvg(s), 0) / myStudents.length : 0;
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:440px;">
      <h2>${t('profileTitle')}</h2>
      <div class="stat-grid" style="margin:14px 0;">
        <div class="stat-card"><div class="num">${myGroups.length}</div><div class="lbl">${t('profileGroups')}</div></div>
        <div class="stat-card"><div class="num">${myStudents.length}</div><div class="lbl">${t('profileStudents')}</div></div>
        <div class="stat-card" style="grid-column:span 2;"><div class="num">${avg.toFixed(2)}</div><div class="lbl">${t('profileAvg')}</div></div>
      </div>
      <div class="divider"></div>
      <h3 style="font-size:14px;margin:0 0 6px;">${t('profileEditTitle')}</h3>
      <label>${t('profileNameLabel')}</label><input type="text" id="profileName" value="${esc(state.profileForm.name || ud.fullName || '')}">
      <label>${t('profilePhoneLabel')}</label><input type="tel" id="profilePhone" value="${esc(state.profileForm.phone || ud.phone || '')}">
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="profileSaveBtn">${t('profileSave')}</button>
      </div></div></div>`;
  }
  if (m.type === 'editGroup') {
    const g = state.groups.find(x => x.id === m.groupId);
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:420px;">
      <h2>${t('editGroupTitle')}</h2>
      <label>${t('mGroupNameLabel')}</label><input type="text" id="egName" value="${esc(g?.name || '')}">
      <label>${t('mSubjectLabel')}</label><input type="text" id="egSubject" value="${esc(g?.subject || '')}">
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="egSave">${t('profileSave')}</button>
      </div></div></div>`;
  }
  if (m.type === 'deleteGroupConfirm') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:400px;">
      <h2>${t('deleteGroupConfirmTitle')}</h2>
      <div class="error-box">${t('deleteGroupConfirmMsg')}</div>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-danger block" id="deleteGroupConfirmBtn">${t('deleteConfirmBtn')}</button>
      </div></div></div>`;
  }
  if (m.type === 'groupDocs') {
    const tab = m.tab || 'workplan';
    const cats = { workplan: t('docCategoryWorkPlan'), lesson: t('docCategoryLesson') };
    const tabBtn = (key, label) => `<button data-docstab="${key}" class="${tab === key ? 'active' : ''}">${label}</button>`;
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:640px;">
      <h2>${t('docsTitle')}</h2>
      <div class="muted">${t('docsDesc')}</div>
      <div class="auth-tabs" style="margin-top:14px;">${tabBtn('workplan', t('workPlanTab'))}${tabBtn('file', t('workPlanFileTab'))}</div>
      ${tab === 'workplan' ? `
        <div style="overflow-x:auto;margin-top:12px;">
        <table><thead><tr><th>\u2116</th><th>${t('colTopic')}</th><th>${t('colHours')}</th><th>${t('colDate')}</th><th>${t('colNote')}</th><th></th></tr></thead><tbody>
        ${state.workPlan.length === 0 ? `<tr><td colspan="6" class="muted" style="text-align:center;padding:14px;">${t('workPlanEmpty')}</td></tr>` :
          state.workPlan.map((row, i) => `<tr>
            <td>${i + 1}</td><td>${esc(row.topic)}</td><td>${esc(row.hours || '')}</td><td>${esc(row.date || '')}</td><td>${esc(row.note || '')}</td>
            <td><button class="link-btn" data-delworkplanrow="${i}" style="color:var(--danger);">${t('deleteLink')}</button></td>
          </tr>`).join('')}
        </tbody></table>
        </div>
        <div class="divider"></div>
        <div class="grid2">
          <div><label>${t('workPlanTopicLabel')}</label><input type="text" id="wpTopic" placeholder="${t('workPlanTopicPh')}"></div>
          <div><label>${t('workPlanHoursLabel')}</label><input type="text" inputmode="numeric" id="wpHours" placeholder="2"></div>
        </div>
        <div class="grid2">
          <div><label>${t('workPlanDateLabel')}</label><input type="date" id="wpDate"></div>
          <div><label>${t('workPlanNoteLabel')}</label><input type="text" id="wpNote"></div>
        </div>
        <button class="btn btn-teal block" id="workPlanAddBtn" style="margin-top:12px;">${t('workPlanAddRow')}</button>
        <div class="divider"></div>
        <div class="upload-drop" id="wpImportZone">
          <input type="file" id="wpImportInput" accept=".csv,.xlsx,.xls" style="display:none;">${t('wpImportBtn')}
        </div>
        <div class="muted" style="font-size:12px;margin-top:6px;">${t('wpImportHint')}</div>
      ` : `
        ${state.groupDocs.length === 0 ? `<div class="empty" style="margin-top:12px;">${t('docEmpty')}</div>` :
          `<div style="margin-top:12px;">${state.groupDocs.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);">
            <div><span class="tag-subject">${esc(cats[d.category] || d.category)}</span> <b>${esc(d.title)}</b><br><a href="${safeFileHref(d.fileData)}" download="${esc(d.fileName)}" class="muted" style="font-size:12px;">\u{1F4CE} ${esc(d.fileName)}</a></div>
            <button class="link-btn" data-deldoc="${d.id}" style="color:var(--danger);">${t('docDelete')}</button>
          </div>`).join('')}</div>`}
        <div class="divider"></div>
        <label>${t('docCategoryLabel')}</label>
        <select id="docCategory"><option value="workplan">${t('docCategoryWorkPlan')}</option><option value="lesson">${t('docCategoryLesson')}</option></select>
        <label>${t('docTitleLabel')}</label><input type="text" id="docTitle" placeholder="${t('docTitlePh')}">
        <label>${t('docFileLabel')}</label>
        <div class="upload-drop" id="docDropZone" style="margin-top:6px;">
          <input type="file" id="docFileInput" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style="display:none;">${t('mPickFile')}
        </div>
        <div id="docFileNameWrap" class="muted" style="margin-top:6px;font-size:12px;"></div>
        <button class="btn btn-teal block" id="docUploadBtn" style="margin-top:12px;">${t('docUploadBtn')}</button>
      `}
      <button class="btn btn-outline block" id="modalCancel" style="margin-top:16px;">${t('mClose')}</button>
    </div></div>`;
  }
  if (m.type === 'attendance') {
    const group = state.groups.find(g => g.id === m.groupId);
    const students = state.students.filter(s => s.groupId === m.groupId);
    const todayStr = localDateStr();
    const existing = state.attendance.find(a => a.date === (m.date || todayStr));
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:460px;">
      <h2>${t('attendanceTitle')}</h2>
      <label>${t('attendanceDateLabel')}</label><input type="date" id="attDate" value="${m.date || todayStr}">
      ${students.length === 0 ? `<div class="empty">${t('emptyStudents')}</div>` :
        `<div style="margin-top:12px;max-height:340px;overflow:auto;">
        ${students.map(s => {
          const checked = (m.draft && Object.prototype.hasOwnProperty.call(m.draft, s.id)) ? !!m.draft[s.id] : (existing?.records ? existing.records[s.id] !== false : true);
          return `<label class="check-row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px;">
            <span>${esc(s.fullName)}</span>
            <input type="checkbox" data-att-student="${s.id}" ${checked ? 'checked' : ''}>
          </label>`;
        }).join('')}
      </div>`}
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="attendanceSaveBtn">${t('attendanceSave')}</button>
      </div>
      <button class="link-btn" data-openattreport style="margin-top:12px;">${t('attReportBtn')}</button></div></div>`;
  }
  if (m.type === 'attendanceReport') {
    const rep = buildAttendanceReport(m.groupId, m.month);
    const mn = (ym) => { const [y, mo] = ym.split('-'); return `${(MONTHS_FULL[getLang()] || MONTHS_FULL.uz)[Number(mo) - 1]} ${y}`; };
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:820px;">
      <h2>${t('attReportTitle')}</h2>
      ${rep.months.length === 0 ? `<div class="empty">${t('attNoData')}</div>` : `
      <label>${t('attMonthLabel')}</label>
      <select id="attMonth" style="max-width:240px;">${rep.months.map(ym => `<option value="${ym}" ${ym === rep.month ? 'selected' : ''}>${mn(ym)}</option>`).join('')}</select>
      <div class="muted" style="margin-top:10px;">${t('attLessons', { n: rep.lessons.length })}${rep.avgPct === null ? '' : ` &nbsp;\u00B7&nbsp; <b>${t('attAvgLabel', { p: rep.avgPct })}</b>`}</div>
      ${rep.top.length ? `<div class="info-box" style="margin-top:10px;"><b>${t('attTopAbsent')}:</b> ${rep.top.map(r => `${esc(r.s.fullName)} (${t('attTimes', { n: r.absent })})`).join(', ')}</div>` : ''}
      <div style="overflow-x:auto;margin-top:12px;">
      <table><thead><tr><th>${t('colNum')}</th><th>${t('colFullName')}</th>${rep.lessons.map(l => `<th style="text-align:center;">${esc(l.date.slice(8, 10))}</th>`).join('')}<th>${t('attColPresent')}</th><th>${t('attColAbsent')}</th><th>%</th></tr></thead><tbody>
      ${rep.rows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.s.fullName)}</b></td>
        ${r.marks.map(mk => mk === null ? '<td style="text-align:center;" class="muted">\u00B7</td>' : mk ? '<td style="text-align:center;color:var(--teal);font-weight:700;">\u2713</td>' : '<td style="text-align:center;color:var(--danger);font-weight:700;">\u2717</td>').join('')}
        <td>${r.present}</td><td>${r.absent}</td>
        <td style="${r.pct !== null && r.pct < 70 ? 'color:var(--danger);' : ''}font-weight:700;">${r.pct === null ? '\u2014' : r.pct + '%'}</td></tr>`).join('')}
      </tbody></table></div>
      <button class="btn btn-outline block" id="attExportBtn" style="margin-top:14px;">${t('exportExcelBtn')}</button>`}
      <button class="btn btn-outline block" id="modalCancel" style="margin-top:12px;">${t('mClose')}</button>
    </div></div>`;
  }
  if (m.type === 'coTeachers') {
    const group = state.groups.find(g => g.id === m.groupId);
    const info = group?.coTeacherInfo || {};
    const ids = group?.coTeachers || [];
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:440px;">
      <h2>${t('coTeacherTitle')}</h2>
      <div class="muted">${t('coTeacherDesc')}</div>
      <div class="divider"></div>
      <h3 style="font-size:13px;margin:0 0 8px;">${t('coTeacherList')}</h3>
      <div style="margin-bottom:14px;">
        ${ids.length === 0 ? `<div class="muted" style="font-size:12.5px;">${t('coTeacherEmpty')}</div>` :
          ids.map(uid => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;">
            <span style="font-size:13px;">${esc(info[uid]?.fullName || info[uid]?.email || uid)}</span>
            <button class="link-btn" data-removecoteacher="${esc(uid)}" style="color:var(--danger);font-size:12px;">${t('coTeacherRemove')}</button>
          </div>`).join('')}
      </div>
      <label>${t('coTeacherEmailLabel')}</label><input type="email" id="coTeacherEmail" placeholder="siz@example.com">
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('mClose')}</button>
        <button class="btn btn-teal block" id="coTeacherAddBtn">${t('coTeacherAdd')}</button>
      </div></div></div>`;
  }
  return '';
}

const MONTHS_FULL = {
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};
/** Saqlangan davrni (yangi: "m3", eski: "Aprel" / "April" / "Апрель") oy raqamiga (0-11) o'giradi; topilmasa -1. */
function monthIndexOf(p) {
  const v = String(p ?? '');
  const m = /^m(\d{1,2})$/.exec(v);
  if (m) return Number(m[1]) <= 11 ? Number(m[1]) : -1;
  for (const lang in MONTHS_FULL) { const i = MONTHS_FULL[lang].indexOf(v); if (i >= 0) return i; }
  return -1;
}
/** Saqlangan davrni joriy tildagi oy nomiga o'giradi (noma'lum bo'lsa — o'zini qaytaradi). */
function periodLabel(p) {
  const i = monthIndexOf(p);
  return i >= 0 ? (MONTHS_FULL[getLang()] || MONTHS_FULL.uz)[i] : String(p ?? '');
}
/** Oylar ro'yxati. selected: tanlangan oy raqami (standart: joriy oy). withEmpty — "davrsiz" varianti. */
function monthOptionsHTML(selected, withEmpty) {
  const arr = MONTHS_FULL[getLang()] || MONTHS_FULL.uz;
  const sel = selected === undefined ? new Date().getMonth() : selected;
  // Qiymat til-mustaqil (m0..m11): keyinchalik til almashsa ham chorak to'g'ri aniqlanadi.
  return (withEmpty ? `<option value="" ${sel < 0 ? 'selected' : ''}>${t('gradeNoPeriod')}</option>` : '')
    + arr.map((name, i) => `<option value="m${i}" ${i === sel ? 'selected' : ''}>${name}</option>`).join('');
}

function quarterOfMonth(monthName) {
  const mm = /^m(\d{1,2})$/.exec(String(monthName ?? ''));
  if (mm) {
    const mi = Number(mm[1]);
    if (mi > 11) return null;
    if ([8, 9, 10].includes(mi)) return 1;
    if ([11, 0, 1].includes(mi)) return 2;
    if ([2, 3, 4].includes(mi)) return 3;
    return 4;
  }
  const idx = { Yanvar: 0, Fevral: 1, Mart: 2, Aprel: 3, May: 4, Iyun: 5, Iyul: 6, Avgust: 7, Sentabr: 8, Oktabr: 9, Noyabr: 10, Dekabr: 11,
    '\u042f\u043d\u0432\u0430\u0440\u044c': 0, '\u0424\u0435\u0432\u0440\u0430\u043b\u044c': 1, '\u041c\u0430\u0440\u0442': 2, '\u0410\u043f\u0440\u0435\u043b\u044c': 3, '\u041c\u0430\u0439': 4, '\u0418\u044e\u043d\u044c': 5, '\u0418\u044e\u043b\u044c': 6, '\u0410\u0432\u0433\u0443\u0441\u0442': 7, '\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c': 8, '\u041e\u043a\u0442\u044f\u0431\u0440\u044c': 9, '\u041d\u043e\u044f\u0431\u0440\u044c': 10, '\u0414\u0435\u043a\u0430\u0431\u0440\u044c': 11,
    January: 0, February: 1, March: 2, April: 3, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
  const m = idx[monthName];
  if (m === undefined) return null;
  // O'quv yili: Sen-Noy=1chorak, Dek-Fev=2, Mar-May=3, Iyun-Avg=4
  if ([8, 9, 10].includes(m)) return 1;
  if ([11, 0, 1].includes(m)) return 2;
  if ([2, 3, 4].includes(m)) return 3;
  return 4;
}

function renderQuarterlyContent(groupId) {
  const students = state.students.filter(s => s.groupId === groupId);
  if (!students.length || !students.some(s => s.grades?.length)) {
    return `<div class="empty">${t('mQuarterlyEmpty')}</div>`;
  }
  const qLabels = { 1: t('q1'), 2: t('q2'), 3: t('q3'), 4: t('q4') };
  const ay = academicYearRange();
  let html = `<table><thead><tr><th>${t('colFullName')}</th><th>${qLabels[1]}</th><th>${qLabels[2]}</th><th>${qLabels[3]}</th><th>${qLabels[4]}</th></tr></thead><tbody>`;
  students.forEach(s => {
    const byQ = { 1: [], 2: [], 3: [], 4: [] };
    (s.grades || []).forEach(g => {
      // Faqat joriy o'quv yilidagi baholar (aks holda o'tgan yil baholari ham aralashib ketardi).
      if (typeof g.date === 'number' && (g.date < ay.start || g.date >= ay.end)) return;
      const q = quarterOfMonth(g.period);
      const v = num(g.value);
      if (q && v >= 1 && v <= 5) byQ[q].push(v);
    });
    const cell = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '\u2014';
    html += `<tr><td><b>${esc(s.fullName)}</b></td><td>${cell(byQ[1])}</td><td>${cell(byQ[2])}</td><td>${cell(byQ[3])}</td><td>${cell(byQ[4])}</td></tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

/* ================= EVENT HANDLERS ================= */
function attachHandlers() {
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    render();
  });
  document.getElementById('installBtn')?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    render();
  });
  document.querySelectorAll('[data-lang]').forEach(el => el.addEventListener('click', () => {
    setLang(el.dataset.lang); render();
  }));
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await logout();
    state.view = 'landing'; state.activeGroupId = null; state.pendingRegisterContract = false;
  });
  document.getElementById('notifBell')?.addEventListener('click', () => {
    localStorage.setItem('notif-seenCount', String(state.notifications.length));
    state.modal = { type: 'notifications' };
    render();
  });
  document.getElementById('profileBtn')?.addEventListener('click', () => {
    if (state.role !== 'teacher') return;
    state.profileForm = { name: state.userDoc?.fullName || '', phone: state.userDoc?.phone || '' };
    state.modal = { type: 'profile' };
    render();
  });
  document.querySelectorAll('[data-navto]').forEach(el => el.addEventListener('click', () => {
    state.view = el.dataset.navto; render();
    if (state.role === 'admin' && (state.view === 'adminDash' || state.view === 'adminReports')) loadAdminDataOnce(false);
  }));
  document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => { state.view = el.dataset.goto; render(); }));
  document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => { state.authTab = el.dataset.tab; render(); }));

  /* Forma maydonlari: har bir harf kiritilganda state'ga yozib boriladi
     (render() chaqirilmaydi) — shunda modal ochilishi yoki taymer kabi
     boshqa sabab bilan sahifa qayta chizilsa ham, yozilgan matn saqlanib qoladi. */
  document.getElementById('rName')?.addEventListener('input', e => state.regForm.name = e.target.value);
  document.getElementById('rEmail')?.addEventListener('input', e => state.regForm.email = e.target.value);
  document.getElementById('rPhone')?.addEventListener('input', e => state.regForm.phone = e.target.value);
  document.getElementById('rPass')?.addEventListener('input', e => state.regForm.password = e.target.value);
  document.getElementById('tlEmail')?.addEventListener('input', e => state.loginForm.email = e.target.value);
  document.getElementById('tlPass')?.addEventListener('input', e => state.loginForm.password = e.target.value);
  document.getElementById('gcPhone')?.addEventListener('input', e => state.regForm.phone = e.target.value);

  /* Teacher login */
  document.getElementById('teacherLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('tlEmail').value.trim();
    const pass = document.getElementById('tlPass').value;
    state.authEmailTry = email;
    const lockKey = 'teacher::' + email;
    if (getLockInfo(lockKey).locked) { toast(t('toastLocked'), 'error'); return; }
    try {
      await loginTeacher(email, pass);
      clearFails(lockKey);
      state.loginForm = { email: '', password: '' };
    } catch (err) {
      const count = registerFail(lockKey);
      toast(`${friendlyError(err)} (${t('toastAttempt')}: ${count}/3)`, 'error');
      render(); startLockCountdownIfNeeded();
    }
  });

  document.getElementById('googleLoginBtn')?.addEventListener('click', async () => {
    try { await loginWithGoogle(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });

  document.getElementById('forgotBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('tlEmail').value.trim();
    if (!email) { toast(t('toastEnterEmailFirst'), 'error'); return; }
    try { await resetPassword(email); toast(t('toastResetSent'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Teacher register */
  document.getElementById('openContractBtn')?.addEventListener('click', () => {
    state.contractReturnView = state.view;
    state.view = 'contractView';
    render();
  });
  document.getElementById('contractBackBtn')?.addEventListener('click', () => {
    state.view = state.contractReturnView || 'teacherAuth';
    render();
  });
  document.getElementById('contractAcceptBtn')?.addEventListener('click', () => {
    if (!document.getElementById('contractCheck').checked) { toast(t('toastFillCheckbox'), 'error'); return; }
    state.pendingRegisterContract = true;
    state.view = state.contractReturnView || 'teacherAuth';
    render();
  });
  document.getElementById('teacherRegForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.pendingRegisterContract) { toast(t('toastAcceptContractFirst'), 'error'); return; }
    const fullName = document.getElementById('rName').value.trim();
    const email = document.getElementById('rEmail').value.trim();
    const phone = document.getElementById('rPhone').value.trim();
    const password = document.getElementById('rPass').value;
    try {
      await registerTeacher({ fullName, email, phone, password });
      state.pendingRegisterContract = false;
      state.regForm = { name: '', email: '', phone: '', password: '' };
      toast(t('toastAppSent'), 'info');
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Google complete registration */
  document.getElementById('googleCompleteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.pendingRegisterContract) { toast(t('toastAcceptContractFirst'), 'error'); return; }
    const phone = document.getElementById('gcPhone').value.trim();
    try {
      await completeGoogleRegistration(state.firebaseUser.uid, { phone });
      state.pendingRegisterContract = false;
      const udoc = await getUserDoc(state.firebaseUser.uid);
      state.userDoc = udoc; state.view = 'teacherPending';
      toast(t('toastAppSent'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Admin login \u2014 faqat Google */
  document.getElementById('adminGoogleLoginBtn')?.addEventListener('click', async () => {
    try { await loginWithGoogle(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Admin actions */
  document.querySelectorAll('[data-approve]').forEach(el => el.addEventListener('click', async () => {
    try {
      const tc = state.teachers.find(x => x.id === el.dataset.approve);
      if (tc && tc.emailVerified === false && !confirm(t('confirmApproveUnverified', { name: tc.fullName || tc.email }))) return;
      await setTeacherStatus(el.dataset.approve, 'approved', tc);
      toast(t('toastApproved'), 'info');
    } catch (err) { toast(friendlyError(err), 'error'); }
  }));
  document.querySelectorAll('[data-reject]').forEach(el => el.addEventListener('click', () => {
    state.modal = { type: 'rejectReason', teacherId: el.dataset.reject };
    render();
  }));
  document.getElementById('rejectConfirmBtn')?.addEventListener('click', async () => {
    const reason = document.getElementById('rejectReasonArea').value.trim();
    try {
      await rejectTeacher(state.modal.teacherId, reason);
      toast(t('toastRejected'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('resendVerifyBtn')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await resendVerificationEmail(); toast(t('verifySent'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
    e.target.disabled = false;
  });
  document.getElementById('checkVerifyBtn')?.addEventListener('click', async () => {
    try {
      const ok = await refreshEmailVerified();
      if (ok) {
        await syncEmailVerifiedFlag(state.firebaseUser, state.userDoc).catch(() => {});
        toast(t('verifyDone'), 'info');
      } else toast(t('verifyNot'), 'error');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('teacherSearch')?.addEventListener('input', (e) => { state.teacherQuery = e.target.value; render(); });
  document.querySelectorAll('[data-block]').forEach(el => el.addEventListener('click', async () => {
    const tc = state.teachers.find(x => x.id === el.dataset.block);
    if (!tc || !confirm(t('confirmBlock', { name: tc.fullName || tc.email }))) return;
    try { await blockTeacher(tc.id, tc); toast(t('toastBlocked'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));
  document.querySelectorAll('[data-unblock]').forEach(el => el.addEventListener('click', async () => {
    const tc = state.teachers.find(x => x.id === el.dataset.unblock);
    if (!tc || !confirm(t('confirmUnblock', { name: tc.fullName || tc.email }))) return;
    try { await unblockTeacher(tc.id, tc); toast(t('toastUnblocked'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));
  document.getElementById('adminExcelBtn')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await exportAdminReportToExcel(); } catch (err) { toast(friendlyError(err), 'error'); }
    e.target.disabled = false;
  });
  document.getElementById('adminRefreshBtn')?.addEventListener('click', () => loadAdminDataOnce(true));
  document.getElementById('sendNotifBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('notifTitle').value.trim();
    const message = document.getElementById('notifMessage').value.trim();
    if (!title || !message) { toast(t('toastFillTitleMsg'), 'error'); return; }
    try {
      await createNotification(title, message);
      document.getElementById('notifTitle').value = '';
      document.getElementById('notifMessage').value = '';
      toast(t('toastNotifSent'), 'info');
    }
    catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('saveSubBtn')?.addEventListener('click', async () => {
    const readPlan = (key) => ({
      price: parseInt(document.getElementById(`subPrice_${key}`).value) || 0,
      discount: parseInt(document.getElementById(`subDiscount_${key}`).value) || 0,
      maxGroups: parseInt(document.getElementById(`subMaxGroups_${key}`).value) || 0,
      maxStudents: parseInt(document.getElementById(`subMaxStudents_${key}`).value) || 0,
      features: document.getElementById(`subFeatures_${key}`).value.split('\n').map(s => s.trim()).filter(Boolean),
    });
    const data = {
      enabled: document.getElementById('subEnabled').checked,
      plans: { free: readPlan('free'), monthly: readPlan('monthly'), yearly: readPlan('yearly') }
    };
    try { await saveSubscriptionSettings(data); toast(t('subPlansSaved'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.querySelectorAll('[data-activateplan]').forEach(el => el.addEventListener('click', async () => {
    try {
      await activateSubscription(el.dataset.activateplan, el.dataset.plankey);
      toast(t('subActivated'), 'info');
    } catch (err) { toast(friendlyError(err), 'error'); }
  }));
  document.querySelectorAll('[data-markcontacted]').forEach(el => el.addEventListener('click', async () => {
    try { await markPlanContacted(el.dataset.markcontacted); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));

  /* Resubmit (rad etilgandan keyin qayta yuborish) */
  document.getElementById('openResubmitBtn')?.addEventListener('click', () => { state.modal = { type: 'resubmit' }; render(); });
  let proofDocBase64 = null;
  document.getElementById('proofDropZone')?.addEventListener('click', () => document.getElementById('proofInput').click());
  document.getElementById('proofInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      proofDocBase64 = await fileToCompressedBase64(file);
      document.getElementById('proofPreviewWrap').innerHTML = `<img src="${proofDocBase64}" style="width:100%;border-radius:8px;margin-top:10px;border:1px solid var(--line);">`;
    } catch (err) { toast(t('toastPhotoError'), 'error'); }
  });
  document.getElementById('resubmitSendBtn')?.addEventListener('click', async () => {
    const resubmitReason = document.getElementById('resubmitReasonArea').value.trim();
    try {
      await resubmitApplication(state.firebaseUser.uid, { resubmitReason, proofDoc: proofDocBase64 });
      proofDocBase64 = null;
      const udoc = await getUserDoc(state.firebaseUser.uid);
      state.userDoc = udoc;
      toast(t('resubmitSent'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Profil */
  document.getElementById('profileName')?.addEventListener('input', e => state.profileForm.name = e.target.value);
  document.getElementById('profilePhone')?.addEventListener('input', e => state.profileForm.phone = e.target.value);
  document.getElementById('profileSaveBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('profileName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    if (!name) { toast(t('toastEnterName'), 'error'); return; }
    try {
      await updateTeacherProfile(state.firebaseUser.uid, { fullName: name, phone });
      const udoc = await getUserDoc(state.firebaseUser.uid);
      state.userDoc = udoc;
      toast(t('profileSaved'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Obuna rejasini tanlash */
  document.getElementById('cancelSubBtn')?.addEventListener('click', async () => {
    if (!confirm(t('subCancelConfirm'))) return;
    try {
      await cancelSubscription(state.firebaseUser.uid);
      const udoc = await getUserDoc(state.firebaseUser.uid);
      state.userDoc = udoc;
      toast(t('subCancelled'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.querySelectorAll('[data-chooseplan]').forEach(el => el.addEventListener('click', async () => {
    try {
      await chooseSubscriptionPlan(state.firebaseUser.uid, el.dataset.chooseplan);
      const udoc = await getUserDoc(state.firebaseUser.uid);
      state.userDoc = udoc;
      toast(t('subChosenToast'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  }));

  /* Teacher dashboard */
  document.getElementById('newGroupBtn')?.addEventListener('click', () => {
    if (atGroupLimit()) { toast(t('groupLimitReachedMsg'), 'error'); return; }
    state.modal = { type: 'newGroup' }; render();
  });
  document.querySelectorAll('[data-selectgroup]').forEach(el => el.addEventListener('click', () => {
    state.activeGroupId = el.dataset.selectgroup; state.studentQuery = ''; syncActiveGroup(); render();
  }));
  document.getElementById('addStudentMenuBtn')?.addEventListener('click', () => { state.modal = { type: 'addStudent', tab: 'manual' }; render(); });
  document.querySelectorAll('[data-addstudenttab]').forEach(el => el.addEventListener('click', () => { state.modal.tab = el.dataset.addstudenttab; render(); }));
  document.getElementById('docsBtn')?.addEventListener('click', () => {
    state.modal = { type: 'groupDocs', tab: 'workplan' }; render();
    loadGroupDocsOnce().then(render).catch(err => toast(friendlyError(err), 'error'));
  });
  document.querySelectorAll('[data-docstab]').forEach(el => el.addEventListener('click', () => { state.modal.tab = el.dataset.docstab; render(); }));
  document.getElementById('attendanceBtn')?.addEventListener('click', () => { state.modal = { type: 'attendance', groupId: state.activeGroupId }; render(); });
  document.getElementById('reportsMenuBtn')?.addEventListener('click', () => { state.modal = { type: 'reportsMenu' }; render(); });
  document.getElementById('groupSettingsBtn')?.addEventListener('click', () => { state.modal = { type: 'groupSettings' }; render(); });
  document.getElementById('openCoTeacherBtn')?.addEventListener('click', () => { state.modal = { type: 'coTeachers', groupId: state.activeGroupId }; render(); });
  document.getElementById('openEditGroupBtn')?.addEventListener('click', () => { state.modal = { type: 'editGroup', groupId: state.activeGroupId }; render(); });
  document.getElementById('openDeleteGroupBtn')?.addEventListener('click', () => { state.modal = { type: 'deleteGroupConfirm', groupId: state.activeGroupId }; render(); });
  document.querySelectorAll('[data-openattreport]').forEach(el => el.addEventListener('click', () => {
    state.modal = { type: 'attendanceReport', groupId: state.activeGroupId, month: '' }; render();
  }));
  document.getElementById('attMonth')?.addEventListener('change', (e) => { state.modal.month = e.target.value; render(); });
  document.getElementById('attExportBtn')?.addEventListener('click', () => exportAttendanceToExcel(state.modal.groupId, state.modal.month));
  document.getElementById('quarterlyBtn')?.addEventListener('click', () => { state.modal = { type: 'quarterly', groupId: state.activeGroupId }; render(); });
  document.getElementById('printBtn')?.addEventListener('click', () => printGroupReport());
  document.getElementById('excelExportBtn')?.addEventListener('click', () => exportGroupToExcel());
  document.getElementById('downloadReportBtn')?.addEventListener('click', () => printGroupReport());
  document.querySelectorAll('[data-addgrade]').forEach(el => el.addEventListener('click', () => { state.modal = { type: 'addGrade', studentId: el.dataset.addgrade }; render(); }));
  document.querySelectorAll('[data-delstudent]').forEach(el => el.addEventListener('click', async () => {
    if (!confirm(t('confirmDeleteStudent'))) return;
    try { await deleteStudent(el.dataset.delstudent); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));

  /* Modal generic */
  document.getElementById('modalCancel')?.addEventListener('click', () => { state.modal = null; render(); });
  document.getElementById('modalBg')?.addEventListener('click', (e) => { if (e.target.id === 'modalBg') { state.modal = null; render(); } });

  document.getElementById('ngSave')?.addEventListener('click', async () => {
    if (atGroupLimit()) { toast(t('groupLimitReachedMsg'), 'error'); state.modal = null; render(); return; }
    const name = document.getElementById('ngName').value.trim();
    const subject = document.getElementById('ngSubject').value.trim();
    if (!name || !subject) { toast(t('toastFillAllFields'), 'error'); return; }
    try {
      const gid = await createGroup(state.firebaseUser.uid, name, subject);
      state.activeGroupId = gid; syncActiveGroup();
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  document.getElementById('amSave')?.addEventListener('click', async () => {
    if (atStudentLimit(state.activeGroupId)) { toast(t('studentLimitReachedMsg'), 'error'); return; }
    const name = document.getElementById('amName').value.trim();
    const cls = document.getElementById('amClass').value.trim();
    const birthDate = document.getElementById('amBirthDate')?.value || '';
    const address = document.getElementById('amAddress')?.value.trim() || '';
    if (!name) { toast(t('toastEnterName'), 'error'); return; }
    const btn = document.getElementById('amSave'); btn.disabled = true;
    try {
      await addStudent(state.firebaseUser.uid, state.activeGroupId, { fullName: name, className: cls, birthDate, address, ...groupPayDefaults() });
      state.modal = null; render();
    } catch (err) {
      toast(friendlyError(err), 'error');
      btn.disabled = false;
    }
  });

  let selectedPhotoBase64 = null;
  document.getElementById('photoDropZone')?.addEventListener('click', () => document.getElementById('photoInput').click());
  document.getElementById('photoInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const zone = document.getElementById('photoDropZone'); zone.textContent = t('toastCompressing');
    try {
      selectedPhotoBase64 = await fileToCompressedBase64(file);
      document.getElementById('photoPreviewWrap').innerHTML = `<img src="${selectedPhotoBase64}" style="width:100%;border-radius:8px;margin-top:10px;border:1px solid var(--line);">`;
      zone.textContent = t('mPickPhoto');
    } catch (err) { toast(t('toastPhotoError'), 'error'); zone.textContent = t('mPickPhoto'); }
  });
  document.getElementById('apSave')?.addEventListener('click', async () => {
    if (atStudentLimit(state.activeGroupId)) { toast(t('studentLimitReachedMsg'), 'error'); return; }
    const name = document.getElementById('apName').value.trim();
    const cls = document.getElementById('apClass').value.trim();
    if (!name) { toast(t('toastEnterName'), 'error'); return; }
    try {
      await addStudent(state.firebaseUser.uid, state.activeGroupId, {
        fullName: name, className: cls, photo: selectedPhotoBase64, fromPhoto: !!selectedPhotoBase64, ...groupPayDefaults()
      });
      selectedPhotoBase64 = null;
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  document.getElementById('agSave')?.addEventListener('click', async () => {
    const subject = document.getElementById('agSubject').value.trim();
    const value = parseInt(document.getElementById('agValue').value);
    const period = document.getElementById('agPeriod')?.value || '';
    if (!subject) { toast(t('toastEnterSubject'), 'error'); return; }
    try {
      await addGrade(state.modal.studentId, subject, value, period);
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Fayldan (Excel/CSV/Word) ommaviy o'quvchi import qilish */
  document.getElementById('bulkFileDropZone')?.addEventListener('click', () => document.getElementById('bulkFileInput').click());
  document.getElementById('bulkFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const zone = document.getElementById('bulkFileDropZone');
    zone.textContent = t('toastFileReading');
    try {
      const names = await parseRosterFile(file);
      document.getElementById('bulkNamesArea').value = names.join('\n');
      zone.textContent = names.length
        ? `\u2705 ${names.length} ${t('toastNamesFound')}`
        : `\u26A0\uFE0F ${t('toastNoNamesFound')}`;
    } catch (err) {
      toast(t('toastFileReadError') + ' ' + (err.message || ''), 'error');
      zone.textContent = t('mPickFile');
    }
  });
  document.getElementById('bulkSave')?.addEventListener('click', async () => {
    const cls = document.getElementById('bulkClass').value.trim();
    const raw = document.getElementById('bulkNamesArea').value;
    let names = raw.split('\n').map(s => s.trim()).filter(Boolean);
    if (!names.length) { toast(t('toastEnterOneName'), 'error'); return; }
    // Takroriy ismlarni (ro'yxat ichida va guruhda mavjudlarini) o'tkazib yuboramiz.
    const seenNames = new Set(state.students.filter(s => s.groupId === state.activeGroupId).map(s => (s.fullName || '').trim().toLowerCase()));
    const before = names.length;
    names = names.map(n => n.replace(/\s+/g, ' ').slice(0, 120)).filter(n => {
      const k = n.toLowerCase();
      if (seenNames.has(k)) return false;
      seenNames.add(k);
      return true;
    });
    const skippedDup = before - names.length;
    if (!names.length) { toast(`${skippedDup} ${t('toastDupSkipped')}`, 'error'); return; }
    const limit = getStudentLimit();
    if (limit) {
      const already = state.students.filter(s => s.groupId === state.activeGroupId).length;
      const room = Math.max(0, limit - already);
      if (room === 0) { toast(t('studentLimitReachedMsg'), 'error'); return; }
      if (names.length > room) { names = names.slice(0, room); toast(t('studentLimitReachedMsg'), 'error'); }
    }
    const btn = document.getElementById('bulkSave'); btn.disabled = true; btn.textContent = t('toastAdding');
    try {
      await addStudentsBatch(state.firebaseUser.uid, state.activeGroupId, names, cls, groupPayDefaults());
      toast(`${names.length} ${t('toastStudentsAdded')}${skippedDup ? ` (${skippedDup} ${t('toastDupSkipped')})` : ''}`, 'info');
      state.modal = null; render();
    } catch (err) {
      toast(friendlyError(err), 'error');
      btn.disabled = false; btn.textContent = t('mBulkAddAll');
    }
  });

  /* Guruhni tahrirlash / o'chirish */
  document.getElementById('egSave')?.addEventListener('click', async () => {
    const name = document.getElementById('egName').value.trim();
    const subject = document.getElementById('egSubject').value.trim();
    if (!name || !subject) { toast(t('toastFillAllFields'), 'error'); return; }
    try {
      await updateGroup(state.modal.groupId, { name, subject });
      toast(t('groupUpdated'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('deleteGroupConfirmBtn')?.addEventListener('click', async () => {
    const gid = state.modal.groupId;
    try {
      // O'chirishdan oldin shu guruhga tegishli faol tinglovchini to'xtatamiz
      // (aks holda o'chirilgan hujjatga onSnapshot xato berishi mumkin).
      if (state.activeGroupId === gid && unsubStudents) { unsubStudents(); unsubStudents = null; }
      await deleteGroup(gid);
      if (state.activeGroupId === gid) state.activeGroupId = null;
      toast(t('groupDeleted'), 'info');
      state.modal = null; render();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  });

  /* Ish reja / dars ishlanmasi hujjatlari */
  let selectedDocBase64 = null, selectedDocName = '';
  document.getElementById('docDropZone')?.addEventListener('click', () => document.getElementById('docFileInput').click());
  document.getElementById('docFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 500 * 1024) { toast(t('docTooLarge'), 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      selectedDocBase64 = ev.target.result;
      selectedDocName = file.name;
      document.getElementById('docFileNameWrap').textContent = `\u{1F4CE} ${file.name}`;
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('docUploadBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('docTitle').value.trim();
    const category = document.getElementById('docCategory').value;
    if (!title) { toast(t('toastFillAllFields'), 'error'); return; }
    if (!selectedDocBase64) { toast(t('toastFillAllFields'), 'error'); return; }
    try {
      await addGroupDoc(state.firebaseUser.uid, state.activeGroupId, {
        title, category, fileName: selectedDocName, fileData: selectedDocBase64
      });
      selectedDocBase64 = null; selectedDocName = '';
      await loadGroupDocsOnce();
      toast(t('docUploaded'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.querySelectorAll('[data-deldoc]').forEach(el => el.addEventListener('click', async () => {
    try { await deleteGroupDoc(el.dataset.deldoc); await loadGroupDocsOnce(); toast(t('docDeleted'), 'info'); render(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));

  /* Yillik ish reja jadvali */
  document.getElementById('workPlanAddBtn')?.addEventListener('click', async () => {
    const topic = document.getElementById('wpTopic').value.trim();
    const hours = document.getElementById('wpHours').value.trim();
    const date = document.getElementById('wpDate').value;
    const note = document.getElementById('wpNote').value.trim();
    if (!topic) { toast(t('toastFillAllFields'), 'error'); return; }
    const newItems = [...state.workPlan, { topic, hours, date, note }];
    try {
      await saveWorkPlanItems(state.firebaseUser.uid, state.activeGroupId, newItems);
      state.workPlan = newItems;
      render();
      document.getElementById('wpTopic').value = '';
      document.getElementById('wpHours').value = '';
      document.getElementById('wpDate').value = '';
      document.getElementById('wpNote').value = '';
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('wpImportZone')?.addEventListener('click', () => document.getElementById('wpImportInput').click());
  document.getElementById('wpImportInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const zone = document.getElementById('wpImportZone');
    zone.textContent = t('toastFileReading');
    try {
      const items = await parseWorkPlanFile(file);
      if (!items.length) { toast(t('wpImportNone'), 'error'); render(); return; }
      const room = Math.max(0, 300 - state.workPlan.length);
      const add = items.slice(0, room);
      if (!add.length) { toast(t('wpImportLimit'), 'error'); render(); return; }
      const merged = [...state.workPlan, ...add];
      await saveWorkPlanItems(state.firebaseUser.uid, state.activeGroupId, merged);
      state.workPlan = merged;
      toast(t('wpImportDone', { n: add.length }) + (add.length < items.length ? ' ' + t('wpImportLimit') : ''), 'info');
      render();
    } catch (err) {
      toast(t('toastFileReadError') + ' ' + (err.message || ''), 'error');
      render();
    }
  });
  document.querySelectorAll('[data-delworkplanrow]').forEach(el => el.addEventListener('click', async () => {
    const idx = parseInt(el.dataset.delworkplanrow);
    const newItems = state.workPlan.filter((_, i) => i !== idx);
    try { await saveWorkPlanItems(state.firebaseUser.uid, state.activeGroupId, newItems); state.workPlan = newItems; render(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));

  /* Davomat (yo'qlama) */
  document.getElementById('attDate')?.addEventListener('change', (e) => {
    state.modal.date = e.target.value; state.modal.draft = {}; render();
  });
  document.querySelectorAll('[data-att-student]').forEach(el => el.addEventListener('change', () => {
    state.modal.draft = state.modal.draft || {};
    state.modal.draft[el.dataset.attStudent] = el.checked;
  }));
  document.getElementById('attendanceSaveBtn')?.addEventListener('click', async () => {
    const date = document.getElementById('attDate').value;
    const records = {};
    document.querySelectorAll('[data-att-student]').forEach(el => {
      records[el.dataset.attStudent] = el.checked;
    });
    try {
      await saveAttendance(state.firebaseUser.uid, state.activeGroupId, date, records);
      await loadAttendanceOnce();
      toast(t('attendanceSaved'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Hamkor o'qituvchi */
  document.getElementById('coTeacherAddBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('coTeacherEmail').value.trim();
    if (!email) { toast(t('toastEnterEmailFirst'), 'error'); return; }
    try {
      const found = await findApprovedTeacherByEmail(email);
      if (!found) { toast(t('coTeacherNotFound'), 'error'); return; }
      const group = state.groups.find(g => g.id === state.modal.groupId);
      if (found.id === state.firebaseUser.uid || (group?.coTeachers || []).includes(found.id)) {
        toast(t('coTeacherAlready'), 'error'); return;
      }
      await addCoTeacher(state.modal.groupId, found.id, { fullName: found.fullName || '', email: found.email || email });
      toast(t('coTeacherAdded'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.querySelectorAll('[data-removecoteacher]').forEach(el => el.addEventListener('click', async () => {
    try { await removeCoTeacher(state.modal.groupId, el.dataset.removecoteacher); render(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));

  /* Reklama (admin) */
  let selectedAdImageBase64 = null;
  document.getElementById('adImageDropZone')?.addEventListener('click', () => document.getElementById('adImageInput').click());
  document.getElementById('adImageInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      selectedAdImageBase64 = await fileToCompressedBase64(file, 640, 0.7);
      document.getElementById('adImagePreviewWrap').innerHTML = `<img src="${selectedAdImageBase64}" style="width:100%;max-width:260px;border-radius:8px;margin-top:10px;border:1px solid var(--line);">`;
    } catch (err) { toast(t('toastPhotoError'), 'error'); }
  });
  document.getElementById('saveAdBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('adTitle').value.trim();
    const text = document.getElementById('adText').value.trim();
    if (!title && !text) { toast(t('toastFillAllFields'), 'error'); return; }
    const data = {
      enabled: true,
      title,
      text,
      link: document.getElementById('adLink').value.trim(),
      startDate: document.getElementById('adStartDate').value || null,
      endDate: document.getElementById('adEndDate').value || null,
      image: selectedAdImageBase64 || null,
    };
    try {
      await addAd(data);
      selectedAdImageBase64 = null;
      document.getElementById('adTitle').value = '';
      document.getElementById('adText').value = '';
      document.getElementById('adLink').value = '';
      document.getElementById('adEndDate').value = '';
      document.getElementById('adImagePreviewWrap').innerHTML = '';
      toast(t('adsSaved'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.querySelectorAll('[data-toggle-ad]').forEach(el => el.addEventListener('change', async () => {
    try { await updateAd(el.dataset.toggleAd, { enabled: el.checked }); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));
  document.querySelectorAll('[data-delad]').forEach(el => el.addEventListener('click', async () => {
    try { await deleteAd(el.dataset.delad); toast(t('docDeleted'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));
  /* Qidiruv va saralash */
  document.getElementById('studentSearch')?.addEventListener('input', (e) => { state.studentQuery = e.target.value; render(); });
  document.getElementById('studentSort')?.addEventListener('change', (e) => { state.studentSort = e.target.value; render(); });

  /* O'quvchini tahrirlash */
  document.querySelectorAll('[data-editstudent]').forEach(el => el.addEventListener('click', () => {
    state.modal = { type: 'editStudent', studentId: el.dataset.editstudent }; render();
  }));
  document.getElementById('esSave')?.addEventListener('click', async () => {
    const fullName = document.getElementById('esName').value.trim();
    if (!fullName) { toast(t('toastEnterName'), 'error'); return; }
    try {
      await updateStudent(state.modal.studentId, {
        fullName,
        className: document.getElementById('esClass').value.trim(),
        birthDate: document.getElementById('esBirth').value || '',
        address: document.getElementById('esAddress').value.trim()
      });
      toast(t('studentUpdated'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Bahoni tahrirlash / o'chirish */
  document.querySelectorAll('[data-editgrade]').forEach(el => {
    const open = () => {
      const [sid, idx] = el.dataset.editgrade.split(':');
      const st = state.students.find(x => x.id === sid);
      const g = st?.grades?.[Number(idx)];
      if (!g) return;
      state.modal = { type: 'editGrade', studentId: sid, ref: { date: g.date, subject: g.subject, value: num(g.value) } };
      render();
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  document.getElementById('grSave')?.addEventListener('click', async () => {
    const st = state.students.find(x => x.id === state.modal.studentId);
    const old = st ? findGrade(st, state.modal.ref) : null;
    const subject = document.getElementById('grSubject').value.trim();
    if (!old) { state.modal = null; render(); return; }
    if (!subject) { toast(t('toastEnterSubject'), 'error'); return; }
    const value = parseInt(document.getElementById('grValue').value);
    const period = document.getElementById('grPeriod').value || null;
    try {
      await setStudentGrades(st.id, st.grades.map(g => g === old ? { ...g, subject, value, period } : g));
      toast(t('gradeUpdated'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('grDelete')?.addEventListener('click', async () => {
    if (!confirm(t('confirmDeleteGrade'))) return;
    const st = state.students.find(x => x.id === state.modal.studentId);
    const old = st ? findGrade(st, state.modal.ref) : null;
    if (!old) { state.modal = null; render(); return; }
    try {
      await setStudentGrades(st.id, st.grades.filter(g => g !== old));
      toast(t('gradeDeleted'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* To'lov: guruh sozlamalari */
  document.getElementById('payBtn')?.addEventListener('click', () => {
    state.modal = { type: 'paySettings', groupId: state.activeGroupId }; render();
  });
  document.getElementById('psSave')?.addEventListener('click', async () => {
    const group = state.groups.find(g => g.id === state.modal.groupId);
    if (!group) return;
    const isOwner = group.teacherId === state.firebaseUser?.uid;
    const dayRaw = document.getElementById('psDay').value.trim();
    const day = dayRaw ? validPayDay(dayRaw) : null;
    if (dayRaw && !day) { toast(t('payBadDay'), 'error'); return; }
    const fee = parseInt(String(document.getElementById('psFee').value).replace(/\D/g, '')) || 0;
    const applyAll = document.getElementById('psApplyAll').checked;
    const btn = document.getElementById('psSave'); btn.disabled = true;
    try {
      if (isOwner) await updateGroupPaySettings(group.id, { fee, payDay: day });
      if (day) {
        const today = localDateStr();
        const targets = state.students.filter(s => s.groupId === group.id && (applyAll || !parseYMD(s.payDue)));
        const items = targets.map(s => {
          let due = nextDueFromDay(day, today);
          // Allaqachon to'langan muddatdan keyingi sanaga qo'yiladi (aks holda to'langan oy "qarz" bo'lib qoladi).
          while (parseYMD(s.paidThrough) && due <= s.paidThrough) due = addMonthKeepDay(due, day);
          return { id: s.id, payDue: due, payDay: day };
        });
        if (items.length) await applyPayDeadlines(items);
      }
      toast(t('paySettingsSaved'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); btn.disabled = false; }
  });

  /* To'lov: o'quvchi bo'yicha */
  document.querySelectorAll('[data-paystudent]').forEach(el => el.addEventListener('click', () => {
    state.modal = { type: 'studentPay', studentId: el.dataset.paystudent }; render();
  }));
  document.querySelectorAll('[data-quickpay]').forEach(el => el.addEventListener('click', async () => {
    const st = state.students.find(x => x.id === el.dataset.quickpay);
    if (!st) return;
    const group = state.groups.find(g => g.id === st.groupId);
    el.disabled = true;
    try { await markStudentPaid(st, num(group?.fee)); }
    catch (err) { toast(friendlyError(err), 'error'); el.disabled = false; }
  }));
  document.getElementById('spSaveDue')?.addEventListener('click', async () => {
    const st = state.students.find(x => x.id === state.modal.studentId);
    const due = document.getElementById('spDue').value;
    if (!st || !parseYMD(due)) { toast(t('payNoDue'), 'error'); return; }
    try {
      await updateStudentPayment(st.id, { payDue: due, payDay: parseYMD(due).d });
      toast(t('payDueSaved'), 'info');
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('spMarkPaid')?.addEventListener('click', async () => {
    const st = state.students.find(x => x.id === state.modal.studentId);
    if (!st) return;
    const amount = parseInt(String(document.getElementById('spAmount').value).replace(/\D/g, '')) || 0;
    try { await markStudentPaid(st, amount); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('spUndo')?.addEventListener('click', async () => {
    const st = state.students.find(x => x.id === state.modal.studentId);
    const hist = Array.isArray(st?.payHistory) ? st.payHistory : [];
    const last = hist[hist.length - 1];
    if (!st || !last) return;
    try {
      await updateStudentPayment(st.id, { payDue: last.due || '', paidThrough: last.prev || '', payHistory: hist.slice(0, -1) });
      toast(t('payUndone'), 'info');
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  document.getElementById('adCarouselClose')?.addEventListener('click', () => {
    state.adDismissed = true; render();
  });
}


/* ================= TEKSHIRUVCHI UCHUN HISOBOT (chop etish) =================
   Avval "Tekshiruvchi uchun eksport" tugmasi oddiy window.print() ni chaqirardi: bosilganda ochiq turgan
   oyna chop etilib, bo'sh varaq chiqardi. Endi alohida, tayyor hujjat (guruh ma'lumoti, o'quvchilar,
   choraklik baholar, davomat, ish reja, imzo joylari) yashirin ramkada tuziladi va shuni chop etadi —
   sahifaning dizayniga (styles.css) bog'liq emas. */
function quarterAverages(s) {
  const ay = academicYearRange();
  const byQ = { 1: [], 2: [], 3: [], 4: [] };
  (s.grades || []).forEach(g => {
    if (typeof g.date === 'number' && (g.date < ay.start || g.date >= ay.end)) return;
    const q = quarterOfMonth(g.period);
    const v = num(g.value);
    if (q && v >= 1 && v <= 5) byQ[q].push(v);
  });
  return [1, 2, 3, 4].map(q => byQ[q].length ? (byQ[q].reduce((a, b) => a + b, 0) / byQ[q].length).toFixed(2) : '\u2014');
}
function formatDateDMY(d) {
  d = d || new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
function buildReportHTML(group, students) {
  const teacherName = state.userDoc?.fullName || '';
  const plan = (state.workPlan || []).filter(r => r && (r.topic || r.hours || r.date || r.note));
  const rows = students.map((s, i) => {
    const a = studentAvg(s);
    const p = studentAttendancePercent(s.id);
    const q = quarterAverages(s);
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${esc(s.fullName)}</td>
      <td class="c">${esc(s.className || '')}</td>
      <td class="c">${q[0]}</td><td class="c">${q[1]}</td><td class="c">${q[2]}</td><td class="c">${q[3]}</td>
      <td class="c"><b>${a ? a.toFixed(2) : '\u2014'}</b></td>
      <td class="c">${a ? esc(levelLabel(a).label) : '\u2014'}</td>
      <td class="c">${p === null ? '\u2014' : p + '%'}</td>
    </tr>`;
  }).join('');
  const planRows = plan.map((r, i) => `<tr>
      <td class="c">${i + 1}</td><td>${esc(r.topic)}</td><td class="c">${esc(r.hours)}</td>
      <td class="c">${esc(r.date)}</td><td>${esc(r.note)}</td></tr>`).join('');
  const lang = esc(getLang?.() || 'uz');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(t('printReportTitle'))} \u2014 ${esc(group.name)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, "Helvetica Neue", sans-serif; color: #111; font-size: 12px; margin: 0; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 4px; }
  .sub { text-align: center; color: #555; margin-bottom: 14px; font-size: 11px; }
  h2 { font-size: 13px; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #444; padding: 4px 6px; vertical-align: top; }
  th { background: #e9e9e9; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 11px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .c { text-align: center; }
  .info td { border: none; padding: 2px 0; }
  .info td:first-child { width: 150px; color: #555; }
  .sign { display: flex; justify-content: space-between; gap: 30px; margin-top: 34px; }
  .sign div { flex: 1; border-top: 1px solid #444; padding-top: 4px; font-size: 11px; color: #333; }
</style></head><body>
<h1>${esc(t('printReportTitle'))}</h1>
<div class="sub">TUGARAK+ \u00B7 ${esc(t('printDate'))}: ${formatDateDMY()}</div>
<table class="info"><tbody>
  <tr><td>${esc(t('printTeacher'))}:</td><td><b>${esc(teacherName)}</b></td></tr>
  <tr><td>${esc(t('printGroup'))}:</td><td><b>${esc(group.name)}</b></td></tr>
  <tr><td>${esc(t('printSubject'))}:</td><td>${esc(group.subject)}</td></tr>
  <tr><td>${esc(t('printStudentsCount'))}:</td><td>${students.length}</td></tr>
</tbody></table>
<h2>${esc(t('mQuarterlyTitle'))}</h2>
<table><thead><tr>
  <th>${esc(t('colNum'))}</th><th>${esc(t('colFullName'))}</th><th>${esc(t('colClass'))}</th>
  <th>${esc(t('q1'))}</th><th>${esc(t('q2'))}</th><th>${esc(t('q3'))}</th><th>${esc(t('q4'))}</th>
  <th>${esc(t('colAvg'))}</th><th>${esc(t('colLevel'))}</th><th>${esc(t('colAttendance'))}</th>
</tr></thead><tbody>${rows}</tbody></table>
${plan.length ? `<h2>${esc(t('printWorkPlanTitle'))}</h2>
<table><thead><tr><th>${esc(t('colNum'))}</th><th>${esc(t('colTopic'))}</th><th>${esc(t('colHours'))}</th><th>${esc(t('colDate'))}</th><th>${esc(t('colNote'))}</th></tr></thead><tbody>${planRows}</tbody></table>` : ''}
<div class="sign"><div>${esc(t('printSignTeacher'))}</div><div>${esc(t('printSignInspector'))}</div></div>
</body></html>`;
}
/** HTML hujjatni yashirin ramkada chop etadi (popup bloklanmaydi, sahifa dizayni aralashmaydi). */
function printHtmlDocument(htmlDoc) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  let done = false;
  const cleanup = () => { if (done) return; done = true; setTimeout(() => frame.remove(), 500); };
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) { cleanup(); return; }
    w.addEventListener('afterprint', cleanup);
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { console.warn('Chop etish xatosi:', e); cleanup(); } }, 150);
    setTimeout(cleanup, 120000); // zaxira: afterprint kelmasa ham ramka o'chiriladi
  };
  document.body.appendChild(frame);
  frame.srcdoc = htmlDoc;
}
function printGroupReport() {
  const group = state.groups.find(g => g.id === state.activeGroupId);
  const students = state.students.filter(s => s.groupId === state.activeGroupId);
  if (!group || !students.length) { toast(t('printNoStudents'), 'error'); return; }
  printHtmlDocument(buildReportHTML(group, students));
}

/** Tanlangan oy uchun davomat jadvali: darslar, har o'quvchi belgilari, foizlar, eng ko'p qoldirganlar. */
function buildAttendanceReport(groupId, month) {
  const students = state.students.filter(s => s.groupId === groupId);
  const dated = state.attendance.filter(a => typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date));
  const months = [...new Set(dated.map(a => a.date.slice(0, 7)))].sort().reverse();
  const cur = months.includes(month) ? month : (months[0] || '');
  const lessons = dated.filter(a => a.date.startsWith(cur)).sort((a, b) => a.date.localeCompare(b.date));
  const has = (rec, id) => !!rec && Object.prototype.hasOwnProperty.call(rec, id);
  const rows = students.map(s => {
    let present = 0, absent = 0;
    const marks = lessons.map(l => {
      if (!has(l.records, s.id)) return null;
      const p = !!l.records[s.id];
      if (p) present++; else absent++;
      return p;
    });
    const total = present + absent;
    return { s, marks, present, absent, pct: total ? Math.round(present / total * 100) : null };
  }).sort((a, b) => (a.s.fullName || '').localeCompare(b.s.fullName || '', 'uz'));
  const sumP = rows.reduce((a, r) => a + r.present, 0);
  const sumAll = rows.reduce((a, r) => a + r.present + r.absent, 0);
  return {
    months, month: cur, lessons, rows,
    avgPct: sumAll ? Math.round(sumP / sumAll * 100) : null,
    top: rows.filter(r => r.absent > 0).sort((a, b) => b.absent - a.absent).slice(0, 5)
  };
}
/** Admin hisoboti: Umumiy / Guruhlar / O'qituvchilar varaqlari bilan bitta Excel fayl. */
async function exportAdminReportToExcel() {
  await loadAdminDataOnce(true); // eng so'nggi ma'lumot bilan
  const XLSX = await import('xlsx');
  const groups = state.allGroupsAdmin || [];
  const students = state.allStudentsAdmin || [];
  const teachers = state.teachers || [];
  const avgOf = (list) => { const g = list.filter(s => s.grades?.length); return g.length ? g.reduce((a, s) => a + studentAvg(s), 0) / g.length : null; };
  const nameByUid = {}; teachers.forEach(tc => { nameByUid[tc.id] = tc.fullName; });
  const count = (st) => teachers.filter(tc => tc.status === st).length;
  const r2 = (v) => v === null ? '' : Number(v.toFixed(2));

  const summary = [
    [t('adminReportsTitle')],
    [t('reportGeneratedAt'), fmtDMY(localDateStr())],
    [],
    [t('reportTotalTeachers'), count('approved')],
    [t('statPending'), count('pending')],
    [t('statRejected'), count('rejected')],
    [t('statBlocked'), count('blocked')],
    [t('reportTotalGroups'), groups.length],
    [t('reportTotalStudents'), students.length],
    [t('reportAvgScore'), r2(avgOf(students))]
  ];
  const groupRows = groups.map((g, i) => {
    const gs = students.filter(s => s.groupId === g.id);
    return { [t('colNum')]: i + 1, [t('mGroupNameLabel')]: g.name, [t('mSubjectShortLabel')]: g.subject || '',
      [t('colName')]: nameByUid[g.teacherId] || '', [t('profileStudents')]: gs.length, [t('colAvg')]: r2(avgOf(gs)) };
  });
  const statusLbl = { approved: t('statApproved'), pending: t('statPending'), rejected: t('statRejected'), blocked: t('statBlocked') };
  const teacherRows = teachers.map((tc, i) => {
    const gids = groups.filter(g => g.teacherId === tc.id).map(g => g.id);
    return { [t('colNum')]: i + 1, [t('colName')]: tc.fullName || '', [t('colEmail')]: tc.email || '', [t('colPhone')]: tc.phone || '',
      [t('colStatusLbl')]: statusLbl[tc.status] || '',
      [t('colGroupsN')]: gids.length, [t('colStudentsN')]: students.filter(s => gids.includes(s.groupId)).length,
      [t('colRegistered')]: tc.createdAt?.toMillis ? fmtDMY(ymdOf(new Date(tc.createdAt.toMillis()))) : '' };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), t('xlsSheetSummary').slice(0, 30));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groupRows), t('xlsSheetGroups').slice(0, 30));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teacherRows), t('xlsSheetTeachers').slice(0, 30));
  XLSX.writeFile(wb, `Tugarak_hisobot_${localDateStr()}.xlsx`);
}
async function exportAttendanceToExcel(groupId, month) {
  const group = state.groups.find(g => g.id === groupId);
  const rep = buildAttendanceReport(groupId, month);
  if (!group || !rep.lessons.length) { toast(t('attNoData'), 'error'); return; }
  const XLSX = await import('xlsx');
  const head = [t('colNum'), t('colFullName'), ...rep.lessons.map(l => `${l.date.slice(8, 10)}.${l.date.slice(5, 7)}`), t('attColPresent'), t('attColAbsent'), '%'];
  const body = rep.rows.map((r, i) => [i + 1, r.s.fullName, ...r.marks.map(m => m === null ? '' : m ? '+' : '-'), r.present, r.absent, r.pct === null ? '' : `${r.pct}%`]);
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, rep.month);
  XLSX.writeFile(wb, `${(group.name || 'guruh').replace(/[\\/:*?"<>|]+/g, '_')}_davomat_${rep.month}.xlsx`);
}

async function exportGroupToExcel() {
  const group = state.groups.find(g => g.id === state.activeGroupId);
  const students = state.students.filter(s => s.groupId === state.activeGroupId);
  if (!group || !students.length) { toast(t('emptyStudents').replace(/<br>/g, ' '), 'error'); return; }
  const XLSX = await import('xlsx');
  const rows = students.map((s, i) => {
    const a = studentAvg(s); const lvl = levelLabel(a);
    return {
      [t('colNum')]: i + 1,
      [t('colFullName')]: s.fullName,
      [t('colClass')]: s.className || '',
      [t('colGrades')]: (s.grades || []).map(g => `${g.subject}:${g.value}`).join(', '),
      [t('colAvg')]: a ? Number(a.toFixed(2)) : '',
      [t('colLevel')]: lvl.label,
      [t('colAttendance')]: (() => { const p = studentAttendancePercent(s.id); return p === null ? '' : `${p}%`; })(),
      [t('payExcelCol')]: payStatus(s).kind === 'none' ? '' : payText(payStatus(s)),
      [t('payExcelDue')]: fmtDMY(s.payDue),
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (group.name || '').replace(/[\[\]:*?\/\\]/g, '_').slice(0, 28) || 'Sheet1');
  XLSX.writeFile(wb, `${(group.name || 'guruh').replace(/[\\/:*?"<>|]+/g, '_')}.xlsx`);
}

function startLockCountdownIfNeeded() {
  const el = document.getElementById('lockCountdown');
  if (!el) return;
  const timer = setInterval(() => {
    const cur = document.getElementById('lockCountdown');
    if (!cur) { clearInterval(timer); return; }
    let secs = parseInt(cur.textContent) - 1;
    if (secs <= 0) { clearInterval(timer); render(); } else cur.textContent = secs + 's';
  }, 1000);
}

render();
handleRedirectResult().catch(err => toast(friendlyError(err), 'error'));

/* Reklama karuseli: har 6 soniyada avtomatik almashadi. To'liq render() emas,
   faqat karusel DOM elementini yangilaydi — shu bilan boshqa joyda yozilayotgan
   matn (formalar) buzilmaydi. */
let adCarouselIndex = 0;
setInterval(() => {
  const track = document.getElementById('adBannerTrack');
  if (!track || track.children.length <= 1) return;
  adCarouselIndex = (adCarouselIndex + 1) % track.children.length;
  track.style.transform = `translateX(-${adCarouselIndex * 100}%)`;
  document.querySelectorAll('.ad-dot').forEach((d, i) => d.classList.toggle('active', i === adCarouselIndex));
}, 6000);
