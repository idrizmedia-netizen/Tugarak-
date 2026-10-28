import { t } from '../../i18n.js';
import { addCoTeacher, addGroupDoc, deleteGroup, deleteGroupDoc, findApprovedTeacherByEmail, removeCoTeacher, saveAttendance, saveWorkPlanItems, updateGroup } from '../../db.js';
import { parseWorkPlanFile } from '../../importParsers.js';
import { friendlyError, toast } from '../util.js';
import { rt, state } from '../state.js';
import { render } from '../render.js';
import { loadAttendanceOnce, loadGroupDocsOnce } from '../session.js';

export function attachGroupToolsHandlers() {

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
      // O'chirishdan oldin shu guruhga tegishli faol tinglovchini to'xtatamiz
      // (aks holda o'chirilgan hujjatga onSnapshot xato berishi mumkin).
      if (state.activeGroupId === gid && rt.unsubStudents) { rt.unsubStudents(); rt.unsubStudents = null; }
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
    if (file.size > 500 * 1024) { toast(t('docTooLarge'), 'error'); return; }
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
      await loadGroupDocsOnce();
      toast(t('docUploaded'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.querySelectorAll('[data-deldoc]').forEach(el => el.addEventListener('click', async () => {
    try { await deleteGroupDoc(el.dataset.deldoc); await loadGroupDocsOnce(); toast(t('docDeleted'), 'info'); render(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));

  /* Yillik ish reja jadvali */
  document.getElementById('workPlanAddBtn')?.addEventListener('click', async () => {
    const topic = document.getElementById('wpTopic').value.trim();
    const hours = document.getElementById('wpHours').value.trim();
    const date = document.getElementById('wpDate').value;
    const note = document.getElementById('wpNote').value.trim();
    if (!topic) { toast(t('toastFillAllFields'), 'error'); return; }
    const newItems = [...state.workPlan, { topic, hours, date, note }];
    try {
      await saveWorkPlanItems(state.firebaseUser.uid, state.activeGroupId, newItems);
      state.workPlan = newItems;
      render();
      document.getElementById('wpTopic').value = '';
      document.getElementById('wpHours').value = '';
      document.getElementById('wpDate').value = '';
      document.getElementById('wpNote').value = '';
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('wpImportZone')?.addEventListener('click', () => document.getElementById('wpImportInput').click());
  document.getElementById('wpImportInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const zone = document.getElementById('wpImportZone');
    zone.textContent = t('toastFileReading');
    try {
      const items = await parseWorkPlanFile(file);
      if (!items.length) { toast(t('wpImportNone'), 'error'); render(); return; }
      const room = Math.max(0, 300 - state.workPlan.length);
      const add = items.slice(0, room);
      if (!add.length) { toast(t('wpImportLimit'), 'error'); render(); return; }
      const merged = [...state.workPlan, ...add];
      await saveWorkPlanItems(state.firebaseUser.uid, state.activeGroupId, merged);
      state.workPlan = merged;
      toast(t('wpImportDone', { n: add.length }) + (add.length < items.length ? ' ' + t('wpImportLimit') : ''), 'info');
      render();
    } catch (err) {
      toast(t('toastFileReadError') + ' ' + (err.message || ''), 'error');
      render();
    }
  });
  document.querySelectorAll('[data-delworkplanrow]').forEach(el => el.addEventListener('click', async () => {
    const idx = parseInt(el.dataset.delworkplanrow);
    const newItems = state.workPlan.filter((_, i) => i !== idx);
    try { await saveWorkPlanItems(state.firebaseUser.uid, state.activeGroupId, newItems); state.workPlan = newItems; render(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));

  /* Davomat (yo'qlama) */
  document.getElementById('attDate')?.addEventListener('change', (e) => {
    state.modal.date = e.target.value; state.modal.draft = {}; render();
  });
  document.querySelectorAll('[data-att-student]').forEach(el => el.addEventListener('change', () => {
    state.modal.draft = state.modal.draft || {};
    state.modal.draft[el.dataset.attStudent] = el.checked;
  }));
  document.getElementById('attendanceSaveBtn')?.addEventListener('click', async () => {
    const date = document.getElementById('attDate').value;
    const records = {};
    document.querySelectorAll('[data-att-student]').forEach(el => {
      records[el.dataset.attStudent] = el.checked;
    });
    try {
      await saveAttendance(state.firebaseUser.uid, state.activeGroupId, date, records);
      await loadAttendanceOnce();
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
}
