import { esc } from './safe.js';
import { sanitizeParentData } from './parentLink.js';
import { fmtDMY, localDateStr, parseYMD, pad2 } from './dates.js';
import { mean } from './grades.js';
import { monthKeyTitle } from './months.js';

const gradeClass = (v) => (v >= 5 ? 'g5' : v >= 4 ? 'g4' : v >= 3 ? 'g3' : 'g2');

/** Ota-ona sahifasining HTML'i. view: { status: 'loading' | 'ok' | 'notfound' | 'error', data }.
 *  h: { t, lang }. Hamma qiymat esc()/raqamga o'tkaziladi. */
export function parentPageHTML(view, h) {
  const { t, lang } = h;
  const shell = (inner) => `<div class="parent-page"><div class="parent-head">
      <div class="parent-brand">TUGARAK+</div><div class="muted">${esc(t('parentSubtitle'))}</div></div>${inner}
      <div class="muted parent-foot">${esc(t('parentFoot'))}</div></div>`;
  if (view.status === 'loading') return shell(`<div class="card"><div class="spinner"></div></div>`);
  if (view.status === 'notfound') return shell(`<div class="card"><h2>${esc(t('parentNotFoundTitle'))}</h2><div class="muted">${esc(t('parentNotFoundText'))}</div></div>`);
  if (view.status !== 'ok') return shell(`<div class="card"><h2>${esc(t('parentErrorTitle'))}</h2><div class="muted">${esc(t('parentErrorText'))}</div></div>`);

  const d = sanitizeParentData(view.data);
  const avg = d.grades.length ? mean(d.grades.map(g => g.value)) : null;
  const total = d.attendance.length;
  const present = d.attendance.filter(a => a.present).length;
  const pct = total ? Math.round((present / total) * 100) : null;
  const absent = d.attendance.filter(a => !a.present).slice(-12);

  const byMonth = new Map();
  d.grades.forEach(g => { const k = g.day.slice(0, 7); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(g); });
  const months = [...byMonth.keys()].sort().reverse();
  const monthsHTML = months.length ? months.map(k => {
    const list = byMonth.get(k).sort((a, b) => a.day.localeCompare(b.day));
    return `<div class="parent-month"><div class="parent-month-h"><b>${esc(monthKeyTitle(lang, k))}</b>
      <span class="muted">${esc(t('parentMonthAvg'))}: <b>${mean(list.map(g => g.value)).toFixed(1)}</b></span></div>
      <div class="parent-grades">${list.map(g => { const p = parseYMD(g.day); return `<span class="parent-gr"><small>${pad2(p.d)}.${pad2(p.m)}</small><span class="grade ${gradeClass(g.value)}">${g.value}</span></span>`; }).join('')}</div></div>`;
  }).join('') : `<div class="muted">${esc(t('parentNoGrades'))}</div>`;

  const qKeys = [['q1', 'jqShort1'], ['q2', 'jqShort2'], ['q3', 'jqShort3'], ['q4', 'jqShort4'], ['year', 'jqYearShort']];
  const qHTML = qKeys.some(([k]) => d.qGrades[k]) ? `<div class="card"><h3>${esc(t('parentQuarters'))}</h3><div class="parent-grades">
      ${qKeys.filter(([k]) => d.qGrades[k]).map(([k, lbl]) => `<span class="parent-gr"><small>${esc(t(lbl))}</small><span class="grade ${gradeClass(d.qGrades[k])}">${d.qGrades[k]}</span></span>`).join('')}</div></div>` : '';

  const updated = d.updatedAtMs ? fmtDMY(localDateStr(new Date(d.updatedAtMs))) : '';
  return shell(`<div class="card">
      <h2 style="margin:0 0 4px;">${esc(d.studentName)}</h2>
      <div><span class="tag-subject">${esc(d.groupName)}${d.subject ? ' \u00B7 ' + esc(d.subject) : ''}</span></div>
      ${updated ? `<div class="muted" style="font-size:12px;margin-top:8px;">${esc(t('parentUpdated'))}: ${esc(updated)}</div>` : ''}
      <div class="parent-tiles">
        <div class="parent-tile"><div class="v">${avg === null ? '\u2014' : avg.toFixed(2)}</div><div class="l">${esc(t('parentAvg'))}</div></div>
        <div class="parent-tile"><div class="v">${pct === null ? '\u2014' : pct + '%'}</div><div class="l">${esc(t('parentAttendance'))}</div></div>
        <div class="parent-tile"><div class="v">${d.grades.length}</div><div class="l">${esc(t('parentGradesCount'))}</div></div>
      </div></div>
    ${qHTML}
    <div class="card"><h3>${esc(t('parentGradesTitle'))}</h3>${monthsHTML}</div>
    <div class="card"><h3>${esc(t('parentAttendance'))}</h3>
      ${total ? `<div>${present} / ${total} \u2014 <b>${pct}%</b></div>
        ${absent.length ? `<div class="muted" style="margin-top:8px;">${esc(t('parentAbsentDays'))}: ${absent.map(a => esc(fmtDMY(a.date).slice(0, 5))).join(', ')}</div>` : ''}`
        : `<div class="muted">${esc(t('parentNoAttendance'))}</div>`}
    </div>`);
}
