import { describe, it, expect } from 'vitest';
import { newParentToken, parentTokenFromPath, parentUrl, buildParentSnapshot, sanitizeParentData, PARENT_TOKEN_RE } from '../src/lib/parentLink.js';
import { parentPageHTML } from '../src/lib/parentView.js';
import { t, tl } from '../src/i18n.js';

const group = { id: 'g1', name: 'Shaxmat', subject: 'Shaxmat', fee: 150000, teacherId: 'T' };
const student = {
  id: 's1', groupId: 'g1', fullName: 'Ali Valiyev', className: '5-A',
  // Ota-onaga ko'rinmasligi KERAK bo'lgan maydonlar:
  photo: 'data:image/png;base64,SECRETPHOTO', birthDate: '2015-01-01', address: 'Yashirin manzil 12',
  payDue: '2026-10-01', paidThrough: '2026-09-30', payHistory: [{ amount: 1 }], archive: [{ year: '2025' }], parentPhone: '+998901234567',
  grades: [
    { subject: 'F', value: 5, date: 1, day: '2026-10-05' },
    { subject: 'F', value: 4, date: 1, day: '2026-10-12' },
    { subject: 'F', value: 9, date: 1, day: '2026-10-13' } // yaroqsiz
  ],
  qGrades: { q1: 5, evil: 5 }
};
const attendance = [
  { date: '2026-10-05', records: { s1: true, s2: false } },
  { date: '2026-10-12', records: { s1: false } },
  { date: '2026-10-19', records: { s2: true } } // s1 yo'q
];

describe('havola kaliti', () => {
  it('tasodifiy, 32 belgi, base64url, takrorlanmaydi', () => {
    const a = newParentToken(), b = newParentToken();
    expect(a).toMatch(PARENT_TOKEN_RE);
    expect(a).toHaveLength(32);
    expect(a).not.toBe(b);
    const many = new Set(Array.from({ length: 200 }, () => newParentToken()));
    expect(many.size).toBe(200);
  });
  it('yo\'ldan kalitni faqat to\'g\'ri shaklda oladi', () => {
    const tok = newParentToken();
    expect(parentTokenFromPath(`/p/${tok}`)).toBe(tok);
    expect(parentTokenFromPath(`/p/${tok}/`)).toBe(tok);
    expect(parentTokenFromPath('/p/short')).toBeNull();
    expect(parentTokenFromPath(`/x/${tok}`)).toBeNull();
    expect(parentTokenFromPath(`/p/${tok}/extra`)).toBeNull();
    expect(parentTokenFromPath(`/p/${tok}%20`)).toBeNull();
    expect(parentTokenFromPath('/')).toBeNull();
    expect(parentTokenFromPath(undefined)).toBeNull();
    expect(parentUrl('https://app.test', tok)).toBe(`https://app.test/p/${tok}`);
  });
});

describe('buildParentSnapshot — shaxsiy ma\'lumot sizib chiqmasligi', () => {
  const snap = buildParentSnapshot({ group, student, attendance });
  it('faqat ruxsat etilgan maydonlar', () => {
    expect(Object.keys(snap).sort()).toEqual(['attendance', 'grades', 'groupId', 'groupName', 'qGrades', 'studentId', 'studentName', 'subject']);
  });
  it('rasm, tug\'ilgan kun, manzil, telefon, to\'lov — JSON\'da umuman yo\'q', () => {
    const json = JSON.stringify(snap);
    for (const secret of ['SECRETPHOTO', '2015-01-01', 'Yashirin', '998901234567', 'payHistory', 'paidThrough', 'archive', '150000', '5-A']) {
      expect(json).not.toContain(secret);
    }
  });
  it('baholar tozalanadi, davomat faqat shu o\'quvchi uchun, qGrades filtrlanadi', () => {
    expect(snap.grades).toEqual([{ day: '2026-10-05', value: 5 }, { day: '2026-10-12', value: 4 }]);
    expect(snap.attendance).toEqual({ '2026-10-05': true, '2026-10-12': false });
    expect(snap.qGrades).toEqual({ q1: 5 });
    expect(snap.studentName).toBe('Ali Valiyev');
  });
  it('davomat 400 ta bilan cheklanadi (eng yangilari qoladi)', () => {
    const many = Array.from({ length: 450 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, records: { s1: true } }));
    // 450 yozuv, lekin sanalar takrorlanadi — kalitlar soni 28 dan oshmaydi
    expect(Object.keys(buildParentSnapshot({ group, student, attendance: many }).attendance).length).toBeLessThanOrEqual(400);
  });
});

describe('sanitizeParentData va sahifa', () => {
  it('buzuq/zararli hujjatni xavfsiz ko\'rinishga keltiradi', () => {
    const d = sanitizeParentData({
      studentName: 'X', grades: [{ day: '2026-10-05', value: 5 }, { day: '<b>', value: 5 }, { day: '2026-10-06', value: 77 }, null],
      attendance: { '2026-10-05': true, '2026-10-06': 'ha', bad: true }, qGrades: { q1: 9, q2: 4 }, updatedAt: { toMillis: () => 1000 }
    });
    expect(d.grades).toEqual([{ day: '2026-10-05', value: 5 }]);
    expect(d.attendance).toEqual([{ date: '2026-10-05', present: true }]);
    expect(d.qGrades).toEqual({ q2: 4 });
    expect(d.updatedAtMs).toBe(1000);
    expect(sanitizeParentData(null).grades).toEqual([]);
  });

  const data = { studentName: 'Ali <script>alert(1)</script>', groupName: 'G"><img src=x onerror=alert(2)>', subject: 'S',
    grades: [{ day: '2026-10-05', value: 5 }, { day: '2026-10-12', value: 4 }, { day: '2026-11-02', value: 3 }],
    attendance: { '2026-10-05': true, '2026-10-12': false }, qGrades: { q1: 5, year: 4 }, updatedAt: { toMillis: () => new Date(2026, 9, 31).getTime() } };

  it('XSS: ism va guruh nomidagi HTML DOM\'ga teg bo\'lib tushmaydi', () => {
    const host = document.createElement('div');
    host.innerHTML = parentPageHTML({ status: 'ok', data }, { t, lang: 'uz' });
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('Ali <script>alert(1)</script>');
  });
  it('ma\'lumotlar ko\'rinadi: o\'rtacha, davomat foizi, oylar, chorak baholari, kelmagan kun', () => {
    const host = document.createElement('div');
    host.innerHTML = parentPageHTML({ status: 'ok', data }, { t, lang: 'uz' });
    const text = host.textContent;
    expect(text).toContain('4.00');            // (5+4+3)/3
    expect(text).toContain('50%');             // 1/2 davomat
    expect(text).toContain('Oktabr 2026');
    expect(text).toContain('Noyabr 2026');
    expect(text).toContain('12.10');           // kelmagan kun
    expect(text).toContain('31.10.2026');      // yangilangan sana
    expect(host.querySelectorAll('.parent-month')).toHaveLength(2);
  });
  it('holatlar: yuklanmoqda, topilmadi, xato — ma\'lumotsiz', () => {
    const h = (status) => { const el = document.createElement('div'); el.innerHTML = parentPageHTML({ status, data: null }, { t, lang: 'uz' }); return el; };
    expect(h('loading').querySelector('.spinner')).not.toBeNull();
    expect(h('notfound').textContent).toContain('Havola topilmadi');
    expect(h('error').textContent).toContain('Yuklab bo\'lmadi');
  });
  it('bo\'sh hujjat (baho va davomat yo\'q) sahifani buzmaydi', () => {
    const el = document.createElement('div');
    el.innerHTML = parentPageHTML({ status: 'ok', data: { studentName: 'Bola', groupName: 'G' } }, { t: (k, v) => tl('ru', k, v), lang: 'ru' });
    expect(el.textContent).toContain('Оценок пока нет');
    expect(el.textContent).toContain('Bola');
  });
});
