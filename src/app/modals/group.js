import { getLang, t } from '../../i18n.js';
import { state } from '../state.js';
import { esc, localDateStr, num, safeFileHref } from '../util.js';
import { MONTHS_FULL, defaultYearLabel, renderQuarterlyContent } from '../grades.js';
import { validPayDay } from '../pay.js';
import { buildAttendanceReport } from '../reports.js';

export function renderNewYearModal(m) {
    const students = state.students.filter(x => x.groupId === m.groupId);
    const withG = students.filter(x => (x.grades || []).length);
    const total = withG.reduce((a, x) => a + x.grades.length, 0);
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:460px;">
      <h2>${t('newYearTitle')}</h2>
      <div class="muted">${t('newYearDesc')}</div>
      <div class="info-box">${t('newYearStats', { s: withG.length, g: total })}</div>
      <label>${t('newYearLabelLabel')}</label><input type="text" id="nyLabel" maxlength="20" value="${esc(defaultYearLabel(students))}">
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-danger block" id="nyStart">${t('newYearStart')}</button>
      </div></div></div>`;
  }

export function renderPaySettingsModal(m) {
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

export function renderNewGroupModal(m) {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:420px;">
      <h2>${t('mNewGroupTitle')}</h2>
      <label>${t('mGroupNameLabel')}</label><input type="text" id="ngName" placeholder="${t('mGroupNamePh')}">
      <label>${t('mSubjectLabel')}</label><input type="text" id="ngSubject" placeholder="${t('mSubjectPh')}">
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-teal block" id="ngSave">${t('mCreate')}</button>
      </div></div></div>`;
  }

export function renderReportsMenuModal(m) {
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

export function renderGroupSettingsModal(m) {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:360px;">
      <h2>${t('groupSettingsBtn')}</h2>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
        <button class="btn btn-outline block" id="openCoTeacherBtn">${t('coTeacherBtn')}</button>
        <button class="btn btn-outline block" id="openEditGroupBtn">${t('editGroupBtn')}</button>
        <button class="btn btn-outline block" id="openNewYearBtn">${t('newYearBtn')}</button>
        <button class="btn btn-danger block" id="openDeleteGroupBtn">${t('deleteGroupBtn')}</button>
      </div>
      <button class="btn btn-outline block" id="modalCancel" style="margin-top:16px;">${t('mClose')}</button>
    </div></div>`;
  }

export function renderQuarterlyModal(m) {
    return `<div class="modal-bg" id="modalBg"><div class="modal">
      <h2>${t('mQuarterlyTitle')}</h2>
      ${renderQuarterlyContent(m.groupId)}
      <button class="btn btn-outline block" id="modalCancel" style="margin-top:16px;">${t('mClose')}</button>
    </div></div>`;
  }

export function renderEditGroupModal(m) {
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

export function renderDeleteGroupConfirmModal(m) {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:400px;">
      <h2>${t('deleteGroupConfirmTitle')}</h2>
      <div class="error-box">${t('deleteGroupConfirmMsg')}</div>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-danger block" id="deleteGroupConfirmBtn">${t('deleteConfirmBtn')}</button>
      </div></div></div>`;
  }

export function renderGroupDocsModal(m) {
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

export function renderAttendanceModal(m) {
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

export function renderAttendanceReportModal(m) {
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

export function renderCoTeachersModal(m) {
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
