import { describe, it, expect } from 'vitest';
import { monthlyGroupAverages, attendanceMonthly, topGrowers, studentMonthAverages } from '../src/lib/stats.js';
import { lineChartSVG } from '../src/lib/charts.js';

const gr = (value, day) => ({ subject: 'F', value, date: 1, day });

describe('guruh o\'rtachasi oylar bo\'yicha', () => {
  it('oylar tartibida, baho yo\'q oy chiqmaydi', () => {
    const students = [
      { grades: [gr(5, '2026-10-02'), gr(3, '2026-10-09'), gr(4, '2026-12-01')] },
      { grades: [gr(4, '2026-10-02')] }
    ];
    const r = monthlyGroupAverages(students);
    expect(r.map(x => x.key)).toEqual(['2026-10', '2026-12']);
    expect(r[0].value).toBe(4); // (5+3+4)/3
    expect(r[0].n).toBe(3);
    expect(r[1].value).toBe(4);
  });
  it('noto\'g\'ri baho va sanalar e\'tiborsiz', () => {
    expect(monthlyGroupAverages([{ grades: [gr(9, '2026-10-02'), gr(0, '2026-10-02')] }])).toEqual([]);
    expect(monthlyGroupAverages([{}])).toEqual([]);
  });
});

describe('davomat dinamikasi', () => {
  const att = [
    { date: '2026-10-02', records: { a: true, b: false, gone: true } },
    { date: '2026-10-09', records: { a: true, b: true } },
    { date: '2026-11-06', records: { a: false, b: false } },
    { date: 'bad', records: { a: true } }
  ];
  it('foiz oylar bo\'yicha; o\'chirilgan o\'quvchilar hisobga olinmaydi', () => {
    const r = attendanceMonthly(att, ['a', 'b']);
    expect(r).toEqual([{ key: '2026-10', value: 75, n: 4 }, { key: '2026-11', value: 0, n: 2 }]);
  });
  it('yangi o\'quv yili boshlangan sanadan oldingilari kirmaydi', () => {
    expect(attendanceMonthly(att, ['a', 'b'], '2026-11-01').map(x => x.key)).toEqual(['2026-11']);
    expect(attendanceMonthly([], ['a'])).toEqual([]);
  });
});

describe('eng ko\'p o\'sganlar', () => {
  const mk = (id, name, pairs) => ({ id, fullName: name, grades: pairs.map(([v, d]) => gr(v, d)) });
  const students = [
    mk('a', 'Aziz', [[3, '2026-10-02'], [5, '2026-12-02']]),   // +2
    mk('b', 'Bobur', [[4, '2026-10-02'], [5, '2026-11-02']]),   // +1
    mk('c', 'Carima', [[5, '2026-10-02'], [3, '2026-11-02']]),  // -2
    mk('d', 'Dilnoza', [[5, '2026-10-02'], [5, '2026-10-09']]), // bitta oy
    mk('e', 'Elbek', [[4, '2026-10-02'], [4, '2026-11-02']]),   // 0
    mk('f', 'Farid', [[3, '2026-10-02'], [4, '2026-11-02']])    // +1 (Bobur bilan teng — ism tartibi)
  ];
  it('o\'sish bo\'yicha kamayish tartibida; pasayganlar, o\'zgarmaganlar va bitta oylilar chiqmaydi', () => {
    const r = topGrowers(students);
    expect(r.map(x => x.student.id)).toEqual(['a', 'b', 'f']);
    expect(r[0]).toMatchObject({ from: 3, to: 5, delta: 2, fromKey: '2026-10', toKey: '2026-12' });
  });
  it('limit', () => {
    expect(topGrowers(students, 2).map(x => x.student.id)).toEqual(['a', 'b']);
  });
  it('studentMonthAverages', () => {
    expect(studentMonthAverages(students[0])).toEqual([{ key: '2026-10', value: 3 }, { key: '2026-12', value: 5 }]);
  });
});

describe('lineChartSVG', () => {
  const pts = [{ label: 'Okt 26', value: 4.2 }, { label: 'Noy 26', value: 3.5 }, { label: 'Dek 26', value: 4.8 }];
  it('bo\'sh ma\'lumotda bo\'sh satr', () => {
    expect(lineChartSVG({ points: [], yMin: 1, yMax: 5 })).toBe('');
    expect(lineChartSVG({ points: pts, yMin: 5, yMax: 5 })).toBe('');
  });
  it('chiziq, nuqtalar, yorliqlar va qiymatlar bor', () => {
    const svg = lineChartSVG({ points: pts, yMin: 1, yMax: 5, ticks: [1, 3, 5], label: 'Guruh' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<path');
    expect((svg.match(/<circle/g) || []).length).toBe(3);
    expect(svg).toContain('Okt 26');
    expect(svg).toContain('4.8');
    expect(svg).toContain('aria-label="Guruh"');
  });
  it('bitta nuqta — chiziqsiz', () => {
    const svg = lineChartSVG({ points: [pts[0]], yMin: 1, yMax: 5 });
    expect(svg).not.toContain('<path');
    expect(svg).toContain('<circle');
  });
  it('qiymat chegaradan chiqsa grafik ichida qoladi; NaN bo\'lmaydi', () => {
    const svg = lineChartSVG({ points: [{ label: 'a', value: 999 }, { label: 'b', value: -5 }], yMin: 0, yMax: 100, suffix: '%', decimals: 0 });
    expect(svg).not.toContain('NaN');
  });
  it('yorliqdagi HTML ekranlanadi', () => {
    const svg = lineChartSVG({ points: [{ label: '<img src=x onerror=alert(1)>', value: 3 }], yMin: 1, yMax: 5, label: '"><script>' });
    expect(svg).not.toContain('<img');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;img');
  });
});
