import { describe, it, expect } from 'vitest';
import { DICT, tl } from '../src/i18n.js';

const placeholders = (s) => [...String(s).matchAll(/\{([a-zA-Z]+)\}/g)].map(m => m[1]).sort().join(',');

describe('tarjimalar', () => {
  const uz = Object.keys(DICT.uz);
  it('uz, ru, en kalitlari to\'liq mos', () => {
    expect(Object.keys(DICT.ru).filter(k => !(k in DICT.uz))).toEqual([]);
    expect(Object.keys(DICT.en).filter(k => !(k in DICT.uz))).toEqual([]);
    expect(uz.filter(k => !(k in DICT.ru))).toEqual([]);
    expect(uz.filter(k => !(k in DICT.en))).toEqual([]);
  });
  it('har bir kalitda {o\'rin} belgilari uch tilda bir xil', () => {
    const bad = uz.filter(k => placeholders(DICT.uz[k]) !== placeholders(DICT.ru[k]) || placeholders(DICT.uz[k]) !== placeholders(DICT.en[k]));
    expect(bad).toEqual([]);
  });
  it('bo\'sh tarjima yo\'q', () => {
    for (const l of ['uz', 'ru', 'en']) {
      expect(Object.entries(DICT[l]).filter(([, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k)).toEqual([]);
    }
  });
  it('tl: o\'rin belgilari almashadi; maxsus belgilar buzmaydi; tarjima yo\'q bo\'lsa uz yoki kalit', () => {
    expect(tl('uz', 'remindFee', { fee: '1 000' })).toContain('1 000');
    expect(tl('en', 'remindFee', { fee: '$&' })).toContain('$&');
    expect(tl('xx', 'remindThanks')).toBe(DICT.uz.remindThanks);
    expect(tl('uz', 'bunday_kalit_yoq')).toBe('bunday_kalit_yoq');
  });
});
