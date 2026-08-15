import './styles.css';
import {
  watchAuth, registerTeacher, loginTeacher, loginWithGoogle, completeGoogleRegistration,
  resetPassword, logout, isAdmin, getUserDoc, getLockInfo, registerFail, clearFails
} from './auth.js';
import {
  watchAllTeachers, setTeacherStatus, watchMyGroups, createGroup, updateGroup, deleteGroup,
  watchGroupStudents, addStudent, deleteStudent, addGrade,
  watchNotifications, createNotification,
  rejectTeacher, resubmitApplication, updateTeacherProfile,
  watchSubscriptionSettings, saveSubscriptionSettings, chooseSubscriptionPlan, markPlanContacted,
  activateSubscription, watchAds, addAd, updateAd, deleteAd,
  watchGroupDocs, addGroupDoc, deleteGroupDoc,
  watchGroupAttendance, saveAttendance,
  findApprovedTeacherByEmail, addCoTeacher, removeCoTeacher,
  watchAllGroupsAdmin, watchAllStudentsAdmin
} from './db.js';
import { auth } from './firebase.js';
import { parseRosterFile } from './importParsers.js';
import { t, LANGS, getLang, setLang, contractText } from './i18n.js';
import * as XLSX from 'xlsx';

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
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
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
  allGroupsAdmin: [],
  allStudentsAdmin: [],
};

let unsubTeachers = null, unsubGroups = null, unsubStudents = null, unsubNotifications = null, unsubSubscription = null, unsubAds = null, unsubGroupDocs = null, unsubAttendance = null, unsubAllGroupsAdmin = null, unsubAllStudentsAdmin = null;
const uid = () => 'x' + Math.random().toString(36).slice(2, 9);

function esc(s) { return (s || '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function friendlyError(err) {
  const code = err?.code || '';
  const map = {
    'auth/user-not-found': t('errUserNotFound'),
    'auth/wrong-password': t('errWrongPassword'),
    'auth/invalid-credential': t('errInvalidCredential'),
    'auth/email-already-in-use': t('errEmailInUse'),
    'auth/weak-password': t('errWeakPassword'),
    'auth/invalid-email': t('errInvalidEmail'),
    'auth/too-many-requests': t('errTooMany'),
    'auth/popup-closed-by-user': t('errPopupClosed')
  };
  return map[code] || (err?.message || t('errGeneric'));
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

watchAuth(async (user) => {
  state.firebaseUser = user;
  if (unsubTeachers) { unsubTeachers(); unsubTeachers = null; }
  if (unsubGroups) { unsubGroups(); unsubGroups = null; }
  if (unsubStudents) { unsubStudents(); unsubStudents = null; }
  if (unsubNotifications) { unsubNotifications(); unsubNotifications = null; }
  if (unsubSubscription) { unsubSubscription(); unsubSubscription = null; }
  if (unsubAds) { unsubAds(); unsubAds = null; }
  if (unsubGroupDocs) { unsubGroupDocs(); unsubGroupDocs = null; }
  if (unsubAttendance) { unsubAttendance(); unsubAttendance = null; }
  if (unsubAllGroupsAdmin) { unsubAllGroupsAdmin(); unsubAllGroupsAdmin = null; }
  if (unsubAllStudentsAdmin) { unsubAllStudentsAdmin(); unsubAllStudentsAdmin = null; }

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

  const admin = await isAdmin(user.uid, user.email);
  if (admin) {
    state.role = 'admin';
    state.view = 'adminDash';
    unsubTeachers = watchAllTeachers(list => { state.teachers = list; render(); });
    unsubAllGroupsAdmin = watchAllGroupsAdmin(list => { state.allGroupsAdmin = list; render(); });
    unsubAllStudentsAdmin = watchAllStudentsAdmin(list => { state.allStudentsAdmin = list; render(); });
    render();
    return;
  }

  state.role = 'teacher';
  const udoc = await getUserDoc(user.uid);
  state.userDoc = udoc;
  if (!udoc) { state.view = 'teacherAuth'; render(); return; }
  if (udoc.status === 'incomplete') { state.view = 'googleComplete'; render(); return; }
  if (udoc.status === 'approved') {
    if (state.view !== 'subscription') state.view = 'teacherDash';
    unsubGroups = watchMyGroups(user.uid, list => {
      state.groups = list;
      if (!state.activeGroupId && list.length) state.activeGroupId = list[0].id;
      subscribeStudentsIfNeeded();
      subscribeGroupDocsIfNeeded();
      subscribeAttendanceIfNeeded();
      render();
    });
  } else {
    state.view = 'teacherPending';
  }
  render();
});

function subscribeStudentsIfNeeded() {
  if (unsubStudents) { unsubStudents(); unsubStudents = null; }
  if (state.activeGroupId) {
    unsubStudents = watchGroupStudents(state.activeGroupId, list => { state.students = list; render(); });
  }
}
function subscribeGroupDocsIfNeeded() {
  if (unsubGroupDocs) { unsubGroupDocs(); unsubGroupDocs = null; }
  if (state.activeGroupId) {
    unsubGroupDocs = watchGroupDocs(state.activeGroupId, list => { state.groupDocs = list; render(); });
  }
}
function subscribeAttendanceIfNeeded() {
  if (unsubAttendance) { unsubAttendance(); unsubAttendance = null; }
  if (state.activeGroupId) {
    unsubAttendance = watchGroupAttendance(state.activeGroupId, list => { state.attendance = list; render(); });
  }
}

/* ================= RENDER ================= */
function render() {
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
const GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 1 oy imtiyoz muddati

function getSubStatus() {
  const ud = state.userDoc;
  const plan = ud?.plan || 'free';
  if (plan === 'free') return { plan: 'free', state: 'active' };
  const expiresAtMs = ud?.planExpiresAt?.toMillis ? ud.planExpiresAt.toMillis() : null;
  if (!expiresAtMs) return { plan, state: 'active' };
  const now = Date.now();
  if (now <= expiresAtMs) return { plan, state: 'active', expiresAtMs };
  if (now <= expiresAtMs + GRACE_MS) return { plan, state: 'grace', expiresAtMs, graceUntilMs: expiresAtMs + GRACE_MS };
  return { plan, state: 'expired', expiresAtMs };
}
function getGroupLimit() {
  const status = getSubStatus();
  const plans = state.subscription?.plans || {};
  const key = status.state === 'expired' ? 'free' : status.plan;
  const limit = plans[key]?.maxGroups;
  return typeof limit === 'number' ? limit : 0; // 0 = cheksiz
}
function sortedGroupsForLimit() {
  return [...state.groups].sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
}
function isGroupLocked(group) {
  const limit = getGroupLimit();
  if (!limit) return false;
  const sorted = sortedGroupsForLimit();
  const idx = sorted.findIndex(g => g.id === group.id);
  return idx >= limit;
}
function atGroupLimit() {
  const limit = getGroupLimit();
  if (!limit) return false;
  return state.groups.length >= limit;
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
  if (ud?.status === 'rejected') {
    return `<div class="card"><h2>${t('rejectedTitle')}</h2>
      <div class="error-box">${t('rejectedMsg')}</div>
      ${ud.rejectionReason ? `<div class="error-box" style="margin-top:10px;"><b>${t('rejectionReasonShown')}</b> ${esc(ud.rejectionReason)}</div>` : ''}
      <button class="btn btn-teal" id="openResubmitBtn" style="margin-top:16px;">${t('resubmitBtn')}</button>
    </div>`;
  }
  return `<div class="card"><h2>${t('pendingTitle')}</h2>
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

  // Eng faol o'qituvchilar: guruhlar soni bo'yicha reyting
  const groupCountByTeacher = {};
  state.groups.forEach(g => { groupCountByTeacher[g.teacherId] = (groupCountByTeacher[g.teacherId] || 0) + 1; });
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
  </div>

  <div class="card">
    <h2>${t('statsTitle')}</h2>
    <div class="stat-grid" style="margin:14px 0;grid-template-columns:repeat(2,1fr);">
      <div class="stat-card"><div class="num">${state.groups.length}</div><div class="lbl">${t('statsGroups')}</div></div>
      <div class="stat-card"><div class="num">${state.students.length}</div><div class="lbl">${t('statsStudents')}</div></div>
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
        ${tc.resubmitReason ? `<div class="info-box" style="margin-top:6px;font-size:12px;">\u{1F504} ${esc(tc.resubmitReason)}</div>` : ''}
        ${tc.proofDocs?.length ? `<div style="margin-top:6px;">${tc.proofDocs.map(p => `<img src="${p}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid var(--line);margin-right:4px;">`).join('')}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-teal" data-approve="${tc.id}">${t('approve')}</button>
          <button class="btn btn-danger" data-reject="${tc.id}">${t('reject')}</button>
        </div>
      </div>`).join('')}
  </div>
  <div class="card">
    <h2>${t('approvedTitle')}</h2><div class="divider"></div>
    ${approved.length === 0 ? `<div class="empty">${t('emptyApproved')}</div>` : `
    <table><thead><tr><th>${t('colName')}</th><th>${t('colEmail')}</th><th>${t('colPhone')}</th></tr></thead><tbody>
    ${approved.map(tc => `<tr><td>${esc(tc.fullName)}</td><td>${esc(tc.email)}</td><td>${esc(tc.phone || '')}</td></tr>`).join('')}
    </tbody></table>`}
  </div>
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
    <button class="btn btn-primary no-print" id="downloadReportBtn" style="margin-top:18px;">${t('adminDownloadReport')}</button>
  </div>`;
}

function renderAdminAdsView() {
  const todayStr = new Date().toISOString().slice(0, 10);
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
          ${ad.image ? `<img src="${ad.image}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--line);">` : ''}
          <div>
            <b>${esc(ad.title || '')}</b> <span class="pill ${isLive ? 'approved' : 'pending'}">${isLive ? t('adsLive') : t('adsNotLive')}</span><br>
            <span class="muted" style="font-size:12px;">${esc((ad.text || '').slice(0, 60))}</span><br>
            <span class="muted" style="font-size:11px;">${ad.startDate || '\u2014'} \u2192 ${ad.endDate || t('adsNoEndDate')}</span>
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
  const today = new Date().toISOString().slice(0, 10);
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
      ${active.map(ad => `<a class="ad-slide" href="${ad.link ? esc(ad.link) : '#'}" target="${ad.link ? '_blank' : '_self'}" rel="noopener">
        ${ad.image ? `<img class="ad-slide-thumb" src="${ad.image}">` : ''}
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
      ${p.discount ? `<div class="pill approved">-${p.discount}% ${t('subDiscount')}</div>` : '<div style="height:24px;"></div>'}
      <ul class="plan-features">
        ${(p.features || []).map(f => `<li><span>\u2705</span><span>${esc(f)}</span></li>`).join('') || `<li class="muted">\u2014</li>`}
      </ul>
      ${isCurrent ? `<div class="pill approved">${t('subCurrent')}</div>` : `<button class="btn ${key === 'yearly' ? 'btn-primary' : key === 'monthly' ? 'btn-teal' : 'btn-outline'} block" data-chooseplan="${key}">${t('subChoose')}</button>`}
    </div>`;
  };
  return `
  <div class="card">
    <h2 style="margin:0;">${t('subTitle')}</h2>
    <div class="muted">${t('subDesc')}</div>
    ${!sub.enabled ? `<div class="info-box" style="margin-top:12px;">${t('subDisabledNote')}</div>` : ''}
    ${sub.enabled && myPlan !== 'free' && status.state === 'active' ? `<div class="info-box" style="margin-top:12px;">${t('subActiveUntil')} ${status.expiresAtMs ? new Date(status.expiresAtMs).toLocaleDateString() : '\u2014'}</div>` : ''}
    ${status.state === 'grace' ? `<div class="error-box" style="margin-top:12px;">${t('subGraceBanner', { days: Math.max(0, Math.ceil((status.graceUntilMs - Date.now()) / 86400000)) })}</div>` : ''}
    ${status.state === 'expired' ? `<div class="error-box" style="margin-top:12px;">${t('subExpiredBanner', { limit: (plans.free?.maxGroups ?? 1) })}</div>` : ''}
  </div>
  <div class="plan-grid">
    ${planCard('free', 'subFree')}
    ${planCard('monthly', 'subMonthly')}
    ${planCard('yearly', 'subYearly')}
  </div>`;
}

/* ---------- TEACHER DASHBOARD ---------- */
function studentAvg(s) { if (!s.grades || !s.grades.length) return 0; return s.grades.reduce((a, g) => a + g.value, 0) / s.grades.length; }
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

function renderTeacherDash() {
  const myGroups = state.groups;
  const activeGroup = myGroups.find(g => g.id === state.activeGroupId) || myGroups[0];
  // MUHIM: agar activeGroupId hali sozlanmagan (null) bo'lsa-yu, birinchi guruh
  // "standart" sifatida ko'rsatilayotgan bo'lsa — uni haqiqiy tanlangan holatga
  // sinxronlaymiz. Aks holda "O'chirish"/"Tahrirlash" kabi tugmalar noto'g'ri
  // (bo'sh) ID bilan ishlab, "ruxsat yo'q" xatosini berardi.
  if (activeGroup && state.activeGroupId !== activeGroup.id) {
    state.activeGroupId = activeGroup.id;
    subscribeStudentsIfNeeded();
    subscribeGroupDocsIfNeeded(); subscribeAttendanceIfNeeded();
  }
  const status = getSubStatus();
  const limit = getGroupLimit();
  return `
  ${status.state === 'grace' ? `<div class="error-box no-print" style="margin-bottom:16px;">${t('subGraceBanner', { days: Math.max(0, Math.ceil((status.graceUntilMs - Date.now()) / 86400000)) })} <button class="link-btn" data-navto="subscription">${t('subRenewBtn')}</button></div>` : ''}
  ${status.state === 'expired' ? `<div class="error-box no-print" style="margin-bottom:16px;">${t('subExpiredBanner', { limit })} <button class="link-btn" data-navto="subscription">${t('subRenewBtn')}</button></div>` : ''}
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

function renderGroupPanel(group) {
  const locked = isGroupLocked(group);
  const students = state.students.filter(s => s.groupId === group.id);
  const withGrades = students.filter(s => s.grades && s.grades.length);
  const avg = withGrades.length ? withGrades.reduce((a, s) => a + studentAvg(s), 0) / withGrades.length : 0;
  const isOwner = group.teacherId === state.firebaseUser?.uid;
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div><h2 style="margin:0;">${esc(group.name)}</h2><span class="tag-subject">${esc(group.subject)}</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;" class="no-print">
        <button class="btn btn-outline" id="addManualBtn" ${locked ? 'disabled' : ''}>${t('addManualBtn')}</button>
        <button class="btn btn-outline" id="addPhotoBtn" ${locked ? 'disabled' : ''}>${t('addPhotoBtn')}</button>
        <button class="btn btn-outline" id="bulkImportBtn" ${locked ? 'disabled' : ''}>${t('bulkImportBtn')}</button>
        <button class="btn btn-outline" id="attendanceBtn" ${locked ? 'disabled' : ''}>${t('attendanceBtn')}</button>
        <button class="btn btn-outline" id="docsBtn">${t('docsBtn')}</button>
        <button class="btn btn-outline" id="quarterlyBtn">${t('quarterlyBtn')}</button>
        <button class="btn btn-outline" id="excelExportBtn" ${locked ? 'disabled' : ''}>${t('exportExcelBtn')}</button>
        <button class="btn btn-primary" id="printBtn" ${locked ? 'disabled' : ''}>${t('exportPrintBtn')}</button>
        ${isOwner ? `<button class="btn btn-outline" id="coTeacherBtn">${t('coTeacherBtn')}</button>
        <button class="btn btn-outline" id="editGroupBtn">${t('editGroupBtn')}</button>
        <button class="btn btn-danger" id="deleteGroupBtn">${t('deleteGroupBtn')}</button>` : ''}
      </div>
    </div>
    ${locked ? `<div class="error-box" style="margin-top:12px;"><b>${t('groupLockedTitle')}</b><br>${t('groupLockedMsg')} <button class="link-btn" data-navto="subscription">${t('subRenewBtn')}</button></div>` : ''}
    <div class="divider"></div>
    ${students.length === 0 ? `<div class="empty"><div class="big-icon">\u{1F9D2}</div>${t('emptyStudents')}</div>` : `
    <div style="display:none;" class="jurnal-header" id="jurnalHeader">
      <h2 style="text-align:center;margin:0 0 4px;">TO'GARAK JURNALI</h2>
      <p style="text-align:center;margin:0 0 4px;">"${esc(group.name)}" to'garagi \u2014 ${esc(group.subject)}</p>
      <p style="text-align:center;margin:0 0 16px;">Rahbar: ${esc(state.userDoc?.fullName || '')} &nbsp;\u00B7&nbsp; ${new Date().getFullYear()}-${new Date().getFullYear() + 1} o'quv yili</p>
    </div>
    <table><thead><tr><th>${t('colNum')}</th><th>${t('colPhoto')}</th><th>${t('colFullName')}</th><th>${t('colClass')}</th><th>${t('colGrades')}</th><th>${t('colAvg')}</th><th>${t('colLevel')}</th><th>${t('colAttendance')}</th><th class="no-print"></th></tr></thead><tbody>
    ${students.map((s, i) => {
      const a = studentAvg(s); const lvl = levelLabel(a);
      const att = studentAttendancePercent(s.id);
      return `<tr>
        <td>${i + 1}</td>
        <td>${s.photo ? `<img class="student-photo" src="${s.photo}">` : '\u2014'}</td>
        <td><b>${esc(s.fullName)}</b>${s.fromPhoto ? ` <span class="muted" style="font-size:11px;">${t('fromPhotoTag')}</span>` : ''}</td>
        <td>${esc(s.className || '\u2014')}</td>
        <td>${(s.grades || []).map(g => `<span class="grade ${gradeClass(g.value)}" title="${esc(g.subject)}${g.period ? ' \u00B7 ' + esc(g.period) : ''}">${g.value}</span>`).join(' ') || '<span class="muted">\u2014</span>'}
          <button class="link-btn no-print" data-addgrade="${s.id}" style="margin-left:6px;" ${locked ? 'disabled' : ''}>${t('addGradeLink')}</button></td>
        <td><b>${a ? a.toFixed(2) : '\u2014'}</b></td>
        <td><span style="color:${lvl.c};font-weight:700;">${lvl.label}</span>
          <div class="progress-bar" style="margin-top:4px;"><div style="width:${Math.min(100, a / 5 * 100)}%;"></div></div></td>
        <td>${att === null ? '<span class="muted">\u2014</span>' : `<b>${att}%</b>`}</td>
        <td class="no-print"><button class="link-btn" data-delstudent="${s.id}" style="color:var(--danger);" ${locked ? 'disabled' : ''}>${t('deleteLink')}</button></td>
      </tr>`;
    }).join('')}
    </tbody></table>
    <div class="divider"></div>
    <div class="muted">${t('groupAvgLabel')} <b style="color:var(--navy)">${avg.toFixed(2)}</b> / 5.00 &nbsp;\u00B7&nbsp; ${t('groupProgressLabel')} <b style="color:var(--teal)">${withGrades.length ? Math.round(withGrades.filter(s => studentAvg(s) >= 3).length / withGrades.length * 100) : 0}%</b></div>
    `}
  </div>`;
}

/* ---------- MODALS ---------- */
function renderModal() {
  if (!state.modal) return '';
  const m = state.modal;
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
  if (m.type === 'addManual') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:420px;">
      <h2>${t('mAddStudentTitle')}</h2>
      <label>${t('mFioLabel')}</label><input type="text" id="amName" placeholder="${t('mFioPh')}">
      <label>${t('mClassLabel')}</label><input type="text" id="amClass" placeholder="${t('mClassPh')}">
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="amSave">${t('mAdd')}</button>
      </div></div></div>`;
  }
  if (m.type === 'addPhoto') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:460px;">
      <h2>${t('mPhotoTitle')}</h2>
      <div class="muted">${t('mPhotoDesc')}</div>
      <div class="upload-drop" id="photoDropZone" style="margin-top:12px;">
        <input type="file" id="photoInput" accept="image/*" style="display:none;">${t('mPickPhoto')}
      </div>
      <div id="photoPreviewWrap"></div>
      <label>${t('mFioLabel')}</label><input type="text" id="apName" placeholder="${t('mFioPh')}">
      <label>${t('mClassLabel')}</label><input type="text" id="apClass" placeholder="${t('mClassPh')}">
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('mClose')}</button>
        <button class="btn btn-teal block" id="apSave">${t('mAdd')}</button>
      </div></div></div>`;
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
  if (m.type === 'bulkImport') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:520px;">
      <h2>${t('mBulkTitle')}</h2>
      <div class="muted">${t('mBulkDesc')}</div>
      <div class="upload-drop" id="bulkFileDropZone" style="margin-top:12px;">
        <input type="file" id="bulkFileInput" accept=".csv,.xlsx,.xls,.docx" style="display:none;">
        ${t('mPickFile')}
      </div>
      <label>${t('mBulkClassLabel')}</label><input type="text" id="bulkClass" placeholder="${t('mClassPh')}">
      <label>${t('mBulkNamesLabel')}</label>
      <textarea id="bulkNamesArea" rows="8" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:13.5px;font-family:inherit;" placeholder="${t('mBulkNamesPh')}"></textarea>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="bulkSave">${t('mBulkAddAll')}</button>
      </div></div></div>`;
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
    const cats = { workplan: t('docCategoryWorkPlan'), lesson: t('docCategoryLesson') };
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:520px;">
      <h2>${t('docsTitle')}</h2>
      <div class="muted">${t('docsDesc')}</div>
      <div class="divider"></div>
      ${state.groupDocs.length === 0 ? `<div class="empty">${t('docEmpty')}</div>` :
        state.groupDocs.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);">
          <div><span class="tag-subject">${cats[d.category] || d.category}</span> <b>${esc(d.title)}</b><br><a href="${d.fileData}" download="${esc(d.fileName)}" class="muted" style="font-size:12px;">\u{1F4CE} ${esc(d.fileName)}</a></div>
          <button class="link-btn" data-deldoc="${d.id}" style="color:var(--danger);">${t('docDelete')}</button>
        </div>`).join('')}
      <div class="divider"></div>
      <label>${t('docCategoryLabel')}</label>
      <select id="docCategory"><option value="workplan">${t('docCategoryWorkPlan')}</option><option value="lesson">${t('docCategoryLesson')}</option></select>
      <label>${t('docTitleLabel')}</label><input type="text" id="docTitle" placeholder="${t('docTitlePh')}">
      <label>${t('docFileLabel')}</label>
      <div class="upload-drop" id="docDropZone" style="margin-top:6px;">
        <input type="file" id="docFileInput" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style="display:none;">${t('mPickFile')}
      </div>
      <div id="docFileNameWrap" class="muted" style="margin-top:6px;font-size:12px;"></div>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('mClose')}</button>
        <button class="btn btn-teal block" id="docUploadBtn">${t('docUploadBtn')}</button>
      </div></div></div>`;
  }
  if (m.type === 'attendance') {
    const group = state.groups.find(g => g.id === m.groupId);
    const students = state.students.filter(s => s.groupId === m.groupId);
    const todayStr = new Date().toISOString().slice(0, 10);
    const existing = state.attendance.find(a => a.date === (m.date || todayStr));
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:460px;">
      <h2>${t('attendanceTitle')}</h2>
      <label>${t('attendanceDateLabel')}</label><input type="date" id="attDate" value="${m.date || todayStr}">
      ${students.length === 0 ? `<div class="empty">${t('emptyStudents')}</div>` :
        `<div style="margin-top:12px;max-height:340px;overflow:auto;">
        ${students.map(s => {
          const checked = existing?.records ? existing.records[s.id] !== false : true;
          return `<label class="check-row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px;">
            <span>${esc(s.fullName)}</span>
            <input type="checkbox" data-att-student="${s.id}" ${checked ? 'checked' : ''}>
          </label>`;
        }).join('')}
      </div>`}
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="attendanceSaveBtn">${t('attendanceSave')}</button>
      </div></div></div>`;
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
            <button class="link-btn" data-removecoteacher="${uid}" style="color:var(--danger);font-size:12px;">${t('coTeacherRemove')}</button>
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

function monthOptionsHTML() {
  const names = { uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
    ru: ['\u042f\u043d\u0432\u0430\u0440\u044c', '\u0424\u0435\u0432\u0440\u0430\u043b\u044c', '\u041c\u0430\u0440\u0442', '\u0410\u043f\u0440\u0435\u043b\u044c', '\u041c\u0430\u0439', '\u0418\u044e\u043d\u044c', '\u0418\u044e\u043b\u044c', '\u0410\u0432\u0433\u0443\u0441\u0442', '\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c', '\u041e\u043a\u0442\u044f\u0431\u0440\u044c', '\u041d\u043e\u044f\u0431\u0440\u044c', '\u0414\u0435\u043a\u0430\u0431\u0440\u044c'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
  const arr = names[getLang()] || names.uz;
  const now = new Date().getMonth();
  return arr.map((name, i) => `<option value="${name}" ${i === now ? 'selected' : ''}>${name}</option>`).join('');
}

function quarterOfMonth(monthName) {
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
  let html = `<table><thead><tr><th>${t('colFullName')}</th><th>${qLabels[1]}</th><th>${qLabels[2]}</th><th>${qLabels[3]}</th><th>${qLabels[4]}</th></tr></thead><tbody>`;
  students.forEach(s => {
    const byQ = { 1: [], 2: [], 3: [], 4: [] };
    (s.grades || []).forEach(g => {
      const q = quarterOfMonth(g.period);
      if (q) byQ[q].push(g.value);
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
  document.querySelectorAll('[data-navto]').forEach(el => el.addEventListener('click', () => { state.view = el.dataset.navto; render(); }));
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
    await setTeacherStatus(el.dataset.approve, 'approved'); toast(t('toastApproved'), 'info');
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
  document.getElementById('sendNotifBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('notifTitle').value.trim();
    const message = document.getElementById('notifMessage').value.trim();
    if (!title || !message) { toast(t('toastFillTitleMsg'), 'error'); return; }
    try { await createNotification(title, message); toast(t('toastNotifSent'), 'info'); render(); }
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
    state.activeGroupId = el.dataset.selectgroup; subscribeStudentsIfNeeded(); subscribeGroupDocsIfNeeded(); subscribeAttendanceIfNeeded(); render();
  }));
  document.getElementById('addManualBtn')?.addEventListener('click', () => { state.modal = { type: 'addManual' }; render(); });
  document.getElementById('addPhotoBtn')?.addEventListener('click', () => { state.modal = { type: 'addPhoto' }; render(); });
  document.getElementById('bulkImportBtn')?.addEventListener('click', () => { state.modal = { type: 'bulkImport' }; render(); });
  document.getElementById('docsBtn')?.addEventListener('click', () => { state.modal = { type: 'groupDocs' }; render(); });
  document.getElementById('attendanceBtn')?.addEventListener('click', () => { state.modal = { type: 'attendance', groupId: state.activeGroupId }; render(); });
  document.getElementById('coTeacherBtn')?.addEventListener('click', () => { state.modal = { type: 'coTeachers', groupId: state.activeGroupId }; render(); });
  document.getElementById('editGroupBtn')?.addEventListener('click', () => { state.modal = { type: 'editGroup', groupId: state.activeGroupId }; render(); });
  document.getElementById('deleteGroupBtn')?.addEventListener('click', () => { state.modal = { type: 'deleteGroupConfirm', groupId: state.activeGroupId }; render(); });
  document.getElementById('quarterlyBtn')?.addEventListener('click', () => { state.modal = { type: 'quarterly', groupId: state.activeGroupId }; render(); });
  document.getElementById('printBtn')?.addEventListener('click', () => window.print());
  document.getElementById('excelExportBtn')?.addEventListener('click', () => exportGroupToExcel());
  document.getElementById('downloadReportBtn')?.addEventListener('click', () => window.print());
  document.querySelectorAll('[data-addgrade]').forEach(el => el.addEventListener('click', () => { state.modal = { type: 'addGrade', studentId: el.dataset.addgrade }; render(); }));
  document.querySelectorAll('[data-delstudent]').forEach(el => el.addEventListener('click', async () => { await deleteStudent(el.dataset.delstudent); }));

  /* Modal generic */
  document.getElementById('modalCancel')?.addEventListener('click', () => { state.modal = null; render(); });
  document.getElementById('modalBg')?.addEventListener('click', (e) => { if (e.target.id === 'modalBg') { state.modal = null; render(); } });

  document.getElementById('ngSave')?.addEventListener('click', async () => {
    if (atGroupLimit()) { toast(t('groupLimitReachedMsg'), 'error'); state.modal = null; render(); return; }
    const name = document.getElementById('ngName').value.trim();
    const subject = document.getElementById('ngSubject').value.trim();
    if (!name || !subject) { toast(t('toastFillAllFields'), 'error'); return; }
    const gid = await createGroup(state.firebaseUser.uid, name, subject);
    state.activeGroupId = gid; subscribeStudentsIfNeeded(); subscribeGroupDocsIfNeeded(); subscribeAttendanceIfNeeded();
    state.modal = null; render();
  });

  document.getElementById('amSave')?.addEventListener('click', async () => {
    if (atStudentLimit(state.activeGroupId)) { toast(t('studentLimitReachedMsg'), 'error'); return; }
    const name = document.getElementById('amName').value.trim();
    const cls = document.getElementById('amClass').value.trim();
    if (!name) { toast(t('toastEnterName'), 'error'); return; }
    await addStudent(state.firebaseUser.uid, state.activeGroupId, { fullName: name, className: cls });
    state.modal = null; render();
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
        fullName: name, className: cls, photo: selectedPhotoBase64, fromPhoto: !!selectedPhotoBase64
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
    await addGrade(state.modal.studentId, subject, value, period);
    state.modal = null; render();
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
    const limit = getStudentLimit();
    if (limit) {
      const already = state.students.filter(s => s.groupId === state.activeGroupId).length;
      const room = Math.max(0, limit - already);
      if (room === 0) { toast(t('studentLimitReachedMsg'), 'error'); return; }
      if (names.length > room) { names = names.slice(0, room); toast(t('studentLimitReachedMsg'), 'error'); }
    }
    const btn = document.getElementById('bulkSave'); btn.disabled = true; btn.textContent = t('toastAdding');
    try {
      for (const name of names) {
        await addStudent(state.firebaseUser.uid, state.activeGroupId, { fullName: name, className: cls });
      }
      toast(`${names.length} ${t('toastStudentsAdded')}`, 'info');
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
      // O'chirishdan oldin shu guruhga tegishli faol tinglovchilarni to'xtatamiz
      // (aks holda o'chirilgan hujjatga onSnapshot xato berishi mumkin).
      if (state.activeGroupId === gid) {
        if (unsubStudents) { unsubStudents(); unsubStudents = null; }
        if (unsubGroupDocs) { unsubGroupDocs(); unsubGroupDocs = null; }
      }
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
    if (file.size > 700 * 1024) { toast(t('docTooLarge'), 'error'); return; }
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
      toast(t('docUploaded'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.querySelectorAll('[data-deldoc]').forEach(el => el.addEventListener('click', async () => {
    try { await deleteGroupDoc(el.dataset.deldoc); toast(t('docDeleted'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));

  /* Davomat (yo'qlama) */
  document.getElementById('attDate')?.addEventListener('change', (e) => {
    state.modal.date = e.target.value; render();
  });
  document.getElementById('attendanceSaveBtn')?.addEventListener('click', async () => {
    const date = document.getElementById('attDate').value;
    const records = {};
    document.querySelectorAll('[data-att-student]').forEach(el => {
      records[el.dataset.attStudent] = el.checked;
    });
    try {
      await saveAttendance(state.firebaseUser.uid, state.activeGroupId, date, records);
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
  document.getElementById('adCarouselClose')?.addEventListener('click', () => {
    state.adDismissed = true; render();
  });
}


function exportGroupToExcel() {
  const group = state.groups.find(g => g.id === state.activeGroupId);
  const students = state.students.filter(s => s.groupId === state.activeGroupId);
  if (!group || !students.length) { toast(t('emptyStudents').replace(/<br>/g, ' '), 'error'); return; }
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
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, group.name.slice(0, 28) || 'Sheet1');
  XLSX.writeFile(wb, `${group.name || 'guruh'}.xlsx`);
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
