import { LANGS, getLang, t } from '../i18n.js';
import { rt, state } from './state.js';
import { renderAuthGate, renderContractView, renderGoogleCompleteScreen, renderTeacherPending } from './views/auth.js';
import { attachHandlers } from './handlers/index.js';
import { renderAdminAdsView, renderAdminDash, renderAdminNotificationsView, renderAdminReportsView, renderAdminSubscriptionView, renderTopAdCarousel } from './views/admin.js';
import { renderSubscriptionView, renderTeacherDash } from './views/teacher.js';
import { esc } from './util.js';
import { renderModal } from './modals/index.js';

/* ================= RENDER ================= */
/* Har bir Firestore yangilanishi (yangi o'quvchi, bildirishnoma, reklama...) butun sahifani qayta chizadi.
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

export function render() {
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

export function langSwitcherHTML(fixed) {
  const cur = getLang();
  const btns = LANGS.map(l => `<button data-lang="${l.code}" style="border:none;background:${l.code === cur ? 'var(--teal)' : 'transparent'};color:${l.code === cur ? '#fff' : 'var(--ink-soft)'};font-size:11px;font-weight:700;padding:4px 8px;border-radius:16px;cursor:pointer;">${l.code.toUpperCase()}</button>`).join('');
  const wrap = `<div style="display:flex;gap:2px;background:var(--paper-2);border:1px solid var(--line);border-radius:20px;padding:3px;">${btns}</div>`;
  if (!fixed) return wrap;
  return `<div style="position:fixed;top:14px;right:14px;z-index:150;display:flex;gap:8px;align-items:center;">
    ${rt.deferredInstallPrompt ? `<button class="btn btn-outline" id="installBtn" style="padding:6px 12px;font-size:12px;background:var(--surface);">\u{1F4F2} ${t('installApp')}</button>` : ''}
    ${wrap}<button class="theme-toggle" id="themeToggle" aria-label="Tun/kun rejimi"></button></div>`;
}

export function sealSVG(size) {
  size = size || 38;
  return `<svg class="seal" width="${size}" height="${size}" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
    <circle cx="30" cy="30" r="28" fill="none" stroke="var(--gold)" stroke-width="2.5"/>
    <circle cx="30" cy="30" r="21" fill="var(--navy)"/>
    <path d="M20 33 L26 39 L40 23" fill="none" stroke="var(--teal)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="30" cy="30" r="28" fill="none" stroke="var(--gold)" stroke-width="1" stroke-dasharray="2 3"/>
  </svg>`;
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
      ${rt.deferredInstallPrompt ? `<button class="btn btn-outline" id="installBtn" style="padding:6px 12px;font-size:12px;">\u{1F4F2} ${t('installApp')}</button>` : ''}
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

export function renderToast() {
  if (!state.toast) return '';
  const bg = state.toast.kind === 'error' ? 'var(--danger)' : 'var(--teal)';
  return `<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:11px 20px;border-radius:10px;font-size:13.5px;font-weight:600;box-shadow:var(--shadow);z-index:200;">${esc(state.toast.msg)}</div>`;
}

export function startLockCountdownIfNeeded() {
  const el = document.getElementById('lockCountdown');
  if (!el) return;
  const timer = setInterval(() => {
    const cur = document.getElementById('lockCountdown');
    if (!cur) { clearInterval(timer); return; }
    let secs = parseInt(cur.textContent) - 1;
    if (secs <= 0) { clearInterval(timer); render(); } else cur.textContent = secs + 's';
  }, 1000);
}
