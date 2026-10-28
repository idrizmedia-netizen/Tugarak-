import { contractText, t } from '../../i18n.js';
import { getLockInfo } from '../../auth.js';
import { state } from '../state.js';
import { langSwitcherHTML, renderToast, sealSVG } from '../render.js';
import { renderModal } from '../modals/index.js';
import { esc } from '../util.js';
import { emailVerifyBannerHTML } from '../limits.js';

/* ---------- AUTH GATE ---------- */
export function renderAuthGate() {
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
export function renderContractView() {
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

export function renderGoogleCompleteScreen() {
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
export function renderTeacherPending() {
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
