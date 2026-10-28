import { t } from '../../i18n.js';
import { activateSubscription, blockTeacher, createNotification, markPlanContacted, rejectTeacher, saveSubscriptionSettings, setTeacherStatus, unblockTeacher } from '../../db.js';
import { refreshEmailVerified, resendVerificationEmail, syncEmailVerifiedFlag } from '../../auth.js';
import { state } from '../state.js';
import { friendlyError, toast } from '../util.js';
import { render } from '../render.js';
import { exportAdminReportToExcel } from '../reports.js';
import { loadAdminDataOnce } from '../session.js';

export function attachAdminActionsHandlers() {

  /* Admin actions */
  document.querySelectorAll('[data-approve]').forEach(el => el.addEventListener('click', async () => {
    try {
      const tc = state.teachers.find(x => x.id === el.dataset.approve);
      if (tc && tc.emailVerified === false && !confirm(t('confirmApproveUnverified', { name: tc.fullName || tc.email }))) return;
      await setTeacherStatus(el.dataset.approve, 'approved', tc);
      toast(t('toastApproved'), 'info');
    } catch (err) { toast(friendlyError(err), 'error'); }
  }));
  document.querySelectorAll('[data-reject]').forEach(el => el.addEventListener('click', () => {
    state.modal = { type: 'rejectReason', teacherId: el.dataset.reject };
    render();
  }));
  document.getElementById('rejectConfirmBtn')?.addEventListener('click', async () => {
    const reason = document.getElementById('rejectReasonArea').value.trim();
    try {
      await rejectTeacher(state.modal.teacherId, reason);
      toast(t('toastRejected'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('resendVerifyBtn')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await resendVerificationEmail(); toast(t('verifySent'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
    e.target.disabled = false;
  });
  document.getElementById('checkVerifyBtn')?.addEventListener('click', async () => {
    try {
      const ok = await refreshEmailVerified();
      if (ok) {
        await syncEmailVerifiedFlag(state.firebaseUser, state.userDoc).catch(() => {});
        toast(t('verifyDone'), 'info');
      } else toast(t('verifyNot'), 'error');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('teacherSearch')?.addEventListener('input', (e) => { state.teacherQuery = e.target.value; render(); });
  document.querySelectorAll('[data-block]').forEach(el => el.addEventListener('click', async () => {
    const tc = state.teachers.find(x => x.id === el.dataset.block);
    if (!tc || !confirm(t('confirmBlock', { name: tc.fullName || tc.email }))) return;
    try { await blockTeacher(tc.id, tc); toast(t('toastBlocked'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));
  document.querySelectorAll('[data-unblock]').forEach(el => el.addEventListener('click', async () => {
    const tc = state.teachers.find(x => x.id === el.dataset.unblock);
    if (!tc || !confirm(t('confirmUnblock', { name: tc.fullName || tc.email }))) return;
    try { await unblockTeacher(tc.id, tc); toast(t('toastUnblocked'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));
  document.getElementById('adminExcelBtn')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await exportAdminReportToExcel(); } catch (err) { toast(friendlyError(err), 'error'); }
    e.target.disabled = false;
  });
  document.getElementById('adminRefreshBtn')?.addEventListener('click', () => loadAdminDataOnce(true));
  document.getElementById('sendNotifBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('notifTitle').value.trim();
    const message = document.getElementById('notifMessage').value.trim();
    if (!title || !message) { toast(t('toastFillTitleMsg'), 'error'); return; }
    try {
      await createNotification(title, message);
      document.getElementById('notifTitle').value = '';
      document.getElementById('notifMessage').value = '';
      toast(t('toastNotifSent'), 'info');
    }
    catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.getElementById('saveSubBtn')?.addEventListener('click', async () => {
    const readPlan = (key) => ({
      price: parseInt(document.getElementById(`subPrice_${key}`).value) || 0,
      discount: parseInt(document.getElementById(`subDiscount_${key}`).value) || 0,
      maxGroups: parseInt(document.getElementById(`subMaxGroups_${key}`).value) || 0,
      maxStudents: parseInt(document.getElementById(`subMaxStudents_${key}`).value) || 0,
      features: document.getElementById(`subFeatures_${key}`).value.split('\n').map(s => s.trim()).filter(Boolean),
    });
    const data = {
      enabled: document.getElementById('subEnabled').checked,
      plans: { free: readPlan('free'), monthly: readPlan('monthly'), yearly: readPlan('yearly') }
    };
    try { await saveSubscriptionSettings(data); toast(t('subPlansSaved'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.querySelectorAll('[data-activateplan]').forEach(el => el.addEventListener('click', async () => {
    try {
      await activateSubscription(el.dataset.activateplan, el.dataset.plankey);
      toast(t('subActivated'), 'info');
    } catch (err) { toast(friendlyError(err), 'error'); }
  }));
  document.querySelectorAll('[data-markcontacted]').forEach(el => el.addEventListener('click', async () => {
    try { await markPlanContacted(el.dataset.markcontacted); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));
}
