/* main.js ni haqiqiy Firebase'siz ishga tushirish uchun xotiradagi soxta auth.js / db.js. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

/** main.js ichidagi `import { a, b } from './x.js'` ro'yxatidan nomlarni oladi (qo'lda ro'yxat yuritmaslik uchun). */
function importedNames(file) {
  const src = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
  const m = new RegExp(`import \\{([^}]*)\\} from '\\./${file}';`).exec(src);
  return m[1].split(',').map(s => s.trim()).filter(Boolean);
}

export const h = {
  authCb: null, calls: [], links: [], parentDoc: null, pushStudents: null,
  udoc: { status: 'approved', role: 'teacher', fullName: 'Dilnoza Karimova', email: 't@x.uz' },
  group: { id: 'g1', name: 'Shaxmat', subject: 'Shaxmat', teacherId: 'u1', coTeachers: [], weekdays: [1, 3, 5], fee: 150000, yearStart: '' },
  students: [],
  attendance: []
};
export function resetMockState() {
  h.calls = []; h.links = []; h.attendance = [];
  h.students = [
    { id: 's1', groupId: 'g1', teacherId: 'u1', fullName: 'Aziz Aliyev', className: '5-A', grades: [], payDue: '2026-10-28',
      photo: 'data:image/png;base64,SECRETPHOTO', address: 'Yashirin manzil' },
    { id: 's2', groupId: 'g1', teacherId: 'u1', fullName: 'Bobur Bekov', className: '5-B', grades: [] }
  ];
}
const record = (name) => vi.fn(async (...args) => { h.calls.push([name, ...args]); });

export function makeAuthMock() {
  const m = {};
  for (const n of importedNames('auth.js')) m[n] = vi.fn(async () => undefined);
  m.watchAuth = (cb) => { h.authCb = cb; return () => {}; };
  m.waitForRegistration = async () => {};
  m.isAdmin = async () => false;
  m.getUserDoc = async () => h.udoc;
  m.isGoogleUser = () => false;
  m.watchUserDoc = () => () => {};
  m.syncEmailVerifiedFlag = async () => {};
  m.handleRedirectResult = async () => {};
  m.getLockInfo = () => ({ locked: false, remaining: 0 });
  return m;
}
export function makeDbMock() {
  const m = {};
  for (const n of importedNames('db.js')) m[n] = vi.fn(async () => undefined);
  m.watchNotifications = (cb) => { cb([]); return () => {}; };
  m.watchSubscriptionSettings = () => () => {};
  m.watchAds = (cb) => { cb([]); return () => {}; };
  m.watchAllTeachers = (cb) => { cb([]); return () => {}; };
  m.watchMyGroups = (uid, cb) => { cb([h.group]); return () => {}; };
  m.watchGroupStudents = (gid, cb) => { h.pushStudents = () => cb(h.students.map(s => ({ ...s }))); cb(h.students.map(s => ({ ...s }))); return () => {}; };
  m.getAttendanceOnce = async () => h.attendance;
  m.getWorkPlanOnce = async () => [];
  m.getGroupDocsOnce = async () => [];
  m.getGroupParentLinks = vi.fn(async () => h.links);
  m.getParentLinkPublic = vi.fn(async () => h.parentDoc);
  m.deleteParentLinksForStudent = record('deleteParentLinksForStudent');
  m.createParentLink = vi.fn(async (uid, token, snap) => { h.calls.push(['createParentLink', uid, token, snap]); h.links = [{ token, ...snap }]; });
  m.updateParentLink = record('updateParentLink');
  m.deleteParentLink = record('deleteParentLink');
  m.setStudentQGrade = record('setStudentQGrade');
  m.addGrade = vi.fn(async (id, subject, value, period, day) => {
    h.calls.push(['addGrade', id, subject, value, period, day]);
    const s = h.students.find(x => x.id === id);
    s.grades = [...s.grades, { subject, value, date: Date.now(), period, day }];
    h.pushStudents?.();
  });
  m.setStudentGrades = vi.fn(async (id, grades) => {
    h.calls.push(['setStudentGrades', id, grades]);
    h.students.find(x => x.id === id).grades = grades;
    h.pushStudents?.();
  });
  return m;
}
export const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };
export const press = (key, target = document, init = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
