import { describe, it, expect } from 'vitest';
import { sanitizeGrades, gradeDay, studentAvg, quarterBuckets, qGradesOf, quarterSummary, monthAverage, academicYearRange } from '../src/lib/grades.js';
import { quarterOfMonth, monthIndexOf, monthKeyTitle } from '../src/lib/months.js';

const AY = { start: new Date(2026, 8, 1).getTime(), end: new Date(2027, 8, 1).getTime() };
const g = (value, y, m, d, period) => ({ subject: 'Fan', value, date: new Date(y, m - 1, d).getTime(), period, day: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });

describe('sanitizeGrades', () => {
  it('to\'g\'ri bahoni qabul qiladi, sanani saqlaydi', () => {
    const out = sanitizeGrades([{ subject: ' Matem ', value: 5, date: 123, period: 'm9', day: '2026-10-05' }]);
    expect(out).toEqual([{ subject: 'Matem', value: 5, date: 123, period: 'm9', day: '2026-10-05' }]);
  });
  it('noto\'g\'ri qiymat yoki bo\'sh fan — xato', () => {
    expect(() => sanitizeGrades([{ subject: 'A', value: 6 }])).toThrow();
    expect(() => sanitizeGrades([{ subject: 'A', value: 0 }])).toThrow();
    expect(() => sanitizeGrades([{ subject: 'A', value: 4.5 }])).toThrow();
    expect(() => sanitizeGrades([{ subject: '  ', value: 4 }])).toThrow();
  });
  it('yaroqsiz "day" tashlab yuboriladi; ko\'pi bilan 300 ta', () => {
    expect(sanitizeGrades([{ subject: 'A', value: 3, date: 1, day: 'bad' }])[0]).not.toHaveProperty('day');
    const many = Array.from({ length: 350 }, () => ({ subject: 'A', value: 3, date: 1 }));
    expect(sanitizeGrades(many)).toHaveLength(300);
  });
});

describe('oy va chorak', () => {
  it('quarterOfMonth: yangi "mN" va eski oy nomlari', () => {
    expect(quarterOfMonth('m8')).toBe(1);   // sentabr
    expect(quarterOfMonth('m0')).toBe(2);   // yanvar
    expect(quarterOfMonth('m3')).toBe(3);   // aprel
    expect(quarterOfMonth('m6')).toBe(4);   // iyul
    expect(quarterOfMonth('Oktabr')).toBe(1);
    expect(quarterOfMonth('Декабрь')).toBe(2);
    expect(quarterOfMonth('May')).toBe(3);
    expect(quarterOfMonth('m12')).toBeNull();
    expect(quarterOfMonth('xyz')).toBeNull();
    expect(monthIndexOf('m11')).toBe(11);
  });
  it('monthKeyTitle', () => {
    expect(monthKeyTitle('uz', '2026-10')).toBe('Oktabr 2026');
    expect(monthKeyTitle('en', '2026-10')).toBe('October 2026');
    expect(monthKeyTitle('uz', 'bad')).toBe('');
  });
  it('academicYearRange: sentabrdan boshlanadi', () => {
    const r = academicYearRange(new Date(2026, 9, 31));
    expect(r.start).toBe(new Date(2026, 8, 1).getTime());
    expect(r.end).toBe(new Date(2027, 8, 1).getTime());
    expect(academicYearRange(new Date(2027, 2, 1)).start).toBe(new Date(2026, 8, 1).getTime());
  });
});

describe('chorak/yillik baholar', () => {
  const s = { grades: [g(5, 2026, 10, 5, 'm9'), g(3, 2026, 10, 12, 'm9'), g(4, 2026, 12, 8, 'm11'), g(5, 2025, 10, 1, 'm9')] };

  it('quarterBuckets: o\'tgan o\'quv yili baholari kirmaydi', () => {
    const b = quarterBuckets(s, AY);
    expect(b[1]).toEqual([5, 3]);
    expect(b[2]).toEqual([4]);
    expect(b[3]).toEqual([]);
  });
  it('quarterSummary: qo\'lda baho avtomatik o\'rtachadan alohida saqlanadi', () => {
    const q = quarterSummary({ ...s, qGrades: { q1: 5 } }, AY);
    expect(q.q1).toEqual({ manual: 5, auto: 4 });
    expect(q.q2).toEqual({ manual: null, auto: 4 });
    expect(q.q3).toEqual({ manual: null, auto: null });
    expect(q.year.auto).toBeCloseTo(4, 5);
  });
  it('qGradesOf: faqat 1..5 butun sonlar va ma\'lum kalitlar', () => {
    expect(qGradesOf({ qGrades: { q1: 5, q2: 7, q3: '4', q4: 2.5, year: 3, evil: 5 } })).toEqual({ q1: 5, year: 3 });
    expect(qGradesOf({})).toEqual({});
    expect(qGradesOf(null)).toEqual({});
    expect(qGradesOf({ qGrades: 'x' })).toEqual({});
  });
  it('monthAverage va gradeDay', () => {
    expect(monthAverage(s, '2026-10')).toBe(4);
    expect(monthAverage(s, '2026-11')).toBeNull();
    expect(gradeDay({ date: new Date(2026, 3, 9).getTime() })).toBe('2026-04-09'); // eski baho: day yo'q
    expect(studentAvg({ grades: [{ value: 5 }, { value: 4 }, { value: 9 }] })).toBe(4.5);
  });
});
