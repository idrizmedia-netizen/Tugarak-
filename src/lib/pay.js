import { localDateStr, parseYMD, daysBetween, fmtDMY } from './dates.js';
import { num } from './safe.js';
import { tl } from '../i18n.js';

export const PAY_WARN_DAYS = 3;

export function fmtMoney(n) { return Number(n || 0).toLocaleString('ru-RU'); }

/** To'lov holati: none | paid | overdue | soon | ok. Holat har doim sanadan hisoblanadi. */
export function payStatus(s, today = localDateStr()) {
  if (!parseYMD(s.payDue)) return { kind: 'none' };
  if (parseYMD(s.paidThrough) && s.paidThrough >= today) return { kind: 'paid', until: s.paidThrough };
  const days = daysBetween(today, s.payDue);
  if (days < 0) return { kind: 'overdue', days: -days };
  if (days <= PAY_WARN_DAYS) return { kind: 'soon', days };
  return { kind: 'ok', days };
}

/** Ota-onaga yuboriladigan tayyor eslatma matni (uz/ru/en). To'lov muddati belgilanmagan bo'lsa — ''. */
export function reminderText({ lang = 'uz', student, group, teacherName = '', today = localDateStr() }) {
  const st = payStatus(student, today);
  if (st.kind === 'none') return '';
  const vars = {
    name: student.fullName || '',
    group: group?.name || '',
    date: fmtDMY(student.payDue),
    days: st.days ?? 0
  };
  let key;
  if (st.kind === 'overdue') key = 'remindOverdue';
  else if (st.days === 0) key = 'remindToday';
  else key = 'remindSoon';
  const parts = [tl(lang, key, vars)];
  const fee = num(group?.fee);
  if (fee > 0) parts.push(tl(lang, 'remindFee', { fee: fmtMoney(fee) }));
  parts.push(tl(lang, 'remindThanks'));
  let msg = parts.join(' ');
  if (teacherName) msg += '\n' + tl(lang, 'remindSign', { teacher: teacherName });
  return msg;
}

/** Telegram / SMS "ulashish" havolalari. Matn albatta encodeURIComponent'dan o'tadi. */
export function telegramShareUrl(text) {
  return `https://t.me/share/url?url=%20&text=${encodeURIComponent(text)}`;
}
export function smsUrl(text) {
  return `sms:?&body=${encodeURIComponent(text)}`;
}
