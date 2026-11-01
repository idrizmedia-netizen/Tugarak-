import { describe, it, expect, vi, beforeAll } from 'vitest';
import { h, resetMockState, makeAuthMock, makeDbMock, flush, press } from './helpers/mocks.js';

vi.mock('../src/firebase.js', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('../src/auth.js', async () => (await import('./helpers/mocks.js')).makeAuthMock());
vi.mock('../src/db.js', async () => (await import('./helpers/mocks.js')).makeDbMock());
// Faylni yuklab olish o'rniga ishchi kitobni ushlab qolamiz (jsdom'da yuklab olish yo'q).
vi.mock('xlsx', async (importOriginal) => {
  const real = await importOriginal();
  const lib = real.utils ? real : real.default;
  return { ...lib, default: lib, writeFile: (wb, name) => { globalThis.__xlsxOut = { wb, name }; } };
});

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const cell = (studentId, day) => $$('td.jcell[data-jcell]').find(x => x.dataset.jcell === studentId && x.dataset.jday === day);

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 31, 12, 0)); // 2026-10-31
  localStorage.clear();
  resetMockState();
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/main.js');
  await h.authCb({ uid: 'u1', email: 't@x.uz', emailVerified: true });
  await flush();
});

describe('jurnal va klaviatura bilan baholash', () => {
  it('jurnal chiziladi: dars kunlari (du/chor/juma) ustun, kalit maslahati ko\'rinadi', () => {
    expect($('table.journal')).not.toBeNull();
    const days = $$('th .jdate').map(b => b.dataset.jdatehead);
    expect(days).toContain('2026-10-02'); expect(days).toContain('2026-10-05'); expect(days).toContain('2026-10-07');
    expect(days).not.toContain('2026-10-06'); // seshanba
    expect($('.jkeyhint')).not.toBeNull();
  });

  it('tanlanmagan paytda strelka hech narsani o\'zgartirmaydi (sahifa odatdagidek aylanadi)', () => {
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect($$('td.jcell.sel')).toHaveLength(0);
  });

  it('katakni bosish tanlaydi; strelka siljitadi; sahifa qayta chizilmaydi', () => {
    const tableBefore = $('table.journal');
    cell('s1', '2026-10-02').click();
    expect(cell('s1', '2026-10-02').classList.contains('sel')).toBe(true);
    press('ArrowDown'); press('ArrowUp');
    expect(cell('s1', '2026-10-02').classList.contains('sel')).toBe(true);
    expect($$('td.jcell.sel')).toHaveLength(1);
    expect($('table.journal')).toBe(tableBefore); // DOM almashmagan
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('5 bosilganda baho yoziladi va tanlov saqlanib qoladi', async () => {
    press('5'); await flush();
    expect(h.calls.find(c => c[0] === 'addGrade')).toEqual(['addGrade', 's1', 'Shaxmat', 5, 'm9', '2026-10-02']);
    expect(cell('s1', '2026-10-02').textContent).toContain('5');
    expect(cell('s1', '2026-10-02').classList.contains('sel')).toBe(true);
  });

  it('yurib ketma-ket baholash: → 4, ↓ 3', async () => {
    press('ArrowRight'); press('4'); await flush();
    press('ArrowDown'); press('3'); await flush();
    const adds = h.calls.filter(c => c[0] === 'addGrade').map(c => [c[1], c[5], c[3]]);
    expect(adds).toEqual([['s1', '2026-10-02', 5], ['s1', '2026-10-05', 4], ['s2', '2026-10-05', 3]]);
  });

  it('mavjud bahoni almashtiradi (4 → 2), bir xil raqam hech narsa yozmaydi', async () => {
    press('ArrowUp'); // s1, 2026-10-05 (baho 4)
    h.calls.length = 0;
    press('4'); await flush();
    expect(h.calls).toEqual([]); // o'zgarmadi
    press('2'); await flush();
    const call = h.calls.find(c => c[0] === 'setStudentGrades');
    expect(call[1]).toBe('s1');
    expect(call[2].find(g => g.day === '2026-10-05').value).toBe(2);
    expect(call[2]).toHaveLength(2); // boshqa baho saqlangan
  });

  it('Delete oxirgi bahoni o\'chiradi; Esc tanlovni bekor qiladi', async () => {
    h.calls.length = 0;
    press('Delete'); await flush();
    const call = h.calls.find(c => c[0] === 'setStudentGrades');
    expect(call[2].map(g => g.day)).toEqual(['2026-10-02']);
    press('Escape');
    expect($$('td.jcell.sel')).toHaveLength(0);
  });

  it('input ichida yozayotganda raqamlar baho bo\'lib ketmaydi', async () => {
    cell('s1', '2026-10-02').click(); // tanlov
    const input = document.createElement('input'); document.body.appendChild(input);
    h.calls.length = 0;
    press('5', input); await flush();
    expect(h.calls).toEqual([]);
    input.remove();
  });

  it('Ctrl+5 va tanlovsiz raqam baho yozmaydi', async () => {
    h.calls.length = 0;
    press('5', document, { ctrlKey: true }); await flush();
    press('Escape'); press('5'); await flush();
    expect(h.calls).toEqual([]);
  });

  it('Enter tanlangan katak uchun baho oynasini ochadi', async () => {
    cell('s1', '2026-10-02').click(); press('Enter'); await flush();
    expect($('.modal-bg .jvalues')).not.toBeNull();
    $('#modalCancel').click(); await flush();
    expect($('.modal-bg')).toBeNull();
  });

  it('sichqoncha: bosish tanlaydi (oyna ochilmaydi), ikki marta bosish oynani ochadi', async () => {
    const c = cell('s2', '2026-10-09');
    c.click();
    expect(c.classList.contains('sel')).toBe(true);
    expect($('.modal-bg')).toBeNull();
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    expect($('.modal-bg .jvalues')).not.toBeNull();
    $('#modalCancel').click(); await flush();
  });
});

describe('chorak/yillik ustunlar', () => {
  it('"Σ Choraklar" tugmasi ustunlarni yoqadi (va eslab qoladi)', async () => {
    expect($$('th.jq')).toHaveLength(0);
    $('#jQToggle').click(); await flush();
    expect($$('th.jq')).toHaveLength(6); // oy o'rt. + 4 chorak + yil
    expect(localStorage.getItem('jShowQ')).toBe('1');
    const row = $$('table.journal tbody tr')[0];
    expect(row.querySelector('td.jqavg').textContent).toContain('5.0'); // s1 da faqat 02.10 dagi "5" qolgan (05.10 dagisi Delete bilan o'chirilgan)
  });

  it('chorak katagini bosish -> oyna -> qo\'lda baho saqlanadi', async () => {
    const q1 = $$('td[data-qcell][data-qkey="q1"]')[0];
    expect(q1.querySelector('.jqa')).not.toBeNull(); // avtomatik o'rtacha kulrang
    q1.click(); await flush();
    expect($('[data-qvalue="5"]')).not.toBeNull();
    $('[data-qvalue="5"]').click(); await flush();
    expect(h.calls.find(c => c[0] === 'setStudentQGrade')).toEqual(['setStudentQGrade', 's1', 'q1', 5]);
  });

  it('yoqilgan bo\'lsa qayta chizilgandan keyin ham saqlanadi', async () => {
    h.students[0].qGrades = { q1: 5 }; h.pushStudents(); await flush();
    expect($$('td[data-qkey="q1"]')[0].querySelector('.jqm').textContent).toBe('5');
  });
});

describe('ko\'rsatkichlar: grafiklar va eslatma', () => {
  beforeAll(async () => { $('[data-grouptab="stats"]').click(); await flush(); });

  it('uchta grafik bloki chiziladi (guruh o\'rtachasi — SVG)', () => {
    expect($$('.chart-card')).toHaveLength(3);
    expect($('.chart-card svg.chart-svg')).not.toBeNull();
  });

  it('muddati o\'tgan o\'quvchida "Eslatma" tugmasi bor, boshqasida yo\'q', () => {
    expect($$('[data-remind]').map(b => b.dataset.remind)).toEqual(['s1']);
  });

  it('eslatma oynasi tayyor matn bilan ochiladi; til almashganda matn yangilanadi', async () => {
    $('[data-remind="s1"]').click(); await flush();
    const ta = $('#prText');
    expect(ta.value).toContain('Aziz Aliyev');
    expect(ta.value).toContain('28.10.2026');
    expect(ta.value).toContain('3 kun');
    expect(ta.value).toContain('Dilnoza Karimova');
    const sel = $('#prLang'); sel.value = 'ru'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('#prText').value).toContain('просрочено');
  });

  it('Telegram tugmasi matnni to\'liq yuboradi; SMS havolasi sms: bilan boshlanadi', async () => {
    const open = vi.fn(); window.open = open;
    $('#prTelegram').click();
    const url = new URL(open.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://t.me/share/url');
    expect(url.searchParams.get('text')).toBe($('#prText').value);
    expect(open.mock.calls[0][2]).toContain('noopener');
    $('#modalCancel').click(); await flush();
  });
});

describe('ota-onalar uchun havola (o\'qituvchi tomoni)', () => {
  it('havola yaratiladi: kalit to\'g\'ri shaklda, hujjatda shaxsiy ma\'lumot yo\'q', async () => {
    $('[data-parentlink="s1"]').click(); await flush();
    expect($('#plCreate')).not.toBeNull();
    $('#plCreate').click(); await flush();
    const call = h.calls.find(c => c[0] === 'createParentLink');
    expect(call[1]).toBe('u1');
    expect(call[2]).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const json = JSON.stringify(call[3]);
    for (const secret of ['SECRETPHOTO', 'Yashirin', 'payDue', '5-A']) expect(json).not.toContain(secret);
    expect(call[3].studentName).toBe('Aziz Aliyev');
    expect(call[3].grades.length).toBeGreaterThan(0);
    // oynada havola va tugmalar paydo bo'ladi
    expect($('#plUrl').value).toBe(`${location.origin}/p/${call[2]}`);
    expect($('#plRefresh')).not.toBeNull(); expect($('#plDelete')).not.toBeNull();
  });

  it('havolani o\'chirish tasdiq so\'raydi', async () => {
    window.confirm = vi.fn(() => false);
    $('#plDelete').click(); await flush();
    expect(h.calls.some(c => c[0] === 'deleteParentLink')).toBe(false);
    window.confirm = vi.fn(() => true);
    $('#plDelete').click(); await flush();
    expect(h.calls.some(c => c[0] === 'deleteParentLink')).toBe(true);
    expect($('#plCreate')).not.toBeNull();
  });
});

describe('Excel eksport va havolalarni boshqarish', () => {
  it('Excel: asosiy varaq + ko\'rilayotgan oyning jurnali alohida varaqda', async () => {
    $('#modalCancel')?.click(); await flush();
    $('#reportsMenuBtn').click(); await flush();
    $('#excelExportBtn').click();
    for (let i = 0; i < 80 && !globalThis.__xlsxOut; i++) await new Promise(r => setTimeout(r, 50)); // xlsx dinamik yuklanadi
    expect(globalThis.__xlsxOut, 'writeFile chaqirilmadi: ' + ($('.toast')?.textContent || 'toast yo\'q')).toBeDefined();
    const { wb, name } = globalThis.__xlsxOut;
    expect(name).toBe('Shaxmat.xlsx');
    expect(wb.SheetNames).toEqual(['Shaxmat', 'Jurnal 2026-10']);
    const real = await vi.importActual('xlsx'); const lib = real.utils ? real : real.default;
    const rows = lib.utils.sheet_to_json(wb.Sheets['Jurnal 2026-10'], { header: 1 });
    const col = rows[0].indexOf('02.10');
    expect(col).toBeGreaterThan(1);
    expect(rows[1][1]).toBe('Aziz Aliyev');
    expect(String(rows[1][col])).toBe('5');
    expect(rows[2][1]).toBe('Bobur Bekov');
    // asosiy varaq avvalgidek
    const main = lib.utils.sheet_to_json(wb.Sheets['Shaxmat']);
    expect(main).toHaveLength(2);
    $('#modalCancel')?.click(); await flush();
  });

  it('"Ota-ona havolalarini yangilash" guruhdagi har bir havolani yangi surat bilan yozadi', async () => {
    h.links = [{ token: 'A'.repeat(32), studentId: 's1', groupId: 'g1' }, { token: 'B'.repeat(32), studentId: 'yoq-oquvchi', groupId: 'g1' }];
    h.calls.length = 0;
    $('#groupSettingsBtn').click(); await flush();
    $('#openSyncParentLinksBtn').click(); await flush(8);
    const upd = h.calls.filter(c => c[0] === 'updateParentLink');
    expect(upd).toHaveLength(1); // o'chirilgan o'quvchining havolasi o'tkazib yuboriladi
    expect(upd[0][1]).toBe('A'.repeat(32));
    expect(upd[0][2].studentName).toBe('Aziz Aliyev');
    expect(upd[0][2]).not.toHaveProperty('photo');
  });

  it('o\'quvchi o\'chirilganda uning ommaviy havolasi ham o\'chiriladi (avval havola, keyin o\'quvchi)', async () => {
    const db = await import('../src/db.js');
    window.confirm = vi.fn(() => true);
    h.calls.length = 0;
    $('[data-delstudent="s2"]').click(); await flush(8);
    expect(h.calls).toContainEqual(['deleteParentLinksForStudent', 'g1', 's2']);
    expect(db.deleteStudent).toHaveBeenCalledWith('s2');
    const linkOrder = db.deleteParentLinksForStudent.mock.invocationCallOrder[0];
    expect(linkOrder).toBeLessThan(db.deleteStudent.mock.invocationCallOrder[0]);
  });
});
