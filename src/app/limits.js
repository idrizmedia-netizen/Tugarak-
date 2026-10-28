import { t } from '../i18n.js';
import { state } from './state.js';
import { daysBetween, fmtDMY, pad2 } from './pay.js';
import { esc, localDateStr } from './util.js';

/* ---------- OBUNA HOLATI VA CHEKLOVLAR ---------- */
export function getSubStatus() {
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

export function ymdOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

/** Email/parol bilan ro'yxatdan o'tgan va emailini hali tasdiqlamagan o'qituvchiga eslatma. */
export function emailVerifyBannerHTML() {
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
export function subExpiringBannerHTML(status) {
  if (status.plan === 'free' || status.state !== 'active' || !status.expiresAtMs) return '';
  if (status.daysLeft === null || status.daysLeft > SUB_WARN_DAYS) return '';
  const date = fmtDMY(ymdOf(new Date(status.expiresAtMs)));
  const msg = status.daysLeft <= 0 ? t('subExpiringToday', { date }) : t('subExpiringBanner', { n: status.daysLeft, date });
  return `<div class="no-print" style="margin-bottom:16px;padding:10px 12px;border-radius:8px;font-size:13px;background:#C9992C15;border:1px solid #C9992C55;color:var(--gold);">${msg} <button class="link-btn" data-navto="subscription">${t('subRenewBtn')}</button></div>`;
}

export function getGroupLimit() {
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

export function isGroupLocked(group) {
  if (group.teacherId !== state.firebaseUser?.uid) return false; // hamkor sifatida qo'shilgan guruh egasining rejasiga bog'liq
  const limit = getGroupLimit();
  if (!limit) return false;
  const sorted = sortedGroupsForLimit();
  const idx = sorted.findIndex(g => g.id === group.id);
  return idx >= limit;
}

export function atGroupLimit() {
  const limit = getGroupLimit();
  if (!limit) return false;
  return ownGroups().length >= limit;
}

export function getStudentLimit() {
  const status = getSubStatus();
  const plans = state.subscription?.plans || {};
  const key = status.state === 'expired' ? 'free' : status.plan;
  const limit = plans[key]?.maxStudents;
  return typeof limit === 'number' ? limit : 0; // 0 = cheksiz
}

export function atStudentLimit(groupId) {
  const limit = getStudentLimit();
  if (!limit) return false;
  return state.students.filter(s => s.groupId === groupId).length >= limit;
}
