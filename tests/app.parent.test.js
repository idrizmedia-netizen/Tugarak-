import { describe, it, expect, vi, beforeAll } from 'vitest';
import { h, resetMockState, flush } from './helpers/mocks.js';
import { newParentToken } from '../src/lib/parentLink.js';

vi.mock('../src/firebase.js', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('../src/auth.js', async () => (await import('./helpers/mocks.js')).makeAuthMock());
vi.mock('../src/db.js', async () => (await import('./helpers/mocks.js')).makeDbMock());

const TOKEN = newParentToken();

describe('ota-ona sahifasi (/p/<kalit>)', () => {
  beforeAll(async () => {
    resetMockState();
    window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    history.pushState({}, '', `/p/${TOKEN}`);
    h.parentDoc = {
      studentName: 'Ali Valiyev', groupName: 'Shaxmat', subject: 'Shaxmat',
      grades: [{ day: '2026-10-05', value: 5 }, { day: '2026-10-12', value: 4 }],
      attendance: { '2026-10-05': true, '2026-10-12': false }, qGrades: { q1: 5 },
      updatedAt: { toMillis: () => new Date(2026, 9, 31).getTime() }
    };
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/main.js');
    await flush();
  });

  it('kirishsiz ochiladi: kalit bo\'yicha FAQAT bitta hujjat so\'raladi, ro\'yxat so\'ralmaydi', async () => {
    const { getParentLinkPublic, getGroupParentLinks } = await import('../src/db.js');
    expect(getParentLinkPublic).toHaveBeenCalledTimes(1);
    expect(getParentLinkPublic).toHaveBeenCalledWith(TOKEN);
    expect(getGroupParentLinks).not.toHaveBeenCalled();
  });

  it('o\'quvchi, baholar va davomat ko\'rinadi; o\'qituvchi paneli va kirish formasi yo\'q', () => {
    const page = document.querySelector('.parent-page');
    expect(page).not.toBeNull();
    expect(page.textContent).toContain('Ali Valiyev');
    expect(page.textContent).toContain('4.50');
    expect(page.textContent).toContain('50%');
    expect(document.querySelector('table.journal')).toBeNull();
    expect(document.querySelector('#loginBtn, #email, .auth-card')).toBeNull();
  });

  it('o\'qituvchi tizimga kirgan bo\'lsa ham (watchAuth) ota-ona sahifasi o\'zgarmaydi; qidiruv tizimlariga yopiq', async () => {
    await h.authCb?.({ uid: 'u1', email: 't@x.uz' });
    await flush();
    expect(document.querySelector('.parent-page')).not.toBeNull();
    expect(document.querySelector('meta[name="robots"]').content).toContain('noindex');
  });
});

describe('ota-ona sahifasi: topilmadi', () => {
  it('hujjat yo\'q bo\'lsa "Havola topilmadi"', async () => {
    vi.resetModules();
    h.parentDoc = null;
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/main.js');
    await flush();
    expect(document.body.textContent).toContain('Havola topilmadi');
  });
});
