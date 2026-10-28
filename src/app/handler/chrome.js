import { setLang } from '../../i18n.js';
import { logout } from '../../auth.js';
import { rt, state } from '../state.js';
import { render } from '../render.js';
import { loadAdminDataOnce } from '../session.js';

export function attachChromeHandlers() {
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    render();
  });
  document.getElementById('installBtn')?.addEventListener('click', async () => {
    if (!rt.deferredInstallPrompt) return;
    rt.deferredInstallPrompt.prompt();
    await rt.deferredInstallPrompt.userChoice;
    rt.deferredInstallPrompt = null;
    render();
  });
  document.querySelectorAll('[data-lang]').forEach(el => el.addEventListener('click', () => {
    setLang(el.dataset.lang); render();
  }));
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await logout();
    state.view = 'landing'; state.activeGroupId = null; state.pendingRegisterContract = false;
  });
  document.getElementById('notifBell')?.addEventListener('click', () => {
    localStorage.setItem('notif-seenCount', String(state.notifications.length));
    state.modal = { type: 'notifications' };
    render();
  });
  document.getElementById('profileBtn')?.addEventListener('click', () => {
    if (state.role !== 'teacher') return;
    state.profileForm = { name: state.userDoc?.fullName || '', phone: state.userDoc?.phone || '' };
    state.modal = { type: 'profile' };
    render();
  });
  document.querySelectorAll('[data-navto]').forEach(el => el.addEventListener('click', () => {
    state.view = el.dataset.navto; render();
    if (state.role === 'admin' && (state.view === 'adminDash' || state.view === 'adminReports')) loadAdminDataOnce(false);
  }));
  document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => { state.view = el.dataset.goto; render(); }));
  document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => { state.authTab = el.dataset.tab; render(); }));
}
