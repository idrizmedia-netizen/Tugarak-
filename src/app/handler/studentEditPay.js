import { t } from '../../i18n.js';
import { applyPayDeadlines, setStudentGrades, updateGroupPaySettings, updateStudent, updateStudentPayment } from '../../db.js';
import { state } from '../state.js';
import { render } from '../render.js';
import { friendlyError, localDateStr, num, toast } from '../util.js';
import { findGrade } from '../grades.js';
import { addMonthKeepDay, markStudentPaid, nextDueFromDay, parseYMD, validPayDay } from '../pay.js';

export function attachStudentEditPayHandlers() {
  /* Qidiruv va saralash */
  document.getElementById('studentSearch')?.addEventListener('input', (e) => { state.studentQuery = e.target.value; render(); });
  document.getElementById('studentSort')?.addEventListener('change', (e) => { state.studentSort = e.target.value; render(); });

  /* O'quvchini tahrirlash */
  document.querySelectorAll('[data-editstudent]').forEach(el => el.addEventListener('click', () => {
    state.modal = { type: 'editStudent', studentId: el.dataset.editstudent }; render();
  }));
  document.getElementById('esSave')?.addEventListener('click', async () => {
    const fullName = document.getElementById('esName').value.trim();
    if (!fullName) { toast(t('toastEnterName'), 'error'); return; }
    try {
      await updateStudent(state.modal.studentId, {
        fullName,
        className: document.getElementById('esClass').value.trim(),
        birthDate: document.getElementById('esBirth').value || '',
        address: document.getElementById('esAddress').value.trim()
      });
      toast(t('studentUpdated'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Bahoni tahrirlash / o'chirish */
  document.querySelectorAll('[data-editgrade]').forEach(el => {
    const open = () => {
      const [sid, idx] = el.dataset.editgrade.split(':');
      const st = state.students.find(x => x.id === sid);
      const g = st?.grades?.[Number(idx)];
      if (!g) return;
      state.modal = { type: 'editGrade', studentId: sid, ref: { date: g.date, subject: g.subject, value: num(g.value) } };
      render();
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  document.getElementById('grSave')?.addEventListener('click', async () => {
    const st = state.students.find(x => x.id === state.modal.studentId);
    const old = st ? findGrade(st, state.modal.ref) : null;
    const subject = document.getElementById('grSubject').value.trim();
    if (!old) { state.modal = null; render(); return; }
    if (!subject) { toast(t('toastEnterSubject'), 'error'); return; }
    const value = parseInt(document.getElementById('grValue').value);
    const period = document.getElementById('grPeriod').value || null;
    try {
      await setStudentGrades(st.id, st.grades.map(g => g === old ? { ...g, subject, value, period } : g));
      toast(t('gradeUpdated'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('grDelete')?.addEventListener('click', async () => {
    if (!confirm(t('confirmDeleteGrade'))) return;
    const st = state.students.find(x => x.id === state.modal.studentId);
    const old = st ? findGrade(st, state.modal.ref) : null;
    if (!old) { state.modal = null; render(); return; }
    try {
      await setStudentGrades(st.id, st.grades.filter(g => g !== old));
      toast(t('gradeDeleted'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* To'lov: guruh sozlamalari */
  document.getElementById('payBtn')?.addEventListener('click', () => {
    state.modal = { type: 'paySettings', groupId: state.activeGroupId }; render();
  });
  document.getElementById('psSave')?.addEventListener('click', async () => {
    const group = state.groups.find(g => g.id === state.modal.groupId);
    if (!group) return;
    const isOwner = group.teacherId === state.firebaseUser?.uid;
    const dayRaw = document.getElementById('psDay').value.trim();
    const day = dayRaw ? validPayDay(dayRaw) : null;
    if (dayRaw && !day) { toast(t('payBadDay'), 'error'); return; }
    const fee = parseInt(String(document.getElementById('psFee').value).replace(/\D/g, '')) || 0;
    const applyAll = document.getElementById('psApplyAll').checked;
    const btn = document.getElementById('psSave'); btn.disabled = true;
    try {
      if (isOwner) await updateGroupPaySettings(group.id, { fee, payDay: day });
      if (day) {
        const today = localDateStr();
        const targets = state.students.filter(s => s.groupId === group.id && (applyAll || !parseYMD(s.payDue)));
        const items = targets.map(s => {
          let due = nextDueFromDay(day, today);
          // Allaqachon to'langan muddatdan keyingi sanaga qo'yiladi (aks holda to'langan oy "qarz" bo'lib qoladi).
          while (parseYMD(s.paidThrough) && due <= s.paidThrough) due = addMonthKeepDay(due, day);
          return { id: s.id, payDue: due, payDay: day };
        });
        if (items.length) await applyPayDeadlines(items);
      }
      toast(t('paySettingsSaved'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); btn.disabled = false; }
  });

  /* To'lov: o'quvchi bo'yicha */
  document.querySelectorAll('[data-paystudent]').forEach(el => el.addEventListener('click', () => {
    state.modal = { type: 'studentPay', studentId: el.dataset.paystudent }; render();
  }));
  document.querySelectorAll('[data-quickpay]').forEach(el => el.addEventListener('click', async () => {
    const st = state.students.find(x => x.id === el.dataset.quickpay);
    if (!st) return;
    const group = state.groups.find(g => g.id === st.groupId);
    el.disabled = true;
    try { await markStudentPaid(st, num(group?.fee)); }
    catch (err) { toast(friendlyError(err), 'error'); el.disabled = false; }
  }));
  document.getElementById('spSaveDue')?.addEventListener('click', async () => {
    const st = state.students.find(x => x.id === state.modal.studentId);
    const due = document.getElementById('spDue').value;
    if (!st || !parseYMD(due)) { toast(t('payNoDue'), 'error'); return; }
    try {
      await updateStudentPayment(st.id, { payDue: due, payDay: parseYMD(due).d });
      toast(t('payDueSaved'), 'info');
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('spMarkPaid')?.addEventListener('click', async () => {
    const st = state.students.find(x => x.id === state.modal.studentId);
    if (!st) return;
    const amount = parseInt(String(document.getElementById('spAmount').value).replace(/\D/g, '')) || 0;
    try { await markStudentPaid(st, amount); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('spUndo')?.addEventListener('click', async () => {
    const st = state.students.find(x => x.id === state.modal.studentId);
    const hist = Array.isArray(st?.payHistory) ? st.payHistory : [];
    const last = hist[hist.length - 1];
    if (!st || !last) return;
    try {
      await updateStudentPayment(st.id, { payDue: last.due || '', paidThrough: last.prev || '', payHistory: hist.slice(0, -1) });
      toast(t('payUndone'), 'info');
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  document.getElementById('adCarouselClose')?.addEventListener('click', () => {
    state.adDismissed = true; render();
  });
}
