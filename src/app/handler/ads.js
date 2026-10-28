import { t } from '../../i18n.js';
import { addAd, deleteAd, updateAd } from '../../db.js';
import { fileToCompressedBase64, friendlyError, toast } from '../util.js';
import { render } from '../render.js';

export function attachAdsHandlers() {

  /* Reklama (admin) */
  let selectedAdImageBase64 = null;
  document.getElementById('adImageDropZone')?.addEventListener('click', () => document.getElementById('adImageInput').click());
  document.getElementById('adImageInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      selectedAdImageBase64 = await fileToCompressedBase64(file, 640, 0.7);
      document.getElementById('adImagePreviewWrap').innerHTML = `<img src="${selectedAdImageBase64}" style="width:100%;max-width:260px;border-radius:8px;margin-top:10px;border:1px solid var(--line);">`;
    } catch (err) { toast(t('toastPhotoError'), 'error'); }
  });
  document.getElementById('saveAdBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('adTitle').value.trim();
    const text = document.getElementById('adText').value.trim();
    if (!title && !text) { toast(t('toastFillAllFields'), 'error'); return; }
    const data = {
      enabled: true,
      title,
      text,
      link: document.getElementById('adLink').value.trim(),
      startDate: document.getElementById('adStartDate').value || null,
      endDate: document.getElementById('adEndDate').value || null,
      image: selectedAdImageBase64 || null,
    };
    try {
      await addAd(data);
      selectedAdImageBase64 = null;
      document.getElementById('adTitle').value = '';
      document.getElementById('adText').value = '';
      document.getElementById('adLink').value = '';
      document.getElementById('adEndDate').value = '';
      document.getElementById('adImagePreviewWrap').innerHTML = '';
      toast(t('adsSaved'), 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });
  document.querySelectorAll('[data-toggle-ad]').forEach(el => el.addEventListener('change', async () => {
    try { await updateAd(el.dataset.toggleAd, { enabled: el.checked }); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));
  document.querySelectorAll('[data-delad]').forEach(el => el.addEventListener('click', async () => {
    try { await deleteAd(el.dataset.delad); toast(t('docDeleted'), 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }));
}
