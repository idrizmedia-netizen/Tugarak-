// Ogʻir kutubxonalar (xlsx, mammoth) faqat fayl tanlanganda yuklanadi — sayt birinchi ochilishda
// ancha yengil va tez bo'ladi.
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_NAMES = 500;
const MAX_NAME_LEN = 120;

/** Excel (.xlsx/.xls), CSV yoki Word (.docx) fayldan o'quvchilar
 *  ismlarini avtomatik ajratib oladi. Natija — ism-familiyalar ro'yxati. */
export async function parseRosterFile(file) {
  const name = file.name.toLowerCase();
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Fayl juda katta (3 MB dan oshmasligi kerak)");
  }
  let names;
  if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    names = await parseSpreadsheet(file);
  } else if (name.endsWith('.docx')) {
    names = await parseDocx(file);
  } else {
    throw new Error("Qo'llab-quvvatlanmaydigan fayl formati (faqat .xlsx, .xls, .csv, .docx)");
  }
  return cleanNames(names);
}

/** Bo'sh joylarni tozalaydi, uzunlikni cheklaydi va takrorlarni olib tashlaydi. */
function cleanNames(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const n = String(raw).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
    if (n.length < 3) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
    if (out.length >= MAX_NAMES) break;
  }
  return out;
}

async function parseSpreadsheet(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  return extractNamesFromRows(rows);
}

async function parseDocx(file) {
  const { default: mammoth } = await import('mammoth/mammoth.browser');
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
