import { t } from '../../i18n.js';
import { state } from '../state.js';
import { esc } from '../util.js';
import { studentAvg } from '../grades.js';

export function renderNotificationsModal(m) {
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

export function renderRejectReasonModal(m) {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:420px;">
      <h2>${t('rejectReasonTitle')}</h2>
      <label>${t('rejectReasonLabel')}</label>
      <textarea id="rejectReasonArea" rows="4" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:13.5px;font-family:inherit;" placeholder="${t('rejectReasonPh')}"></textarea>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">${t('cancel')}</button>
        <button class="btn btn-danger block" id="rejectConfirmBtn">${t('rejectConfirm')}</button>
      </div></div></div>`;
  }

export function renderResubmitModal(m) {
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

export function renderProfileModal(m) {
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
