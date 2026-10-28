import { clearFails, completeGoogleRegistration, getLockInfo, getUserDoc, loginTeacher, loginWithGoogle, registerFail, registerTeacher, resetPassword } from '../../auth.js';
import { t } from '../../i18n.js';
import { state } from '../state.js';
import { friendlyError, toast } from '../util.js';
import { render, startLockCountdownIfNeeded } from '../render.js';

export function attachAuthFormsHandlers() {

  /* Forma maydonlari: har bir harf kiritilganda state'ga yozib boriladi
     (render() chaqirilmaydi) — shunda modal ochilishi yoki taymer kabi
     boshqa sabab bilan sahifa qayta chizilsa ham, yozilgan matn saqlanib qoladi. */
  document.getElementById('rName')?.addEventListener('input', e => state.regForm.name = e.target.value);
  document.getElementById('rEmail')?.addEventListener('input', e => state.regForm.email = e.target.value);
  document.getElementById('rPhone')?.addEventListener('input', e => state.regForm.phone = e.target.value);
  document.getElementById('rPass')?.addEventListener('input', e => state.regForm.password = e.target.value);
  document.getElementById('tlEmail')?.addEventListener('input', e => state.loginForm.email = e.target.value);
  document.getElementById('tlPass')?.addEventListener('input', e => state.loginForm.password = e.target.value);
  document.getElementById('gcPhone')?.addEventListener('input', e => state.regForm.phone = e.target.value);

  /* Teacher login */
  document.getElementById('teacherLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('tlEmail').value.trim();
    const pass = document.getElementById('tlPass').value;
    state.authEmailTry = email;
    const lockKey = 'teacher::' + email;
    if (getLockInfo(lockKey).locked) { toast(t('toastLocked'), 'error'); return; }
    try {
      await loginTeacher(email, pass);
      clearFails(lockKey);
      state.loginForm = { email: '', password: '' };
    } catch (err) {
      const count = registerFail(lockKey);
      toast(`${friendlyError(err)} (${t('toastAttempt')}: ${count}/3)`, 'error');
      render(); startLockCountdownIfNeeded();
    }
  });

  document.getElementById('googleLoginBtn')?.addEventListener('click', async () => {
    try { await loginWithGoogle(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });

  document.getElementById('forgotBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('tlEmail').value.trim();
    if (!email) { toast(t('toastEnterEmailFirst'), 'error'); return; }
    try { await resetPassword(email); toast(t('toastResetSent'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Teacher register */
  document.getElementById('openContractBtn')?.addEventListener('click', () => {
    state.contractReturnView = state.view;
    state.view = 'contractView';
    render();
  });
  document.getElementById('contractBackBtn')?.addEventListener('click', () => {
    state.view = state.contractReturnView || 'teacherAuth';
    render();
  });
  document.getElementById('contractAcceptBtn')?.addEventListener('click', () => {
    if (!document.getElementById('contractCheck').checked) { toast(t('toastFillCheckbox'), 'error'); return; }
    state.pendingRegisterContract = true;
    state.view = state.contractReturnView || 'teacherAuth';
    render();
  });
  document.getElementById('teacherRegForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.pendingRegisterContract) { toast(t('toastAcceptContractFirst'), 'error'); return; }
    const fullName = document.getElementById('rName').value.trim();
    const email = document.getElementById('rEmail').value.trim();
    const phone = document.getElementById('rPhone').value.trim();
    const password = document.getElementById('rPass').value;
    try {
      await registerTeacher({ fullName, email, phone, password });
      state.pendingRegisterContract = false;
      state.regForm = { name: '', email: '', phone: '', password: '' };
      toast(t('toastAppSent'), 'info');
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Google complete registration */
  document.getElementById('googleCompleteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.pendingRegisterContract) { toast(t('toastAcceptContractFirst'), 'error'); return; }
    const phone = document.getElementById('gcPhone').value.trim();
    try {
      await completeGoogleRegistration(state.firebaseUser.uid, { phone });
      state.pendingRegisterContract = false;
      const udoc = await getUserDoc(state.firebaseUser.uid);
      state.userDoc = udoc; state.view = 'teacherPending';
      toast(t('toastAppSent'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Admin login \u2014 faqat Google */
  document.getElementById('adminGoogleLoginBtn')?.addEventListener('click', async () => {
    try { await loginWithGoogle(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });
}
