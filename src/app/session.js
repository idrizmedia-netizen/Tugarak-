import { getAllGroupsAdminOnce, getAllStudentsAdminOnce, getAttendanceOnce, getGroupDocsOnce, getWorkPlanOnce, syncTeacherDirectory, watchAds, watchAllTeachers, watchGroupStudents, watchMyGroups, watchNotifications, watchSubscriptionSettings } from '../db.js';
import { ensureGoogleUserDoc, getUserDoc, isAdmin, isGoogleUser, logout, syncEmailVerifiedFlag, waitForRegistration, watchAuth, watchUserDoc } from '../auth.js';
import { t } from '../i18n.js';
import { resetSessionState, rt, state } from './state.js';
import { render } from './render.js';
import { toast } from './util.js';

/** Admin statistikasi uchun guruh va o'quvchilarni BIR MARTA o'qiydi (real-vaqtli tinglovchi o'rniga).
 *  force=false bo'lsa, oxirgi yuklashdan 5 daqiqa o'tmagan bo'lsa qayta o'qimaydi. */
export async function loadAdminDataOnce(force) {
  if (rt.adminDataLoading) return;
  if (!force && Date.now() - rt.adminDataLoadedAt < 5 * 60 * 1000) return;
  rt.adminDataLoading = true;
  const run = rt.authRun;
  try {
    const [groups, students] = await Promise.all([getAllGroupsAdminOnce(), getAllStudentsAdminOnce()]);
    if (run !== rt.authRun) return; // foydalanuvchi almashgan
    state.allGroupsAdmin = groups; state.allStudentsAdmin = students;
    rt.adminDataLoadedAt = Date.now();
    render();
  } catch (err) {
    console.warn('Admin statistikasini yuklab bo\u2019lmadi:', err.code || err);
  } finally { rt.adminDataLoading = false; }
}

/** Admin birinchi marta kirganda tasdiqlangan o'qituvchilarni hamkor-qidiruv katalogiga bir martalik ko'chiradi. */
async function backfillDirectoryOnce(list) {
  if (rt.directoryBackfillStarted) return;
  try { if (localStorage.getItem('dirBackfill:v1')) return; } catch (e) { /* e'tiborsiz */ }
  const approved = list.filter(tc => tc.status === 'approved');
  if (!approved.length) return;
  rt.directoryBackfillStarted = true;
  try {
    await syncTeacherDirectory(approved);
    try { localStorage.setItem('dirBackfill:v1', '1'); } catch (e) { /* e'tiborsiz */ }
  } catch (e) {
    rt.directoryBackfillStarted = false;
    console.warn('Hamkor katalogini yangilab bo\u2019lmadi:', e);
  }
}

/** O'qituvchi hujjati (status) bo'yicha mos ekranni va guruh obunasini o'rnatadi. */
function applyTeacherDoc(user, udoc) {
  state.userDoc = udoc;
  if (rt.unsubGroups) { rt.unsubGroups(); rt.unsubGroups = null; }
  if (udoc.status === 'incomplete') { state.view = 'googleComplete'; render(); return; }
  if (udoc.status === 'approved') {
    if (state.view !== 'subscription') state.view = 'teacherDash';
    rt.unsubGroups = watchMyGroups(user.uid, list => {
      state.groups = list;
      // Faol guruh yo'q bo'lsa yoki o'chirilgan bo'lsa — birinchisini tanlaymiz.
      if (!state.activeGroupId || !list.some(g => g.id === state.activeGroupId)) {
        state.activeGroupId = list.length ? list[0].id : null;
      }
      syncActiveGroup(); // faqat faol guruh O'ZGARGANDA qayta obuna bo'ladi (ortiqcha o'qishlar yo'q)
      render();
    });
  } else {
    state.view = 'teacherPending';
  }
  render();
}

function subscribeStudentsIfNeeded() {
  if (rt.unsubStudents) { rt.unsubStudents(); rt.unsubStudents = null; }
  if (state.activeGroupId) {
    rt.unsubStudents = watchGroupStudents(state.activeGroupId, list => { state.students = list; render(); });
  } else {
    state.students = [];
  }
}

// Har bir yuklash natijasi faqat shu paytda ham faol bo'lgan guruhga yoziladi —
// guruhlar tez almashtirilganda eski guruh ma'lumoti yangisining ustiga yozilib qolmaydi.
export async function loadGroupDocsOnce() {
  const gid = state.activeGroupId;
  const docs = gid ? await getGroupDocsOnce(gid) : [];
  if (gid === state.activeGroupId) state.groupDocs = docs;
}

export async function loadAttendanceOnce() {
  const gid = state.activeGroupId;
  const list = gid ? await getAttendanceOnce(gid) : [];
  if (gid === state.activeGroupId) state.attendance = list;
}

async function loadWorkPlanOnce() {
  const gid = state.activeGroupId;
  const items = gid ? await getWorkPlanOnce(gid) : [];
  if (gid === state.activeGroupId) state.workPlan = items;
}

function loadGroupExtrasOnce() {
  const run = ++rt.extrasRun;
  // Hujjatlar (katta base64 fayllar) faqat "Hujjatlar" oynasi ochilganda yuklanadi — ortiqcha o'qish yo'q.
  state.groupDocs = []; state.attendance = []; state.workPlan = [];
  Promise.all([loadAttendanceOnce(), loadWorkPlanOnce()])
    .then(() => { if (run === rt.extrasRun) render(); })
    .catch(err => console.error('Guruh qo\u2019shimcha ma\u2019lumotlarini yuklashda xato:', err));
}

export function syncActiveGroup() {
  if (state.activeGroupId === rt.syncedGroupId) return;
  rt.syncedGroupId = state.activeGroupId;
  subscribeStudentsIfNeeded();
  loadGroupExtrasOnce();
}

export function startAuthWatcher() {
watchAuth(async (user) => {
    const run = ++rt.authRun;
    const stale = () => run !== rt.authRun;
    state.firebaseUser = user;
    if (rt.unsubTeachers) { rt.unsubTeachers(); rt.unsubTeachers = null; }
    if (rt.unsubGroups) { rt.unsubGroups(); rt.unsubGroups = null; }
    if (rt.unsubStudents) { rt.unsubStudents(); rt.unsubStudents = null; }
    if (rt.unsubNotifications) { rt.unsubNotifications(); rt.unsubNotifications = null; }
    if (rt.unsubSubscription) { rt.unsubSubscription(); rt.unsubSubscription = null; }
    if (rt.unsubAds) { rt.unsubAds(); rt.unsubAds = null; }
    rt.adminDataLoadedAt = 0;
    if (rt.unsubUserDoc) { rt.unsubUserDoc(); rt.unsubUserDoc = null; }
    resetSessionState();
  
    if (!user) {
      state.role = null; state.userDoc = null; state.notifications = [];
      const publicViews = ['landing', 'teacherAuth', 'adminAuth', 'contractView'];
      if (!publicViews.includes(state.view)) state.view = 'landing';
      render();
      return;
    }
  
    // Tizimga kirgan har qanday foydalanuvchi (admin yoki o'qituvchi)
    // bildirishnomalarni, obuna sozlamalarini va reklamani ko'ra oladi.
    rt.unsubNotifications = watchNotifications(list => { state.notifications = list; render(); });
    rt.unsubSubscription = watchSubscriptionSettings(sub => { state.subscription = sub; render(); });
    rt.unsubAds = watchAds(list => { state.ads = list; render(); });
  
    // Yangi ro'yxatdan o'tgan foydalanuvchining profili yozilib bo'lguncha kutamiz (poyga holati).
    await waitForRegistration();
    if (stale()) return;
    const admin = await isAdmin(user.uid);
    if (stale()) return;
    if (admin) {
      state.role = 'admin';
      state.view = 'adminDash';
      rt.unsubTeachers = watchAllTeachers(list => { state.teachers = list; backfillDirectoryOnce(list); render(); });
      loadAdminDataOnce(true);
      render();
      return;
    }
  
    state.role = 'teacher';
    let udoc = await getUserDoc(user.uid);
    if (stale()) return;
    if (!udoc && isGoogleUser(user)) {
      // Google orqali birinchi kirish: boshlang'ich hujjat shu yerda yaratiladi (admin emasligi tekshirilgan).
      try { udoc = await ensureGoogleUserDoc(user); }
      catch (e) { console.error('Google profili yaratilmadi:', e); }
      if (stale()) return;
    }
    if (!udoc) {
      // Profili yo'q hisob (masalan, ro'yxatdan o'tish uzilgan) — bo'sh panel ko'rsatmasdan chiqarib yuboramiz.
      toast(t('errGeneric'), 'error');
      await logout();
      return;
    }
    applyTeacherDoc(user, udoc);
    syncEmailVerifiedFlag(user, udoc).catch(() => {}); // admin ariza ko'rganda email holati ko'rinadi
    // Profil real vaqtda kuzatiladi: holat (status) o'zgarsa interfeys darhol yangilanadi.
    rt.unsubUserDoc = watchUserDoc(user.uid, d => {
      if (stale() || !d) return;
      const prev = state.userDoc;
      if (prev && prev.status === d.status) { state.userDoc = d; render(); return; }
      applyTeacherDoc(user, d);
    });
  });
}
