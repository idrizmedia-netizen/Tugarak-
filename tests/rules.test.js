import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Emulyatorsiz yengil tekshiruv: kod yozadigan maydonlar qoidalarda ruxsat etilganmi.
   (Oldin qoidalar fayli eskirib qolgani sababli dars kunlari, to'lov va arxiv saqlanmay qolgan edi.) */
const rules = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules'), 'utf8');
const block = (startMarker) => {
  const i = rules.indexOf(startMarker);
  expect(i, startMarker + ' topilmadi').toBeGreaterThan(-1);
  return rules.slice(i, i + 2500);
};

describe('firestore.rules qamrovi', () => {
  it('guruh yangilanishida dars kunlari va to\'lov sozlamalari ruxsat etilgan', () => {
    const b = block('match /groups/{groupId}');
    for (const f of ['weekdays', 'fee', 'payDay', 'yearStart', 'coTeacherInfo']) expect(b).toContain(`'${f}'`);
  });
  it('o\'quvchi yangilanishida to\'lov, arxiv va chorak baholari ruxsat etilgan', () => {
    const b = block('function validStudentUpdate()');
    for (const f of ['payDue', 'payDay', 'paidThrough', 'payHistory', 'archive', 'qGrades']) expect(b).toContain(`'${f}'`);
  });
  it('yangi o\'quvchi to\'lov muddati bilan yaratilishi mumkin', () => {
    const b = block('function validNewStudent()');
    expect(b).toContain("'payDue'"); expect(b).toContain("'payDay'");
  });
  it('emailVerified faqat token qiymatiga teng bo\'lishi shart', () => {
    expect(rules).toContain('request.auth.token.email_verified');
  });
  it('chorak baholari 1..5 butun son bilan cheklangan', () => {
    const b = block('function validQGrades(');
    for (const k of ['q1', 'q2', 'q3', 'q4', 'year']) expect(b).toContain(`'${k}'`);
    expect(b).toContain('is int');
  });
  it('ota-ona havolalari: get ochiq, list yopiq (faqat a\'zolarga), kalit shakli tekshiriladi', () => {
    const b = block('match /parentLinks/{token}');
    expect(b).toContain('allow get: if true;');
    expect(b).toMatch(/allow list: if isApproved\(\) && isGroupMember\(resource\.data\.groupId\)/);
    expect(b).toContain('[A-Za-z0-9_-]{32,64}');
    expect(b).toMatch(/allow delete: if isSignedIn\(\)/);
  });
  it('ota-ona hujjatiga shaxsiy maydonlar (telefon, manzil, rasm, to\'lov) ruxsat etilmagan', () => {
    const b = block('function validParentLinkBody(');
    const allowed = b.slice(b.indexOf('hasOnly(['), b.indexOf('])'));
    for (const secret of ['phone', 'address', 'photo', 'birthDate', 'pay', 'fee']) expect(allowed).not.toContain(secret);
  });
  it('hech bir collection ro\'yxat bo\'yicha hammaga ochiq emas (parentLinks get dan tashqari "if true" yo\'q)', () => {
    const trues = rules.match(/allow [a-z, ]+: if true;/g) || [];
    expect(trues).toEqual(['allow get: if true;']);
  });
});
