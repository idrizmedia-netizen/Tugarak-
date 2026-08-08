import * as XLSX from 'xlsx';
import mammoth from 'mammoth/mammoth.browser';

/** Excel (.xlsx/.xls), CSV yoki Word (.docx) fayldan o'quvchilar
 *  ismlarini avtomatik ajratib oladi. Natija — ism-familiyalar ro'yxati. */
export async function parseRosterFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseSpreadsheet(file);
  }
  if (name.endsWith('.docx')) {
    return parseDocx(file);
  }
  throw new Error("Qo'llab-quvvatlanmaydigan fayl formati (faqat .xlsx, .xls, .csv, .docx)");
}

async function parseSpreadsheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  return extractNamesFromRows(rows);
}

async function parseDocx(file) {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return extractNamesFromLines(result.value.split('\n'));
}

function extractNamesFromRows(rows) {
  const names = [];
  for (const row of rows) {
    if (!row || !row.length) continue;
    // Ism odatda birinchi ustunda bo'ladi; agar bo'sh bo'lsa, keyingi to'ldirilgan katakni sinab ko'ramiz.
    let cell = '';
    for (const c of row) {
      const v = String(c ?? '').trim();
      if (v) { cell = v; break; }
    }
    if (!cell) continue;
    if (/^(t\/r|№|no\.?|ism|f\.?i\.?sh\.?|fio|ism-familiya)$/i.test(cell)) continue; // sarlavha qatorini o'tkazib yuborish
    if (/^\d+$/.test(cell)) continue; // faqat raqamdan iborat qatorlar (masalan tartib raqami ustuni)
    names.push(cell.replace(/^\d+[\.\)\-]\s*/, ''));
  }
  return names;
}

function extractNamesFromLines(lines) {
  const names = [];
  for (let line of lines) {
    line = line.trim().replace(/^\d+[\.\)\-]\s*/, '');
    if (!line || line.length < 3) continue;
    if (/^(t\/r|№|ism|f\.?i\.?sh\.?|fio|ism-familiya|ro'yxat|ro'yxati)/i.test(line)) continue;
    names.push(line);
  }
  return names;
}
