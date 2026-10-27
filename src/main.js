import './styles.css';
import './firebase.js'; // Firebase ilovasini (va App Check'ni) ishga tushiradi
import { handleRedirectResult } from './auth.js';
import { rt } from './app/state.js';
import { render } from './app/render.js';
import { startAuthWatcher } from './app/session.js';
import { friendlyError, toast } from './app/util.js';

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  rt.deferredInstallPrompt = e;
  render();
});
window.addEventListener('appinstalled', () => { rt.deferredInstallPrompt = null; render(); });
startAuthWatcher();
render();
handleRedirectResult().catch(err => toast(friendlyError(err), 'error'));
setInterval(() => {
  const track = document.getElementById('adBannerTrack');
  if (!track || track.children.length <= 1) return;
  rt.adCarouselIndex = (rt.adCarouselIndex + 1) % track.children.length;
  track.style.transform = `translateX(-${rt.adCarouselIndex * 100}%)`;
  document.querySelectorAll('.ad-dot').forEach((d, i) => d.classList.toggle('active', i === rt.adCarouselIndex));
}, 6000);
