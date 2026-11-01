import { describe, it, expect } from 'vitest';
import { payStatus, reminderText, telegramShareUrl, smsUrl, PAY_WARN_DAYS } from '../src/lib/pay.js';

const TODAY = '2026-10-31';

describe('payStatus', () => {
  it('muddat belgilanmagan — none', () => {
    expect(payStatus({}, TODAY)).toEqual({ kind: 'none' });
    expect(payStatus({ payDue: 'xato' }, TODAY)).toEqual({ kind: 'none' });
  });
  it('muddati o\'tgan — overdue, necha kun', () => {
    expect(payStatus({ payDue: '2026-10-28' }, TODAY)).toEqual({ kind: 'overdue', days: 3 });
  });
  it('bugun va yaqin kunlar — soon; uzoq — ok', () => {
    expect(payStatus({ payDue: TODAY }, TODAY)).toEqual({ kind: 'soon', days: 0 });
    expect(payStatus({ payDue: '2026-11-03' }, TODAY).kind).toBe('soon');
    expect(PAY_WARN_DAYS).toBe(3);
    expect(payStatus({ payDue: '2026-11-04' }, TODAY).kind).toBe('ok');
  });
  it('to\'langan (paidThrough bugundan kam emas) — paid, overdue ustidan ustun', () => {
    expect(payStatus({ payDue: '2026-10-01', paidThrough: '2026-11-15' }, TODAY)).toEqual({ kind: 'paid', until: '2026-11-15' });
    expect(payStatus({ payDue: '2026-10-01', paidThrough: '2026-10-30' }, TODAY).kind).toBe('overdue');
  });
});

describe('reminderText (to\'lov eslatmasi)', () => {
  const group = { name: 'Shaxmat', fee: 150000 };
  const student = { fullName: 'Ali Valiyev', payDue: '2026-10-28' };

  it('muddati o\'tgan: ism, guruh, sana, kun, summa va imzo bor', () => {
    const msg = reminderText({ lang: 'uz', student, group, teacherName: 'Dilnoza', today: TODAY });
    expect(msg).toContain('Ali Valiyev');
    expect(msg).toContain('Shaxmat');
    expect(msg).toContain('28.10.2026');
    expect(msg).toContain('3 kun');
    expect(msg).toMatch(/150[\s\u00a0]000/);
    expect(msg).toContain('Dilnoza');
  });
  it('har uch tilda ishlaydi va placeholder qolib ketmaydi', () => {
    for (const lang of ['uz', 'ru', 'en']) {
      const msg = reminderText({ lang, student, group, teacherName: 'T', today: TODAY });
      expect(msg.length).toBeGreaterThan(40);
      expect(msg).not.toMatch(/\{[a-z]+\}/);
    }
    expect(reminderText({ lang: 'ru', student, group, today: TODAY })).toContain('просрочено');
    expect(reminderText({ lang: 'en', student, group, today: TODAY })).toContain('overdue');
  });
  it('bugun muddat — "bugun" matni; yaqin kunda — "kundan keyin"', () => {
    const today = reminderText({ lang: 'uz', student: { ...student, payDue: TODAY }, group, today: TODAY });
    expect(today).toContain('bugun');
    const soon = reminderText({ lang: 'uz', student: { ...student, payDue: '2026-11-02' }, group, today: TODAY });
    expect(soon).toContain('2 kundan keyin');
  });
  it('summa belgilanmagan bo\'lsa summa gapi chiqmaydi; muddat yo\'q bo\'lsa matn bo\'sh', () => {
    expect(reminderText({ lang: 'uz', student, group: { name: 'X' }, today: TODAY })).not.toContain('summasi');
    expect(reminderText({ lang: 'uz', student: { fullName: 'A' }, group, today: TODAY })).toBe('');
  });
  it('ism ichidagi "$&" kabi belgilar matnni buzmaydi', () => {
    const msg = reminderText({ lang: 'uz', student: { ...student, fullName: "A$&B$1" }, group, today: TODAY });
    expect(msg).toContain('A$&B$1');
  });
});

describe('ulashish havolalari', () => {
  const text = 'Salom & "xayr"?\nIkkinchi qator #1';
  it('Telegram va SMS matni to\'liq kodlanadi', () => {
    const tg = telegramShareUrl(text);
    expect(tg.startsWith('https://t.me/share/url?url=')).toBe(true);
    expect(new URL(tg).searchParams.get('text')).toBe(text);
    const sms = smsUrl(text);
    expect(sms.startsWith('sms:')).toBe(true);
    expect(decodeURIComponent(sms.split('body=')[1])).toBe(text);
  });
});
