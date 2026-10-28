import { t } from '../../i18n.js';
import { addGrade, addStudent, addStudentsBatch, createGroup } from '../../db.js';
import { parseRosterFile } from '../../importParsers.js';
import { atGroupLimit, atStudentLimit, getStudentLimit } from '../limits.js';
import { fileToCompressedBase64, friendlyError, toast } from '../util.js';
import { state } from '../state.js';
import { render } from '../render.js';
import { syncActiveGroup } from '../session.js';
import { groupPayDefaults } from '../pay.js';

export function attachStudentAddHandlers() {

  document.getElementById('ngSave')?.addEventListener('click', async () => {
    if (atGroupLimit()) { toast(t('groupLimitReachedMsg'), 'error'); state.modal = null; render(); return; }
    const name = document.getElementById('ngName').value.trim();
    const subject = document.getElementById('ngSubject').value.trim();
    if (!name || !subject) { toast(t('toastFillAllFields'), 'error'); return; }
    try {
      const gid = await createGroup(state.firebaseUser.uid, name, subject);
      state.activeGroupId = gid; syncActiveGroup();
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  document.getElementById('amSave')?.addEventListener('click', async () => {
    if (atStudentLimit(state.activeGroupId)) { toast(t('studentLimitReachedMsg'), 'error'); return; }
    const name = document.getElementById('amName').value.trim();
    const cls = document.getElementById('amClass').value.trim();
    const birthDate = document.getElementById('amBirthDate')?.value || '';
    const address = document.getElementById('amAddress')?.value.trim() || '';
    if (!name) { toast(t('toastEnterName'), 'error'); return; }
    const btn = document.getElementById('amSave'); btn.disabled = true;
    try {
      await addStudent(state.firebaseUser.uid, state.activeGroupId, { fullName: name, className: cls, birthDate, address, ...groupPayDefaults() });
      state.modal = null; render();
    } catch (err) {
      toast(friendlyError(err), 'error');
      btn.disabled = false;
    }
  });

  let selectedPhotoBase64 = null;
  document.getElementById('photoDropZone')?.addEventListener('click', () => document.getElementById('photoInput').click());
  document.getElementById('photoInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const zone = document.getElementById('photoDropZone'); zone.textContent = t('toastCompressing');
    try {
      selectedPhotoBase64 = await fileToCompressedBase64(file);
      document.getElementById('photoPreviewWrap').innerHTML = `<img src="${selectedPhotoBase64}" style="width:100%;border-radius:8px;margin-top:10px;border:1px solid var(--line);">`;
      zone.textContent = t('mPickPhoto');
    } catch (err) { toast(t('toastPhotoError'), 'error'); zone.textContent = t('mPickPhoto'); }
  });
  document.getElementById('apSave')?.addEventListener('click', async () => {
    if (atStudentLimit(state.activeGroupId)) { toast(t('studentLimitReachedMsg'), 'error'); return; }
    const name = document.getElementById('apName').value.trim();
    const cls = document.getElementById('apClass').value.trim();
    if (!name) { toast(t('toastEnterName'), 'error'); return; }
    try {
      await addStudent(state.firebaseUser.uid, state.activeGroupId, {
        fullName: name, className: cls, photo: selectedPhotoBase64, fromPhoto: !!selectedPhotoBase64, ...groupPayDefaults()
      });
      selectedPhotoBase64 = null;
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  document.getElementById('agSave')?.addEventListener('click', async () => {
    const subject = document.getElementById('agSubject').value.trim();
    const value = parseInt(document.getElementById('agValue').value);
    const period = document.getElementById('agPeriod')?.value || '';
    if (!subject) { toast(t('toastEnterSubject'), 'error'); return; }
    try {
      await addGrade(state.modal.studentId, subject, value, period);
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Fayldan (Excel/CSV/Word) ommaviy o'quvchi import qilish */
  document.getElementById('bulkFileDropZone')?.addEventListener('click', () => document.getElementById('bulkFileInput').click());
  document.getElementById('bulkFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const zone = document.getElementById('bulkFileDropZone');
    zone.textContent = t('toastFileReading');
    try {
      const names = await parseRosterFile(file);
      document.getElementById('bulkNamesArea').value = names.join('\n');
      zone.textContent = names.length
        ? `\u2705 ${names.length} ${t('toastNamesFound')}`
        : `\u26A0\uFE0F ${t('toastNoNamesFound')}`;
    } catch (err) {
      toast(t('toastFileReadError') + ' ' + (err.message || ''), 'error');
      zone.textContent = t('mPickFile');
    }
  });
  document.getElementById('bulkSave')?.addEventListener('click', async () => {
    const cls = document.getElementById('bulkClass').value.trim();
    const raw = document.getElementById('bulkNamesArea').value;
    let names = raw.split('\n').map(s => s.trim()).filter(Boolean);
    if (!names.length) { toast(t('toastEnterOneName'), 'error'); return; }
    // Takroriy ismlarni (ro'yxat ichida va guruhda mavjudlarini) o'tkazib yuboramiz.
    const seenNames = new Set(state.students.filter(s => s.groupId === state.activeGroupId).map(s => (s.fullName || '').trim().toLowerCase()));
    const before = names.length;
    names = names.map(n => n.replace(/\s+/g, ' ').slice(0, 120)).filter(n => {
      const k = n.toLowerCase();
      if (seenNames.has(k)) return false;
      seenNames.add(k);
      return true;
    });
    const skippedDup = before - names.length;
    if (!names.length) { toast(`${skippedDup} ${t('toastDupSkipped')}`, 'error'); return; }
    const limit = getStudentLimit();
    if (limit) {
      const already = state.students.filter(s => s.groupId === state.activeGroupId).length;
      const room = Math.max(0, limit - already);
      if (room === 0) { toast(t('studentLimitReachedMsg'), 'error'); return; }
      if (names.length > room) { names = names.slice(0, room); toast(t('studentLimitReachedMsg'), 'error'); }
    }
    const btn = document.getElementById('bulkSave'); btn.disabled = true; btn.textContent = t('toastAdding');
    try {
      await addStudentsBatch(state.firebaseUser.uid, state.activeGroupId, names, cls, groupPayDefaults());
      toast(`${names.length} ${t('toastStudentsAdded')}${skippedDup ? ` (${skippedDup} ${t('toastDupSkipped')})` : ''}`, 'info');
      state.modal = null; render();
    } catch (err) {
      toast(friendlyError(err), 'error');
      btn.disabled = false; btn.textContent = t('mBulkAddAll');
    }
  });
}
