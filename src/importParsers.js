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
    // Ism odatda birinchi MATNLI katakda bo'ladi. Tartib raqami ustuni ("1", "2." ...) va
    // sarlavha kataklari (T/r, №, F.I.Sh) o'tkazib yuboriladi, keyingi to'ldirilgan katak olinadi.
    let cell = '';
    let isHeader = false;
    for (const c of row) {
      const v = String(c ?? '').trim();
      if (!v) continue;
      if (/^(t\/r|№|no\.?|ism|f\.?i\.?sh\.?|fio|ism-familiya)$/i.test(v)) { isHeader = true; break; }
      if (/^\d+[\.\)]?$/.test(v)) continue; // faqat tartib raqami
      cell = v;
      break;
    }
    if (isHeader || !cell) continue;
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

/* ---------- Yillik ish reja importi ---------- */
const MAX_PLAN_ROWS = 300;

/** Excel (.xlsx/.xls) yoki CSV fayldan ish reja qatorlarini oladi: [{ topic, hours, date, note }].
 *  Sarlavha qatori (Mavzu / Soat / Sana / Izoh) bo'lsa — ustunlar nomiga qarab, bo'lmasa shu tartibda o'qiladi
 *  (boshidagi tartib raqami ustuni avtomatik o'tkazib yuboriladi). */
export async function parseWorkPlanFile(file) {
  const name = file.name.toLowerCase();
  if (file.size > MAX_FILE_BYTES) throw new Error("Fayl juda katta (3 MB dan oshmasligi kerak)");
  if (!(name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls'))) {
    throw new Error("Faqat .xlsx, .xls yoki .csv fayl qo'llab-quvvatlanadi");
  }
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  // CSV: raw:true — "01.10.2026" kabi sanalar AQSH formatida (oy/kun) noto'g'ri o'qilib ketmasligi uchun matn holida qoladi.
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: name.endsWith('.csv') });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  return extractPlanRows(rows);
}

const PLAN_HEADERS = {
  topic: /mavzu|тема|topic|nomi|название|mashg/i,
  hours: /soat|час|hour/i,
  date: /sana|muddat|дата|date|vaqt|срок/i,
  note: /izoh|eslatma|примеч|коммент|note|remark/i
};

function pad(n) { return String(n).padStart(2, '0'); }

/** Excel sanasi, "dd.mm.yyyy" yoki "yyyy-mm-dd" matnini "yyyy-mm-dd" ga o'giradi; bo'lmasa ''. */
function normalizePlanDate(v) {
  if (v instanceof Date && !isNaN(v)) {
    const d = new Date(v.getTime() + 12 * 3600 * 1000); // Excel sanalaridagi vaqt zonasi siljishidan himoya
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const str = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(str);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return '';
}

function planCell(v) {
  if (v instanceof Date) return '';
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function extractPlanRows(rows) {
  // 1) Sarlavha qatorini qidiramiz (dastlabki 6 qator ichida)
  let cols = null, start = 0;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const found = {};
    (rows[i] || []).forEach((c, ci) => {
      const v = planCell(c);
      if (!v) return;
      for (const key in PLAN_HEADERS) if (!(key in found) && PLAN_HEADERS[key].test(v)) found[key] = ci;
    });
    if ('topic' in found) { cols = found; start = i + 1; break; }
  }
  // 2) Sarlavha yo'q: tartib bo'yicha; birinchi ustun faqat raqam bo'lsa — o'tkazib yuboriladi
  if (!cols) {
    const sample = rows.filter(r => r && r.some(c => planCell(c))).slice(0, 10);
    const first = sample.map(r => planCell(r[0])).filter(Boolean);
    const offset = first.length && first.every(v => /^\d+[\.\)]?$/.test(v)) ? 1 : 0;
    cols = { topic: offset, hours: offset + 1, date: offset + 2, note: offset + 3 };
    start = 0;
  }
  const items = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const topic = planCell(r[cols.topic]).replace(/^\d+[\.\)\-]\s*/, '').slice(0, 200);
    if (!topic || /^\d+$/.test(topic)) continue;
    const hoursRaw = cols.hours !== undefined ? r[cols.hours] : '';
    const hours = planCell(hoursRaw).slice(0, 10);
    const dateRaw = cols.date !== undefined ? r[cols.date] : '';
    const date = normalizePlanDate(dateRaw);
    let note = cols.note !== undefined ? planCell(r[cols.note]) : '';
    // Sana sifatida tanilmagan matn (masalan "Sentabr") yo'qolmasligi uchun izohga qo'shiladi
    const dateText = planCell(dateRaw);
    if (!date && dateText) note = note ? `${dateText} \u00B7 ${note}` : dateText;
    items.push({ topic, hours, date, note: note.slice(0, 300) });
    if (items.length >= MAX_PLAN_ROWS) break;
  }
  return items;
}
