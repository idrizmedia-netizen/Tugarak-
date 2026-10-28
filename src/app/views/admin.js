import { t } from '../../i18n.js';
import { state } from '../state.js';
import { monthKey, monthShortLabel, studentAvg } from '../grades.js';
import { esc, localDateStr, safeHttpUrl, safeImgSrc } from '../util.js';

export function renderAdminDash() {
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
export function renderAdminNotificationsView() {
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

export function renderAdminSubscriptionView() {
  return `${renderSubscriptionAdminCard()}${renderSubscriptionRequestsCard()}`;
}

export function renderAdminReportsView() {
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

export function renderAdminAdsView() {
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

export function renderTopAdCarousel() {
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
