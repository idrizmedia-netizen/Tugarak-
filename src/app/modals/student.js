import { t } from '../../i18n.js';
import { state } from '../state.js';
import { esc, num } from '../util.js';
import { findGrade, gradeClass, monthIndexOf, monthOptionsHTML, periodLabel } from '../grades.js';
import { fmtDMY, fmtMoney, payStatus, payStyle, payText } from '../pay.js';
import { formatDateDMY } from '../reports.js';

export function renderStudentArchiveModal(m) {
    const st = state.students.find(x => x.id === m.studentId);
    if (!st) return '';
    const list = (Array.isArray(st.archive) ? st.archive : []).slice().reverse();
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:520px;">
      <h2>${t('archiveTitle', { name: esc(st.fullName) })}</h2>
      ${list.length === 0 ? `<div class="empty">${t('archiveEmpty')}</div>` : list.map(a => {
        const gs = Array.isArray(a.grades) ? a.grades : [];
        const vals = gs.map(g => num(g.value)).filter(v => v >= 1 && v <= 5);
        const avg = vals.length ? (vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(2) : '\u2014';
        return `<div style="padding:12px 0;border-bottom:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <b>${esc(a.year || '')}</b>
            <span class="muted">${t('archiveGradesCount', { n: gs.length })} \u00B7 ${t('archiveAvg')}: <b>${avg}</b></span>
          </div>
          <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">${gs.map(g => `<span class="grade ${gradeClass(num(g.value))}" title="${esc(g.subject)}${g.period ? ' \u00B7 ' + esc(periodLabel(g.period)) : ''}">${num(g.value)}</span>`).join('') || '<span class="muted">\u2014</span>'}</div>
        </div>`;
      }).join('')}
      <button class="btn btn-outline block" id="modalCancel" style="margin-top:16px;">${t('mClose')}</button>
    </div></div>`;
  }

export function renderEditStudentModal(m) {
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

export function renderEditGradeModal(m) {
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

export function renderStudentPayModal(m) {
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

export function renderAddStudentModal(m) {
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

export function renderAddGradeModal(m) {
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
