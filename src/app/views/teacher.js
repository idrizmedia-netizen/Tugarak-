import { t } from '../../i18n.js';
import { state } from '../state.js';
import { emailVerifyBannerHTML, getGroupLimit, getSubStatus, isGroupLocked, subExpiringBannerHTML } from '../limits.js';
import { esc, num, safeImgSrc } from '../util.js';
import { syncActiveGroup } from '../session.js';
import { PAY_WARN_DAYS, fmtMoney, monthCollected, parseYMD, payStatus, payStyle, payText, visibleStudents } from '../pay.js';
import { gradeClass, levelLabel, periodLabel, studentAttendancePercent, studentAvg } from '../grades.js';

/* ---------- OBUNA: o'qituvchi ko'rinishi ---------- */
export function renderSubscriptionView() {
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

export function renderTeacherDash() {
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
          <button class="link-btn no-print" data-addgrade="${s.id}" style="margin-left:6px;" ${locked ? 'disabled' : ''}>${t('addGradeLink')}</button>
          ${Array.isArray(s.archive) && s.archive.length ? `<button class="link-btn no-print" data-archive="${s.id}" style="margin-left:6px;">\u{1F4DA} ${t('archiveLink')}</button>` : ''}</td>
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
