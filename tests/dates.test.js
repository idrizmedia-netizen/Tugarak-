import { describe, it, expect } from 'vitest';
import { parseYMD, daysBetween, addMonthKeepDay, nextDueFromDay, validPayDay, fmtDMY, isoWeekday, daysInMonth, localDateStr } from '../src/lib/dates.js';

describe('sana yordamchilari', () => {
  it('parseYMD faqat YYYY-MM-DD ni qabul qiladi', () => {
    expect(parseYMD('2026-10-31')).toEqual({ y: 2026, m: 10, d: 31 });
    expect(parseYMD('31.10.2026')).toBeNull();
    expect(parseYMD('')).toBeNull();
    expect(parseYMD(undefined)).toBeNull();
  });
  it('daysBetween: oy va yil chegarasidan o\'tadi, kabisa yilini hisobga oladi', () => {
    expect(daysBetween('2026-10-31', '2026-11-03')).toBe(3);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2); // 2028 — kabisa yili
    expect(daysBetween('2026-10-31', '2026-10-28')).toBe(-3);
    expect(daysBetween('x', '2026-10-31')).toBeNull();
  });
  it('localDateStr mahalliy sanani beradi (UTC emas)', () => {
    expect(localDateStr(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(localDateStr(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
  it('addMonthKeepDay: qisqa oyda oxirgi kunga tushadi, keyingi oyda kun qaytadi', () => {
    expect(addMonthKeepDay('2026-01-31', 31)).toBe('2026-02-28');
    expect(addMonthKeepDay('2026-02-28', 31)).toBe('2026-03-31');
    expect(addMonthKeepDay('2026-12-15', 15)).toBe('2027-01-15');
  });
  it('nextDueFromDay: bugungi kun ham hisoblanadi', () => {
    expect(nextDueFromDay(15, '2026-10-10')).toBe('2026-10-15');
    expect(nextDueFromDay(10, '2026-10-10')).toBe('2026-10-10');
    expect(nextDueFromDay(5, '2026-10-10')).toBe('2026-11-05');
    expect(nextDueFromDay(31, '2026-11-10')).toBe('2026-11-30');
  });
  it('validPayDay 1..31 butun son', () => {
    expect(validPayDay('15')).toBe(15);
    expect(validPayDay(0)).toBeNull();
    expect(validPayDay(32)).toBeNull();
    expect(validPayDay(1.5)).toBeNull();
    expect(validPayDay('abc')).toBeNull();
  });
  it('fmtDMY, isoWeekday, daysInMonth', () => {
    expect(fmtDMY('2026-10-05')).toBe('05.10.2026');
    expect(fmtDMY('bad')).toBe('');
    expect(isoWeekday(2026, 10, 31)).toBe(6); // shanba
    expect(isoWeekday(2026, 11, 1)).toBe(7);  // yakshanba
    expect(isoWeekday(2026, 11, 2)).toBe(1);  // dushanba
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });
});
