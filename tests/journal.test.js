import { describe, it, expect } from 'vitest';
import { buildJournalColumns, gradeKeyValue, moveSelection, planGradeWrite, planGradeClear, decideJournalKey, buildJournalSheet } from '../src/lib/journal.js';

const group = { weekdays: [1, 3] }; // dushanba, chorshanba
const gr = (value, day) => ({ subject: 'F', value, date: 1, day });

describe('buildJournalColumns', () => {
  it('2026-11 da dushanba/chorshanba kunlari', () => {
    const cols = buildJournalColumns(group, [], '2026-11');
    expect(cols.map(c => c.day.slice(8))).toEqual(['02', '04', '09', '11', '16', '18', '23', '25', '30']);
    expect(cols.every(c => !c.extra)).toBe(true);
  });
  it('dars kuni bo\'lmagan sana baho qo\'yilsa yoki qo\'shilsa "extra" bo\'lib chiqadi, tartiblanadi', () => {
    const students = [{ grades: [gr(5, '2026-11-03')] }];
    const cols = buildJournalColumns(group, students, '2026-11', ['2026-11-10', '2026-12-01']);
    const extra = cols.filter(c => c.extra).map(c => c.day);
    expect(extra).toEqual(['2026-11-03', '2026-11-10']);
    const days = cols.map(c => c.day);
    expect(days).toEqual([...days].sort());
  });
  it('dars kunlari belgilanmagan bo\'lsa — faqat qo\'shimcha sanalar', () => {
    expect(buildJournalColumns({}, [], '2026-11')).toEqual([]);
  });
});

describe('klaviatura: tez baho qo\'yish', () => {
  const cols = [{ day: '2026-11-02' }, { day: '2026-11-04' }, { day: '2026-11-09' }];
  const rows = ['a', 'b', 'c'];

  it('faqat 5/4/3/2 baho tugmalari', () => {
    expect(['5', '4', '3', '2'].map(gradeKeyValue)).toEqual([5, 4, 3, 2]);
    for (const k of ['1', '0', '6', '9', 'a', 'Enter', ' ']) expect(gradeKeyValue(k)).toBeNull();
  });
  it('strelkalar: chegarada to\'xtaydi, aylanmaydi', () => {
    const sel = { studentId: 'b', day: '2026-11-04' };
    expect(moveSelection(sel, 'ArrowRight', cols, rows)).toEqual({ studentId: 'b', day: '2026-11-09' });
    expect(moveSelection({ studentId: 'b', day: '2026-11-09' }, 'ArrowRight', cols, rows)).toEqual({ studentId: 'b', day: '2026-11-09' });
    expect(moveSelection(sel, 'ArrowLeft', cols, rows)).toEqual({ studentId: 'b', day: '2026-11-02' });
    expect(moveSelection(sel, 'ArrowDown', cols, rows)).toEqual({ studentId: 'c', day: '2026-11-04' });
    expect(moveSelection({ studentId: 'c', day: '2026-11-04' }, 'ArrowDown', cols, rows)).toEqual({ studentId: 'c', day: '2026-11-04' });
    expect(moveSelection(sel, 'ArrowUp', cols, rows)).toEqual({ studentId: 'a', day: '2026-11-04' });
    expect(moveSelection({ studentId: 'a', day: '2026-11-04' }, 'ArrowUp', cols, rows).studentId).toBe('a');
    expect(moveSelection(sel, 'Home', cols, rows).day).toBe('2026-11-02');
    expect(moveSelection(sel, 'End', cols, rows).day).toBe('2026-11-09');
  });
  it('tanlov yo\'q: birinchi o\'quvchi va bugungi ustun (yoki birinchisi)', () => {
    expect(moveSelection(null, 'ArrowDown', cols, rows, '2026-11-04')).toEqual({ studentId: 'a', day: '2026-11-04' });
    expect(moveSelection(null, 'ArrowDown', cols, rows, '2030-01-01')).toEqual({ studentId: 'a', day: '2026-11-02' });
    // oy almashganda eski tanlov yaroqsiz bo'lib qoladi
    expect(moveSelection({ studentId: 'zzz', day: '2026-10-05' }, 'ArrowRight', cols, rows)).toEqual({ studentId: 'a', day: '2026-11-02' });
    expect(moveSelection(null, 'ArrowDown', [], rows)).toBeNull();
    expect(moveSelection(null, 'ArrowDown', cols, [])).toBeNull();
  });
  it('planGradeWrite: 0 ta — qo\'shish, 1 ta — almashtirish, bir xil — hech narsa, 2+ — qo\'shish', () => {
    const day = '2026-11-02';
    expect(planGradeWrite({ grades: [] }, day, 5)).toEqual({ op: 'add' });
    const one = gr(4, day);
    expect(planGradeWrite({ grades: [one] }, day, 5)).toEqual({ op: 'replace', target: one });
    expect(planGradeWrite({ grades: [one] }, day, 4)).toEqual({ op: 'noop' });
    expect(planGradeWrite({ grades: [one, gr(3, day)] }, day, 5)).toEqual({ op: 'add' });
    expect(planGradeWrite({ grades: [gr(4, '2026-11-04')] }, day, 5)).toEqual({ op: 'add' }); // boshqa kun
  });
  it('planGradeClear: shu kundagi oxirgi baho', () => {
    const day = '2026-11-02';
    const a = gr(4, day), b = gr(3, day);
    expect(planGradeClear({ grades: [a, b] }, day)).toEqual({ op: 'remove', target: b });
    expect(planGradeClear({ grades: [] }, day)).toEqual({ op: 'noop' });
  });

  describe('decideJournalKey', () => {
    const base = { active: true, locked: false, cols, rowIds: rows, sel: { studentId: 'a', day: '2026-11-02' }, today: '2026-11-02' };
    const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...extra });

    it('baho, o\'chirish, oyna, bekor qilish', () => {
      expect(decideJournalKey(key('5'), base)).toEqual({ type: 'grade', value: 5 });
      expect(decideJournalKey(key('Delete'), base)).toEqual({ type: 'clear' });
      expect(decideJournalKey(key('Backspace'), base)).toEqual({ type: 'clear' });
      expect(decideJournalKey(key('Enter'), base)).toEqual({ type: 'open' });
      expect(decideJournalKey(key('Escape'), base)).toEqual({ type: 'deselect' });
      expect(decideJournalKey(key('ArrowRight'), base)).toEqual({ type: 'select', sel: { studentId: 'a', day: '2026-11-04' } });
    });
    it('Ctrl/Cmd/Alt bilan (masalan Ctrl+5 — brauzer tab) e\'tiborsiz', () => {
      expect(decideJournalKey(key('5', { ctrlKey: true }), base)).toBeNull();
      expect(decideJournalKey(key('4', { metaKey: true }), base)).toBeNull();
      expect(decideJournalKey(key('ArrowLeft', { altKey: true }), base)).toBeNull();
    });
    it('qulflangan guruhda (obuna tugagan) baho yozilmaydi, lekin yurish mumkin', () => {
      const locked = { ...base, locked: true };
      expect(decideJournalKey(key('5'), locked)).toBeNull();
      expect(decideJournalKey(key('Delete'), locked)).toBeNull();
      expect(decideJournalKey(key('ArrowDown'), locked).type).toBe('select');
    });
    it('tanlov yo\'q yoki yaroqsiz bo\'lsa baho yozilmaydi; jurnal faol bo\'lmasa hech narsa', () => {
      expect(decideJournalKey(key('5'), { ...base, sel: null })).toBeNull();
      expect(decideJournalKey(key('5'), { ...base, sel: { studentId: 'zzz', day: '2026-11-02' } })).toBeNull();
      expect(decideJournalKey(key('5'), { ...base, sel: { studentId: 'a', day: '2020-01-01' } })).toBeNull();
      expect(decideJournalKey(key('5'), { ...base, active: false })).toBeNull();
      expect(decideJournalKey(key('x'), base)).toBeNull();
    });
    it('tanlov yo\'q bo\'lsa strelkalar e\'tiborsiz (sahifa odatdagidek aylanadi); tanlash — katakni bosish bilan', () => {
      for (const k of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
        expect(decideJournalKey(key(k), { ...base, sel: null })).toBeNull();
        expect(decideJournalKey(key(k), { ...base, sel: { studentId: 'zzz', day: '2026-11-02' } })).toBeNull();
      }
    });
  });
});

describe('buildJournalSheet (Excel varag\'i)', () => {
  const labels = { num: '№', name: 'F.I.Sh', avg: 'Avg', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4', year: 'Yil', absent: 'Y', legend: 'LEGEND' };
  const cols = [{ day: '2026-11-02', extra: false }, { day: '2026-11-04', extra: false }, { day: '2026-11-05', extra: true }];
  const AY = { start: new Date(2026, 8, 1).getTime(), end: new Date(2027, 8, 1).getTime() };
  const students = [
    { id: 's2', fullName: 'Zafar', grades: [] , qGrades: { q1: 4 } },
    { id: 's1', fullName: 'Aziz', grades: [
      { subject: 'F', value: 5, date: new Date(2026, 10, 2).getTime(), period: 'm10', day: '2026-11-02' },
      { subject: 'F', value: 3, date: new Date(2026, 10, 2).getTime(), period: 'm10', day: '2026-11-02' },
      { subject: 'F', value: 4, date: new Date(2026, 10, 5).getTime(), period: 'm10', day: '2026-11-05' } ] }
  ];
  const attendanceByDay = { '2026-11-04': { records: { s1: false, s2: true } }, '2026-11-02': null };
  const aoa = buildJournalSheet({ students, month: '2026-11', cols, attendanceByDay, labels, ay: AY });

  it('sarlavha: sanalar dd.mm, qo\'shimcha sana "*" bilan, oxirida o\'rtacha va choraklar', () => {
    expect(aoa[0]).toEqual(['№', 'F.I.Sh', '02.11', '04.11', '05.11*', 'Avg', 'Q1', 'Q2', 'Q3', 'Q4', 'Yil']);
  });
  it('o\'quvchilar ism bo\'yicha tartiblanadi; bir kundagi baholar "/" bilan; kelmagan — belgi', () => {
    expect(aoa[1].slice(0, 5)).toEqual([1, 'Aziz', '5/3', 'Y', '4']);
    expect(aoa[2].slice(0, 5)).toEqual([2, 'Zafar', '', '', '']);
  });
  it('oylik o\'rtacha, qo\'lda va avtomatik chorak baholari', () => {
    expect(aoa[1][5]).toBe(4); // (5+3+4)/3
    expect(aoa[1][6]).toBe(4); // I chorak avto: noyabr — 1-chorak, o'rtacha 4
    expect(aoa[2][5]).toBe(''); // baho yo'q
    expect(aoa[2][6]).toBe(4);  // qo'lda qo'yilgan
  });
  it('oxirida bo\'sh qator va izoh', () => {
    expect(aoa[aoa.length - 2]).toEqual([]);
    expect(aoa[aoa.length - 1]).toEqual(['LEGEND']);
  });
});
