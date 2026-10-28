import { t } from '../../i18n.js';
import { cancelSubscription, chooseSubscriptionPlan, resubmitApplication, updateTeacherProfile } from '../../db.js';
import { getUserDoc } from '../../auth.js';
import { state } from '../state.js';
import { render } from '../render.js';
import { fileToCompressedBase64, friendlyError, toast } from '../util.js';

export function attachAccountHandlers() {

  /* Resubmit (rad etilgandan keyin qayta yuborish) */
  document.getElementById('openResubmitBtn')?.addEventListener('click', () => { state.modal = { type: 'resubmit' }; render(); });
  let proofDocBase64 = null;
  document.getElementById('proofDropZone')?.addEventListener('click', () => document.getElementById('proofInput').click());
  document.getElementById('proofInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      proofDocBase64 = await fileToCompressedBase64(file);
      document.getElementById('proofPreviewWrap').innerHTML = `<img src="${proofDocBase64}" style="width:100%;border-radius:8px;margin-top:10px;border:1px solid var(--line);">`;
    } catch (err) { toast(t('toastPhotoError'), 'error'); }
  });
  document.getElementById('resubmitSendBtn')?.addEventListener('click', async () => {
    const resubmitReason = document.getElementById('resubmitReasonArea').value.trim();
    try {
      await resubmitApplication(state.firebaseUser.uid, { resubmitReason, proofDoc: proofDocBase64 });
      proofDocBase64 = null;
      const udoc = await getUserDoc(state.firebaseUser.uid);
      state.userDoc = udoc;
      toast(t('resubmitSent'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Profil */
  document.getElementById('profileName')?.addEventListener('input', e => state.profileForm.name = e.target.value);
  document.getElementById('profilePhone')?.addEventListener('input', e => state.profileForm.phone = e.target.value);
  document.getElementById('profileSaveBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('profileName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    if (!name) { toast(t('toastEnterName'), 'error'); return; }
    try {
      await updateTeacherProfile(state.firebaseUser.uid, { fullName: name, phone });
      const udoc = await getUserDoc(state.firebaseUser.uid);
      state.userDoc = udoc;
      toast(t('profileSaved'), 'info');
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Obuna rejasini tanlash */
  document.getElementById('cancelSubBtn')?.addEventListener('click', async () => {
    if (!confirm(t('subCancelConfirm'))) return;
    try {
      await cancelSubscription(state.firebaseUser.uid);
      const udoc = await getUserDoc(state.firebaseUser.uid);
      state.userDoc = udoc;
      toast(t('subCancelled'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.querySelectorAll('[data-chooseplan]').forEach(el => el.addEventListener('click', async () => {
    try {
      await chooseSubscriptionPlan(state.firebaseUser.uid, el.dataset.chooseplan);
      const udoc = await getUserDoc(state.firebaseUser.uid);
      state.userDoc = udoc;
      toast(t('subChosenToast'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  }));
}
