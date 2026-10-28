import { getLang, t } from '../i18n.js';
import { state } from './state.js';
import { levelLabel, quarterAverages, studentAttendancePercent, studentAvg } from './grades.js';
import { esc, localDateStr, toast } from './util.js';
import { loadAdminDataOnce } from './session.js';
import { fmtDMY, payStatus, payText } from './pay.js';
import { ymdOf } from './limits.js';

export function formatDateDMY(d) {
  d = d || new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function buildReportHTML(group, students) {
  const teacherName = state.userDoc?.fullName || '';
  const plan = (state.workPlan || []).filter(r => r && (r.topic || r.hours || r.date || r.note));
  const rows = students.map((s, i) => {
    const a = studentAvg(s);
    const p = studentAttendancePercent(s.id);
    const q = quarterAverages(s);
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${esc(s.fullName)}</td>
      <td class="c">${esc(s.className || '')}</td>
      <td class="c">${q[0]}</td><td class="c">${q[1]}</td><td class="c">${q[2]}</td><td class="c">${q[3]}</td>
      <td class="c"><b>${a ? a.toFixed(2) : '\u2014'}</b></td>
      <td class="c">${a ? esc(levelLabel(a).label) : '\u2014'}</td>
      <td class="c">${p === null ? '\u2014' : p + '%'}</td>
    </tr>`;
  }).join('');
  const planRows = plan.map((r, i) => `<tr>
      <td class="c">${i + 1}</td><td>${esc(r.topic)}</td><td class="c">${esc(r.hours)}</td>
      <td class="c">${esc(r.date)}</td><td>${esc(r.note)}</td></tr>`).join('');
  const lang = esc(getLang?.() || 'uz');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(t('printReportTitle'))} \u2014 ${esc(group.name)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, "Helvetica Neue", sans-serif; color: #111; font-size: 12px; margin: 0; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 4px; }
  .sub { text-align: center; color: #555; margin-bottom: 14px; font-size: 11px; }
  h2 { font-size: 13px; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #444; padding: 4px 6px; vertical-align: top; }
  th { background: #e9e9e9; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 11px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .c { text-align: center; }
  .info td { border: none; padding: 2px 0; }
  .info td:first-child { width: 150px; color: #555; }
  .sign { display: flex; justify-content: space-between; gap: 30px; margin-top: 34px; }
  .sign div { flex: 1; border-top: 1px solid #444; padding-top: 4px; font-size: 11px; color: #333; }
</style></head><body>
<h1>${esc(t('printReportTitle'))}</h1>
<div class="sub">TUGARAK+ \u00B7 ${esc(t('printDate'))}: ${formatDateDMY()}</div>
<table class="info"><tbody>
  <tr><td>${esc(t('printTeacher'))}:</td><td><b>${esc(teacherName)}</b></td></tr>
  <tr><td>${esc(t('printGroup'))}:</td><td><b>${esc(group.name)}</b></td></tr>
  <tr><td>${esc(t('printSubject'))}:</td><td>${esc(group.subject)}</td></tr>
  <tr><td>${esc(t('printStudentsCount'))}:</td><td>${students.length}</td></tr>
</tbody></table>
<h2>${esc(t('mQuarterlyTitle'))}</h2>
<table><thead><tr>
  <th>${esc(t('colNum'))}</th><th>${esc(t('colFullName'))}</th><th>${esc(t('colClass'))}</th>
  <th>${esc(t('q1'))}</th><th>${esc(t('q2'))}</th><th>${esc(t('q3'))}</th><th>${esc(t('q4'))}</th>
  <th>${esc(t('colAvg'))}</th><th>${esc(t('colLevel'))}</th><th>${esc(t('colAttendance'))}</th>
</tr></thead><tbody>${rows}</tbody></table>
${plan.length ? `<h2>${esc(t('printWorkPlanTitle'))}</h2>
<table><thead><tr><th>${esc(t('colNum'))}</th><th>${esc(t('colTopic'))}</th><th>${esc(t('colHours'))}</th><th>${esc(t('colDate'))}</th><th>${esc(t('colNote'))}</th></tr></thead><tbody>${planRows}</tbody></table>` : ''}
<div class="sign"><div>${esc(t('printSignTeacher'))}</div><div>${esc(t('printSignInspector'))}</div></div>
</body></html>`;
}

/** HTML hujjatni yashirin ramkada chop etadi (popup bloklanmaydi, sahifa dizayni aralashmaydi). */
function printHtmlDocument(htmlDoc) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  let done = false;
  const cleanup = () => { if (done) return; done = true; setTimeout(() => frame.remove(), 500); };
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) { cleanup(); return; }
    w.addEventListener('afterprint', cleanup);
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { console.warn('Chop etish xatosi:', e); cleanup(); } }, 150);
    setTimeout(cleanup, 120000); // zaxira: afterprint kelmasa ham ramka o'chiriladi
  };
  document.body.appendChild(frame);
  frame.srcdoc = htmlDoc;
}

export function printGroupReport() {
  const group = state.groups.find(g => g.id === state.activeGroupId);
  const students = state.students.filter(s => s.groupId === state.activeGroupId);
  if (!group || !students.length) { toast(t('printNoStudents'), 'error'); return; }
  printHtmlDocument(buildReportHTML(group, students));
}

/** Tanlangan oy uchun davomat jadvali: darslar, har o'quvchi belgilari, foizlar, eng ko'p qoldirganlar. */
export function buildAttendanceReport(groupId, month) {
  const students = state.students.filter(s => s.groupId === groupId);
  const dated = state.attendance.filter(a => typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date));
  const months = [...new Set(dated.map(a => a.date.slice(0, 7)))].sort().reverse();
  const cur = months.includes(month) ? month : (months[0] || '');
  const lessons = dated.filter(a => a.date.startsWith(cur)).sort((a, b) => a.date.localeCompare(b.date));
  const has = (rec, id) => !!rec && Object.prototype.hasOwnProperty.call(rec, id);
  const rows = students.map(s => {
    let present = 0, absent = 0;
    const marks = lessons.map(l => {
      if (!has(l.records, s.id)) return null;
      const p = !!l.records[s.id];
      if (p) present++; else absent++;
      return p;
    });
    const total = present + absent;
    return { s, marks, present, absent, pct: total ? Math.round(present / total * 100) : null };
  }).sort((a, b) => (a.s.fullName || '').localeCompare(b.s.fullName || '', 'uz'));
  const sumP = rows.reduce((a, r) => a + r.present, 0);
  const sumAll = rows.reduce((a, r) => a + r.present + r.absent, 0);
  return {
    months, month: cur, lessons, rows,
    avgPct: sumAll ? Math.round(sumP / sumAll * 100) : null,
    top: rows.filter(r => r.absent > 0).sort((a, b) => b.absent - a.absent).slice(0, 5)
  };
}

/** Admin hisoboti: Umumiy / Guruhlar / O'qituvchilar varaqlari bilan bitta Excel fayl. */
export async function exportAdminReportToExcel() {
  await loadAdminDataOnce(true); // eng so'nggi ma'lumot bilan
  const XLSX = await import('xlsx');
  const groups = state.allGroupsAdmin || [];
  const students = state.allStudentsAdmin || [];
  const teachers = state.teachers || [];
  const avgOf = (list) => { const g = list.filter(s => s.grades?.length); return g.length ? g.reduce((a, s) => a + studentAvg(s), 0) / g.length : null; };
  const nameByUid = {}; teachers.forEach(tc => { nameByUid[tc.id] = tc.fullName; });
  const count = (st) => teachers.filter(tc => tc.status === st).length;
  const r2 = (v) => v === null ? '' : Number(v.toFixed(2));

  const summary = [
    [t('adminReportsTitle')],
    [t('reportGeneratedAt'), fmtDMY(localDateStr())],
    [],
    [t('reportTotalTeachers'), count('approved')],
    [t('statPending'), count('pending')],
    [t('statRejected'), count('rejected')],
    [t('statBlocked'), count('blocked')],
    [t('reportTotalGroups'), groups.length],
    [t('reportTotalStudents'), students.length],
    [t('reportAvgScore'), r2(avgOf(students))]
  ];
  const groupRows = groups.map((g, i) => {
    const gs = students.filter(s => s.groupId === g.id);
    return { [t('colNum')]: i + 1, [t('mGroupNameLabel')]: g.name, [t('mSubjectShortLabel')]: g.subject || '',
      [t('colName')]: nameByUid[g.teacherId] || '', [t('profileStudents')]: gs.length, [t('colAvg')]: r2(avgOf(gs)) };
  });
  const statusLbl = { approved: t('statApproved'), pending: t('statPending'), rejected: t('statRejected'), blocked: t('statBlocked') };
  const teacherRows = teachers.map((tc, i) => {
    const gids = groups.filter(g => g.teacherId === tc.id).map(g => g.id);
    return { [t('colNum')]: i + 1, [t('colName')]: tc.fullName || '', [t('colEmail')]: tc.email || '', [t('colPhone')]: tc.phone || '',
      [t('colStatusLbl')]: statusLbl[tc.status] || '',
      [t('colGroupsN')]: gids.length, [t('colStudentsN')]: students.filter(s => gids.includes(s.groupId)).length,
      [t('colRegistered')]: tc.createdAt?.toMillis ? fmtDMY(ymdOf(new Date(tc.createdAt.toMillis()))) : '' };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), t('xlsSheetSummary').slice(0, 30));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groupRows), t('xlsSheetGroups').slice(0, 30));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teacherRows), t('xlsSheetTeachers').slice(0, 30));
  XLSX.writeFile(wb, `Tugarak_hisobot_${localDateStr()}.xlsx`);
}

export async function exportAttendanceToExcel(groupId, month) {
  const group = state.groups.find(g => g.id === groupId);
  const rep = buildAttendanceReport(groupId, month);
  if (!group || !rep.lessons.length) { toast(t('attNoData'), 'error'); return; }
  const XLSX = await import('xlsx');
  const head = [t('colNum'), t('colFullName'), ...rep.lessons.map(l => `${l.date.slice(8, 10)}.${l.date.slice(5, 7)}`), t('attColPresent'), t('attColAbsent'), '%'];
  const body = rep.rows.map((r, i) => [i + 1, r.s.fullName, ...r.marks.map(m => m === null ? '' : m ? '+' : '-'), r.present, r.absent, r.pct === null ? '' : `${r.pct}%`]);
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, rep.month);
  XLSX.writeFile(wb, `${(group.name || 'guruh').replace(/[\\/:*?"<>|]+/g, '_')}_davomat_${rep.month}.xlsx`);
}

export async function exportGroupToExcel() {
  const group = state.groups.find(g => g.id === state.activeGroupId);
  const students = state.students.filter(s => s.groupId === state.activeGroupId);
  if (!group || !students.length) { toast(t('emptyStudents').replace(/<br>/g, ' '), 'error'); return; }
  const XLSX = await import('xlsx');
  const rows = students.map((s, i) => {
    const a = studentAvg(s); const lvl = levelLabel(a);
    return {
      [t('colNum')]: i + 1,
      [t('colFullName')]: s.fullName,
      [t('colClass')]: s.className || '',
      [t('colGrades')]: (s.grades || []).map(g => `${g.subject}:${g.value}`).join(', '),
      [t('colAvg')]: a ? Number(a.toFixed(2)) : '',
      [t('colLevel')]: lvl.label,
      [t('colAttendance')]: (() => { const p = studentAttendancePercent(s.id); return p === null ? '' : `${p}%`; })(),
      [t('payExcelCol')]: payStatus(s).kind === 'none' ? '' : payText(payStatus(s)),
      [t('payExcelDue')]: fmtDMY(s.payDue),
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (group.name || '').replace(/[\[\]:*?\/\\]/g, '_').slice(0, 28) || 'Sheet1');
  XLSX.writeFile(wb, `${(group.name || 'guruh').replace(/[\\/:*?"<>|]+/g, '_')}.xlsx`);
}
