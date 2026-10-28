import { t } from '../../i18n.js';
import { deleteStudent, startNewAcademicYear } from '../../db.js';
import { atGroupLimit } from '../limits.js';
import { friendlyError, localDateStr, toast } from '../util.js';
import { state } from '../state.js';
import { render } from '../render.js';
import { loadGroupDocsOnce, syncActiveGroup } from '../session.js';
import { exportAttendanceToExcel, exportGroupToExcel, printGroupReport } from '../reports.js';

export function attachGroupNavHandlers() {

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
  document.getElementById('openNewYearBtn')?.addEventListener('click', () => { state.modal = { type: 'newYear', groupId: state.activeGroupId }; render(); });
  document.getElementById('nyStart')?.addEventListener('click', async () => {
    const label = document.getElementById('nyLabel').value.trim();
    if (!label) { toast(t('newYearNoLabel'), 'error'); return; }
    if (!confirm(t('newYearConfirm'))) return;
    const gid = state.modal.groupId;
    const btn = document.getElementById('nyStart'); btn.disabled = true;
    try {
      await startNewAcademicYear(gid, state.students.filter(x => x.groupId === gid), label, localDateStr());
      toast(t('newYearDone'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); btn.disabled = false; }
  });
  document.querySelectorAll('[data-archive]').forEach(el => el.addEventListener('click', () => {
    state.modal = { type: 'studentArchive', studentId: el.dataset.archive }; render();
  }));
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
}
