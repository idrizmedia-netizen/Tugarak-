import './styles.css';
import {
  watchAuth, registerTeacher, loginTeacher, loginWithGoogle, completeGoogleRegistration,
  resetPassword, logout, isAdmin, getUserDoc, getLockInfo, registerFail, clearFails
} from './auth.js';
import {
  watchAllTeachers, setTeacherStatus, watchMyGroups, createGroup,
  watchGroupStudents, addStudent, deleteStudent, addGrade
} from './db.js';
import { auth } from './firebase.js';

/** Rasmni kichraytirib, siqilgan base64 (JPEG) shaklga o'giradi.
 *  Firebase Storage o'rniga to'g'ridan-to'g'ri Firestore'da saqlash uchun
 *  (Spark/bepul reja bilan mos ishlashi maqsadida) rasm hajmi cheklanadi. */
function fileToCompressedBase64(file, maxWidth = 480, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const CONTRACT_TEXT = `
<p><b>TO'GARAK RAHBARI BILAN TUZILADIGAN SHARTNOMA (namuna)</b></p>
<p>Ushbu shartnoma "TUGARAK+" tizimi ma'muriyati (keyingi o'rinlarda — "Ma'muriyat") va to'garak rahbari sifatida ro'yxatdan o'tayotgan shaxs (keyingi o'rinlarda — "Rahbar") o'rtasida tuziladi.</p>
<p>1. Rahbar tizimga kiritilgan o'quvchilar ro'yxati va baholash ma'lumotlarining to'g'riligiga shaxsan javobgardir.</p>
<p>2. Rahbar o'quvchilarning shaxsiy ma'lumotlarini (jumladan, qo'lda yozilgan ro'yxatlar rasmini) faqat ta'lim maqsadlarida ishlatishga majburdir.</p>
<p>3. Ma'muriyat Rahbar tomonidan yuborilgan ro'yxatdan o'tish arizasini ko'rib chiqib, tasdiqlash yoki rad etish huquqiga ega.</p>
<p>4. Tasdiqlangandan so'ng Rahbar tizimning barcha imkoniyatlaridan (guruh yaratish, o'quvchi qo'shish, baho qo'yish, hisobot olish) foydalanish huquqiga ega bo'ladi.</p>
<p>5. Rahbar tekshiruvchi tashkilotlar tomonidan so'ralganda, o'z guruhi bo'yicha rasmiy hisobotni taqdim etishga majburdir.</p>
<p>6. <b>To'lovlar bo'yicha shartlar:</b> tizimdan foydalanish Ma'muriyat belgilagan tartibda pullik xizmat hisoblanishi mumkin. To'lov summasi, muddati va usuli Ma'muriyat tomonidan Rahbarga alohida (telefon, email yoki tizim orqali) xabar qilinadi. Rahbar belgilangan to'lov shartlariga to'liq va o'z vaqtida rioya qilishga majburdir. To'lov amalga oshirilmagan yoki kechiktirilgan taqdirda Ma'muriyat Rahbarning hisobini vaqtincha to'xtatib qo'yish huquqiga ega.</p>
<p>7. Ushbu shartnoma elektron shaklda, "Roziman" tugmasini bosish orqali imzolangan hisoblanadi.</p>
<p>8. <b>Aloqa va murojaat:</b> savol, taklif yoki shikoyatlar bo'yicha Ma'muriyat bilan quyidagi manzillar orqali bog'lanish mumkin:</p>
<p style="margin-left:6px;">\u{1F4E7} Email: idrizmedia@gmail.com<br>\u{1F4F7} Instagram: @normurodov_izzatillo<br>\u2708\uFE0F Telegram: @ziyomap</p>
`;

let state = {
  view: 'boot', authTab: 'login', theme: localStorage.getItem('theme') || 'light',
  firebaseUser: null, role: null, userDoc: null,
  teachers: [], groups: [], students: [], activeGroupId: null,
  modal: null, toast: null, pendingRegisterContract: false, authEmailTry: '',
  // Forma qiymatlari alohida saqlanadi, shunda modal ochilib-yopilganda
  // yoki boshqa sabab bilan sahifa qayta chizilganda (masalan, xato parol
  // taymeri) foydalanuvchi yozgan matn o'chib ketmaydi.
  regForm: { name: '', email: '', phone: '', password: '' },
  loginForm: { email: '', password: '' },
  contractReturnView: null,
};

let unsubTeachers = null, unsubGroups = null, unsubStudents = null;
const uid = () => 'x' + Math.random().toString(36).slice(2, 9);

function esc(s) { return (s || '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function friendlyError(err) {
  const code = err?.code || '';
  const map = {
    'auth/user-not-found': 'Bunday foydalanuvchi topilmadi.',
    'auth/wrong-password': 'Parol xato.',
    'auth/invalid-credential': 'Email yoki parol xato.',
    'auth/email-already-in-use': 'Bu email allaqachon ro\u2019yxatdan o\u2019tgan.',
    'auth/weak-password': 'Parol juda oddiy, kamida 6 belgi kiriting.',
    'auth/invalid-email': 'Email manzili noto\u2019g\u2019ri.',
    'auth/too-many-requests': 'Juda ko\u2019p urinish. Birozdan so\u2019ng qayta urinib ko\u2019ring.',
    'auth/popup-closed-by-user': 'Google oynasi yopildi, qayta urinib ko\u2019ring.'
  };
  return map[code] || (err?.message || 'Xatolik yuz berdi.');
}

function toast(msg, kind) {
  state.toast = { msg, kind: kind || 'info' };
  render();
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { state.toast = null; render(); }, 3400);
}

/* ================= AUTH STATE WIRING ================= */
watchAuth(async (user) => {
  state.firebaseUser = user;
  if (unsubTeachers) { unsubTeachers(); unsubTeachers = null; }
  if (unsubGroups) { unsubGroups(); unsubGroups = null; }
  if (unsubStudents) { unsubStudents(); unsubStudents = null; }

  if (!user) {
    state.role = null; state.userDoc = null;
    const publicViews = ['landing', 'teacherAuth', 'adminAuth', 'contractView'];
    if (!publicViews.includes(state.view)) state.view = 'landing';
    render();
    return;
  }

  const admin = await isAdmin(user.uid, user.email);
  if (admin) {
    state.role = 'admin';
    state.view = 'adminDash';
    unsubTeachers = watchAllTeachers(list => { state.teachers = list; render(); });
    render();
    return;
  }

  state.role = 'teacher';
  const udoc = await getUserDoc(user.uid);
  state.userDoc = udoc;
  if (!udoc) { state.view = 'teacherAuth'; render(); return; }
  if (udoc.status === 'incomplete') { state.view = 'googleComplete'; render(); return; }
  if (udoc.status === 'approved') {
    state.view = 'teacherDash';
    unsubGroups = watchMyGroups(user.uid, list => {
      state.groups = list;
      if (!state.activeGroupId && list.length) state.activeGroupId = list[0].id;
      subscribeStudentsIfNeeded();
      render();
    });
  } else {
    state.view = 'teacherPending';
  }
  render();
});

function subscribeStudentsIfNeeded() {
  if (unsubStudents) { unsubStudents(); unsubStudents = null; }
  if (state.activeGroupId) {
    unsubStudents = watchGroupStudents(state.activeGroupId, list => { state.students = list; render(); });
  }
}

/* ================= RENDER ================= */
function render() {
  const app = document.getElementById('app');
  document.body.classList.toggle('dark', state.theme === 'dark');

  if (state.view === 'boot') { app.innerHTML = `<div class="spinner"></div>`; return; }

  if (state.view === 'contractView') {
    app.innerHTML = renderContractView() + renderToast();
    attachHandlers();
    return;
  }

  if (!state.firebaseUser) {
    app.innerHTML = renderAuthGate();
  } else if (state.role === 'admin') {
    app.innerHTML = renderShell(renderAdminDash());
  } else if (state.view === 'googleComplete') {
    app.innerHTML = renderGoogleCompleteScreen();
  } else if (state.view === 'teacherPending' || (state.userDoc && state.userDoc.status !== 'approved')) {
    app.innerHTML = renderShell(renderTeacherPending());
  } else {
    app.innerHTML = renderShell(renderTeacherDash());
  }
  attachHandlers();
}

function sealSVG(size) {
  size = size || 38;
  return `<svg class="seal" width="${size}" height="${size}" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
    <circle cx="30" cy="30" r="28" fill="none" stroke="var(--gold)" stroke-width="2.5"/>
    <circle cx="30" cy="30" r="21" fill="var(--navy)"/>
    <path d="M20 33 L26 39 L40 23" fill="none" stroke="var(--teal)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="30" cy="30" r="28" fill="none" stroke="var(--gold)" stroke-width="1" stroke-dasharray="2 3"/>
  </svg>`;
}

function topbar() {
  const who = state.role === 'admin' ? 'Administrator' : (state.userDoc?.fullName || state.firebaseUser?.displayName || '');
  return `<div class="topbar">
    <div class="brandwrap">${sealSVG(34)}<div class="brand">TUGARAK<span>+</span></div></div>
    <div class="topbar-right">
      <button class="theme-toggle" id="themeToggle" aria-label="Tun/kun rejimi"></button>
      ${state.firebaseUser ? `<div class="userchip"><div class="avatar-sm">${esc((who || '?').slice(0, 1).toUpperCase())}</div><span>${esc(who || '')}</span></div>
      <button class="logout-btn" id="logoutBtn">Chiqish</button>` : ''}
    </div>
  </div>`;
}

function renderShell(inner) {
  const role = state.role;
  const nav = role === 'admin' ? [['adminDash', '\u{1F5C2}', 'Tasdiqlash']] : [['teacherDash', '\u{1F3E0}', 'Boshqaruv']];
  return `${topbar()}
  <div class="shell">
    <div class="sidebar no-print">${nav.map(([v, ic, l]) => `<button class="active">${ic} ${l}</button>`).join('')}</div>
    <div class="main">${inner}</div>
  </div>
  <div class="bottomnav no-print">${nav.map(([v, ic, l]) => `<button class="active">${ic}<span>${l}</span></button>`).join('')}</div>
  ${renderModal()}${renderToast()}`;
}

function renderToast() {
  if (!state.toast) return '';
  const bg = state.toast.kind === 'error' ? 'var(--danger)' : 'var(--teal)';
  return `<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:11px 20px;border-radius:10px;font-size:13.5px;font-weight:600;box-shadow:var(--shadow);z-index:200;">${esc(state.toast.msg)}</div>`;
}

/* ---------- AUTH GATE ---------- */
function renderAuthGate() {
  let inner;
  if (state.view === 'teacherAuth') inner = `<div class="auth-wrap">${renderTeacherAuthCard()}</div>`;
  else if (state.view === 'adminAuth') inner = `<div class="auth-wrap">${renderAdminAuthCard()}</div>`;
  else inner = `<div class="auth-wrap">
    <div class="auth-card" style="max-width:440px;">
      <div class="auth-title">${sealSVG(52)}<h1>TUGARAK<span style="color:var(--teal)">+</span></h1>
        <div class="muted">Maktabdan tashqari to'garaklarni boshqarish tizimi</div>
      </div>
      <button class="btn btn-teal block" data-goto="teacherAuth" style="margin-bottom:10px;">\u{1F9D1}\u200D\u{1F3EB} To'garak rahbari sifatida kirish</button>
      <button class="btn btn-outline block" data-goto="adminAuth">\u{1F6E1} Administrator sifatida kirish</button>
      <div class="divider"></div>
      <div class="muted" style="text-align:center;font-size:12px;">Davlat standartidagi hisobot shakllariga mos, qulay va xavfsiz boshqaruv.</div>
    </div>
  </div>`;
  // Modal (masalan shartnoma oynasi) va toast xabarnomasi kirishdan oldingi
  // sahifalarda ham ko'rinishi uchun shu yerda ham qo'shiladi.
  return `${inner}${renderModal()}${renderToast()}`;
}
function backToLanding() { return `<button class="link-btn" data-goto="landing" style="margin-bottom:14px;">\u2190 Bosh sahifa</button>`; }

/* ---------- SHARTNOMA (alohida sahifa, modal emas) ---------- */
function renderContractView() {
  return `<div class="auth-wrap"><div class="auth-card" style="max-width:520px;">
    <div style="text-align:center;margin-bottom:6px;">${sealSVG(48)}<div class="brand" style="font-size:17px;margin-top:4px;">TUGARAK<span style="color:var(--teal)">+</span></div></div>
    <h2 style="text-align:center;margin-top:6px;">\u{1F4C4} Shartnoma</h2>
    <div class="contract-text" style="max-height:360px;">${CONTRACT_TEXT}</div>
    <label class="check-row"><input type="checkbox" id="contractCheck"> <span>Men shartnoma shartlari bilan tanishdim va roziman</span></label>
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button type="button" class="btn btn-outline block" id="contractBackBtn">Bekor qilish</button>
      <button type="button" class="btn btn-teal block" id="contractAcceptBtn">Roziman</button>
    </div>
  </div></div>`;
}

function renderTeacherAuthCard() {
  const lockInfo = getLockInfo('teacher::' + (state.authEmailTry || ''));
  return `<div class="auth-card">${backToLanding()}
    <div class="auth-title">${sealSVG(46)}<h1>To'garak rahbari</h1><div class="muted">Ro'yxatdan o'tish yoki tizimga kirish</div></div>
    <div class="auth-tabs">
      <button data-tab="login" class="${state.authTab === 'login' ? 'active' : ''}">Kirish</button>
      <button data-tab="register" class="${state.authTab === 'register' ? 'active' : ''}">Ro'yxatdan o'tish</button>
    </div>
    ${state.authTab === 'login' ? renderTeacherLoginForm(lockInfo) : renderTeacherRegisterForm()}
  </div>`;
}

function renderTeacherLoginForm(lockInfo) {
  const f = state.loginForm;
  return `<form id="teacherLoginForm">
    <button type="button" class="btn btn-google" id="googleLoginBtn">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.4 29.4 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.6 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5c-7.8 0-14.5 4.5-17.7 10.2z"/><path fill="#4CAF50" d="M24 43.5c5.1 0 9.8-2 13.3-5.2l-6.1-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.4 0-9.9-3.1-11.3-7.6l-6.5 5C9.4 39 16.1 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.9 2.6-2.6 4.7-4.9 6.1l6.1 5.2C39.9 36.6 43.5 30.9 43.5 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
      Google orqali kirish
    </button>
    <div class="divider"></div>
    <label>Email</label><input type="email" id="tlEmail" required placeholder="siz@example.com" value="${esc(f.email)}">
    <label>Parol</label><input type="password" id="tlPass" required placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" value="${esc(f.password)}">
    ${lockInfo.locked ? `<div class="timer-box"><div>Ko'p marta xato parol kiritildi</div><div class="big" id="lockCountdown">${lockInfo.remaining}s</div><div class="muted">Iltimos kuting</div></div>` : ''}
    <button class="btn btn-primary block" style="margin-top:16px;" ${lockInfo.locked ? 'disabled' : ''}>Kirish</button>
    <div style="text-align:center;margin-top:12px;"><button type="button" class="link-btn" id="forgotBtn">Parolni unutdingizmi?</button></div>
  </form>`;
}

function renderTeacherRegisterForm() {
  const f = state.regForm;
  return `<form id="teacherRegForm">
    <label>To'liq ism-familiya</label><input type="text" id="rName" required placeholder="Masalan: Aliyev Vali" value="${esc(f.name)}">
    <label>Email</label><input type="email" id="rEmail" required placeholder="siz@example.com" value="${esc(f.email)}">
    <label>Telefon</label><input type="tel" id="rPhone" required placeholder="+998 90 123 45 67" value="${esc(f.phone)}">
    <label>Parol</label><input type="password" id="rPass" required minlength="6" placeholder="Kamida 6 belgi" value="${esc(f.password)}">
    <div class="divider"></div>
    <div class="muted" style="margin-bottom:8px;">Ro'yxatdan o'tish uchun shartnoma bilan tanishib chiqishingiz kerak.</div>
    <button type="button" class="btn btn-outline block" id="openContractBtn">\u{1F4C4} Shartnomani ko'rish va tasdiqlash</button>
    <div id="contractStatus" class="muted" style="margin-top:8px;">${state.pendingRegisterContract ? '\u2705 Shartnoma qabul qilindi' : 'Shartnoma hali qabul qilinmagan'}</div>
    <button class="btn btn-primary block" style="margin-top:16px;" ${state.pendingRegisterContract ? '' : 'disabled'}>Arizani yuborish</button>
  </form>`;
}

function renderAdminAuthCard() {
  return `<div class="auth-card">${backToLanding()}
    <div class="auth-title">${sealSVG(46)}<h1>Administrator</h1><div class="muted">Faqat ro'yxatga olingan Google hisobi orqali kirish mumkin</div></div>
    <button type="button" class="btn btn-google" id="adminGoogleLoginBtn">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.4 29.4 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.6 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5c-7.8 0-14.5 4.5-17.7 10.2z"/><path fill="#4CAF50" d="M24 43.5c5.1 0 9.8-2 13.3-5.2l-6.1-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.4 0-9.9-3.1-11.3-7.6l-6.5 5C9.4 39 16.1 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.9 2.6-2.6 4.7-4.9 6.1l6.1 5.2C39.9 36.6 43.5 30.9 43.5 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
      Google orqali kirish
    </button>
    <div class="muted" style="margin-top:14px;font-size:11.5px;text-align:center;">Faqat administrator sifatida oldindan ro'yxatga olingan (Firestore admins/{uid}) Google hisoblar kira oladi.</div>
  </div>`;
}

function renderGoogleCompleteScreen() {
  return `<div class="auth-wrap"><div class="auth-card">
    <div class="auth-title">${sealSVG(46)}<h1>Ro'yxatdan o'tishni yakunlang</h1>
      <div class="muted">${esc(state.firebaseUser?.email || '')}</div></div>
    <form id="googleCompleteForm">
      <label>Telefon raqamingiz</label><input type="tel" id="gcPhone" required placeholder="+998 90 123 45 67" value="${esc(state.regForm.phone)}">
      <div class="divider"></div>
      <div class="muted" style="margin-bottom:8px;">Davom etish uchun shartnoma bilan tanishib chiqing.</div>
      <button type="button" class="btn btn-outline block" id="openContractBtn">\u{1F4C4} Shartnomani ko'rish va tasdiqlash</button>
      <div class="muted" style="margin-top:8px;">${state.pendingRegisterContract ? '\u2705 Shartnoma qabul qilindi' : 'Shartnoma hali qabul qilinmagan'}</div>
      <button class="btn btn-primary block" style="margin-top:16px;" ${state.pendingRegisterContract ? '' : 'disabled'}>Arizani yuborish</button>
    </form>
  </div></div>${renderModal()}${renderToast()}`;
}

/* ---------- TEACHER PENDING ---------- */
function renderTeacherPending() {
  const t = state.userDoc;
  if (t?.status === 'rejected') {
    return `<div class="card"><h2>Ariza rad etildi</h2>
      <div class="error-box">Afsuski, administrator sizning ro'yxatdan o'tish arizangizni rad etdi. Qo'shimcha ma'lumot uchun administratsiya bilan bog'laning.</div></div>`;
  }
  return `<div class="card"><h2>Tasdiqlanishini kutmoqda \u23F3</h2>
    <p class="muted">Hurmatli ${esc(t?.fullName || '')}, sizning arizangiz va shartnomangiz administrator ko'rib chiqishini kutmoqda.</p>
    <div class="pill pending">\u23F3 Kutilmoqda</div></div>`;
}

/* ---------- ADMIN DASHBOARD ---------- */
function renderAdminDash() {
  const pending = state.teachers.filter(t => t.status === 'pending');
  const approved = state.teachers.filter(t => t.status === 'approved');
  const rejected = state.teachers.filter(t => t.status === 'rejected');
  return `
  <div class="stat-grid" style="margin-bottom:20px;">
    <div class="stat-card"><div class="num">${state.teachers.length}</div><div class="lbl">Jami arizalar</div></div>
    <div class="stat-card"><div class="num">${pending.length}</div><div class="lbl">Kutilmoqda</div></div>
    <div class="stat-card"><div class="num">${approved.length}</div><div class="lbl">Tasdiqlangan</div></div>
    <div class="stat-card"><div class="num">${rejected.length}</div><div class="lbl">Rad etilgan</div></div>
  </div>
  <div class="card">
    <h2>Tasdiqlash kutilayotgan arizalar</h2>
    <div class="muted">Har bir o'qituvchining shartnomani qabul qilganini tekshirib, tasdiqlang yoki rad eting.</div>
    <div class="divider"></div>
    ${pending.length === 0 ? `<div class="empty"><div class="big-icon">\u{1F4ED}</div>Hozircha yangi ariza yo'q</div>` :
      pending.map(t => `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 0;border-bottom:1px solid var(--line);">
        <div><b>${esc(t.fullName)}</b> <span class="pill pending">\u23F3 kutilmoqda</span><br>
        <span class="muted">${esc(t.email)} \u00B7 ${esc(t.phone || '')} \u00B7 ${t.contractAccepted ? '\u2705 Shartnoma qabul qilingan' : '\u274C Qabul qilinmagan'}</span></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-teal" data-approve="${t.id}">Tasdiqlash</button>
          <button class="btn btn-danger" data-reject="${t.id}">Rad etish</button>
        </div>
      </div>`).join('')}
  </div>
  <div class="card">
    <h2>Tasdiqlangan o'qituvchilar</h2><div class="divider"></div>
    ${approved.length === 0 ? `<div class="empty">Hali tasdiqlangan o'qituvchi yo'q</div>` : `
    <table><thead><tr><th>Ism</th><th>Email</th><th>Telefon</th></tr></thead><tbody>
    ${approved.map(t => `<tr><td>${esc(t.fullName)}</td><td>${esc(t.email)}</td><td>${esc(t.phone || '')}</td></tr>`).join('')}
    </tbody></table>`}
  </div>
  ${rejected.length ? `<div class="card"><h2>Rad etilganlar</h2><div class="divider"></div>
    ${rejected.map(t => `<div class="muted" style="padding:6px 0;">${esc(t.fullName)} \u2014 ${esc(t.email)}</div>`).join('')}</div>` : ''}
  `;
}

/* ---------- TEACHER DASHBOARD ---------- */
function studentAvg(s) { if (!s.grades || !s.grades.length) return 0; return s.grades.reduce((a, g) => a + g.value, 0) / s.grades.length; }
function gradeClass(v) { if (v >= 5) return 'g5'; if (v >= 4) return 'g4'; if (v >= 3) return 'g3'; return 'g2'; }
function levelLabel(avg) {
  if (avg === 0) return { t: 'Baholanmagan', c: 'var(--ink-soft)' };
  if (avg >= 4.5) return { t: "A'lo", c: 'var(--teal)' };
  if (avg >= 3.5) return { t: 'Yaxshi', c: '#2E6FA8' };
  if (avg >= 3) return { t: 'Qoniqarli', c: 'var(--gold)' };
  return { t: 'Qoniqarsiz', c: 'var(--danger)' };
}

function renderTeacherDash() {
  const myGroups = state.groups;
  const activeGroup = myGroups.find(g => g.id === state.activeGroupId) || myGroups[0];
  return `
  <div class="card no-print">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div><h2 style="margin:0;">Guruhlarim</h2><div class="muted">To'garak guruhini tanlang yoki yangisini yarating</div></div>
      <button class="btn btn-teal" id="newGroupBtn">+ Yangi guruh</button>
    </div>
    ${myGroups.length ? `<div class="divider"></div><div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${myGroups.map(g => `<button class="btn ${g.id === state.activeGroupId ? 'btn-primary' : 'btn-outline'}" data-selectgroup="${g.id}">${esc(g.name)} <span class="muted" style="opacity:.8">\u00B7 ${esc(g.subject)}</span></button>`).join('')}
    </div>` : `<div class="empty" style="padding-top:14px;"><div class="big-icon">\u{1F4DA}</div>Hali guruh yaratilmagan</div>`}
  </div>
  ${activeGroup ? renderGroupPanel(activeGroup) : ''}
  `;
}

function renderGroupPanel(group) {
  const students = state.students.filter(s => s.groupId === group.id);
  const withGrades = students.filter(s => s.grades && s.grades.length);
  const avg = withGrades.length ? withGrades.reduce((a, s) => a + studentAvg(s), 0) / withGrades.length : 0;
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div><h2 style="margin:0;">${esc(group.name)}</h2><span class="tag-subject">${esc(group.subject)}</span></div>
      <div style="display:flex;gap:8px;" class="no-print">
        <button class="btn btn-outline" id="addManualBtn">+ Qo'lda qo'shish</button>
        <button class="btn btn-outline" id="addPhotoBtn">\u{1F4F7} Rasmdan yuklash</button>
        <button class="btn btn-primary" id="printBtn">\u{1F5A8} Tekshiruvchi uchun eksport</button>
      </div>
    </div>
    <div class="divider"></div>
    ${students.length === 0 ? `<div class="empty"><div class="big-icon">\u{1F9D2}</div>Bu guruhda hali o'quvchi yo'q.<br>Qo'lda qo'shing yoki qog'ozdagi ro'yxat rasmini yuklang.</div>` : `
    <table><thead><tr><th>\u2116</th><th>Rasm</th><th>F.I.Sh.</th><th>Sinf</th><th>Baholar</th><th>O'rtacha</th><th>Daraja</th><th class="no-print"></th></tr></thead><tbody>
    ${students.map((s, i) => {
      const a = studentAvg(s); const lvl = levelLabel(a);
      return `<tr>
        <td>${i + 1}</td>
        <td>${s.photo ? `<img class="student-photo" src="${s.photo}">` : '\u2014'}</td>
        <td><b>${esc(s.fullName)}</b>${s.fromPhoto ? ` <span class="muted" style="font-size:11px;">(qo'lyozmadan)</span>` : ''}</td>
        <td>${esc(s.className || '\u2014')}</td>
        <td>${(s.grades || []).map(g => `<span class="grade ${gradeClass(g.value)}" title="${esc(g.subject)}">${g.value}</span>`).join(' ') || '<span class="muted">\u2014</span>'}
          <button class="link-btn no-print" data-addgrade="${s.id}" style="margin-left:6px;">+ baho</button></td>
        <td><b>${a ? a.toFixed(2) : '\u2014'}</b></td>
        <td><span style="color:${lvl.c};font-weight:700;">${lvl.t}</span>
          <div class="progress-bar" style="margin-top:4px;"><div style="width:${Math.min(100, a / 5 * 100)}%;"></div></div></td>
        <td class="no-print"><button class="link-btn" data-delstudent="${s.id}" style="color:var(--danger);">O'chirish</button></td>
      </tr>`;
    }).join('')}
    </tbody></table>
    <div class="divider"></div>
    <div class="muted">Guruh o'rtacha ko'rsatkichi: <b style="color:var(--navy)">${avg.toFixed(2)}</b> / 5.00 &nbsp;\u00B7&nbsp; O'zlashtirish: <b style="color:var(--teal)">${withGrades.length ? Math.round(withGrades.filter(s => studentAvg(s) >= 3).length / withGrades.length * 100) : 0}%</b></div>
    `}
  </div>`;
}

/* ---------- MODALS ---------- */
function renderModal() {
  if (!state.modal) return '';
  const m = state.modal;
  if (m.type === 'newGroup') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:420px;">
      <h2>Yangi guruh</h2>
      <label>Guruh nomi</label><input type="text" id="ngName" placeholder="Masalan: Robototexnika-1">
      <label>Fan / yo'nalish</label><input type="text" id="ngSubject" placeholder="Masalan: Robototexnika">
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">Bekor qilish</button>
        <button class="btn btn-teal block" id="ngSave">Yaratish</button>
      </div></div></div>`;
  }
  if (m.type === 'addManual') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:420px;">
      <h2>O'quvchi qo'shish</h2>
      <label>F.I.Sh.</label><input type="text" id="amName" placeholder="Ism Familiya">
      <label>Sinf</label><input type="text" id="amClass" placeholder="Masalan: 6-A">
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">Bekor qilish</button>
        <button class="btn btn-teal block" id="amSave">Qo'shish</button>
      </div></div></div>`;
  }
  if (m.type === 'addPhoto') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:460px;">
      <h2>\u{1F4F7} Qog'ozdagi ro'yxatdan yuklash</h2>
      <div class="muted">Ruchka yoki qalamda yozilgan o'quvchilar ro'yxati rasmini yuklang, so'ng o'quvchini qo'shing.</div>
      <div class="upload-drop" id="photoDropZone" style="margin-top:12px;">
        <input type="file" id="photoInput" accept="image/*" style="display:none;">\u{1F4E4} Rasmni tanlash uchun bosing
      </div>
      <div id="photoPreviewWrap"></div>
      <label>O'quvchi F.I.Sh.</label><input type="text" id="apName" placeholder="Ism Familiya">
      <label>Sinf</label><input type="text" id="apClass" placeholder="Masalan: 6-A">
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">Yopish</button>
        <button class="btn btn-teal block" id="apSave">Qo'shish</button>
      </div></div></div>`;
  }
  if (m.type === 'addGrade') {
    return `<div class="modal-bg" id="modalBg"><div class="modal" style="max-width:380px;">
      <h2>Baho qo'yish</h2>
      <label>Fan</label><input type="text" id="agSubject" placeholder="Masalan: Amaliyot">
      <label>Baho</label>
      <select id="agValue"><option value="5">5 \u2014 A'lo</option><option value="4">4 \u2014 Yaxshi</option><option value="3">3 \u2014 Qoniqarli</option><option value="2">2 \u2014 Qoniqarsiz</option></select>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button class="btn btn-outline block" id="modalCancel">Bekor qilish</button>
        <button class="btn btn-teal block" id="agSave">Saqlash</button>
      </div></div></div>`;
  }
  return '';
}

/* ================= EVENT HANDLERS ================= */
function attachHandlers() {
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    render();
  });
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await logout();
    state.view = 'landing'; state.activeGroupId = null; state.pendingRegisterContract = false;
  });
  document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => { state.view = el.dataset.goto; render(); }));
  document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => { state.authTab = el.dataset.tab; render(); }));

  /* Forma maydonlari: har bir harf kiritilganda state'ga yozib boriladi
     (render() chaqirilmaydi) — shunda modal ochilishi yoki taymer kabi
     boshqa sabab bilan sahifa qayta chizilsa ham, yozilgan matn saqlanib qoladi. */
  document.getElementById('rName')?.addEventListener('input', e => state.regForm.name = e.target.value);
  document.getElementById('rEmail')?.addEventListener('input', e => state.regForm.email = e.target.value);
  document.getElementById('rPhone')?.addEventListener('input', e => state.regForm.phone = e.target.value);
  document.getElementById('rPass')?.addEventListener('input', e => state.regForm.password = e.target.value);
  document.getElementById('tlEmail')?.addEventListener('input', e => state.loginForm.email = e.target.value);
  document.getElementById('tlPass')?.addEventListener('input', e => state.loginForm.password = e.target.value);
  document.getElementById('gcPhone')?.addEventListener('input', e => state.regForm.phone = e.target.value);

  /* Teacher login */
  document.getElementById('teacherLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('tlEmail').value.trim();
    const pass = document.getElementById('tlPass').value;
    state.authEmailTry = email;
    const lockKey = 'teacher::' + email;
    if (getLockInfo(lockKey).locked) { toast('Hisobingiz vaqtincha bloklangan.', 'error'); return; }
    try {
      await loginTeacher(email, pass);
      clearFails(lockKey);
      state.loginForm = { email: '', password: '' };
    } catch (err) {
      const count = registerFail(lockKey);
      toast(`${friendlyError(err)} (urinish: ${count}/3)`, 'error');
      render(); startLockCountdownIfNeeded();
    }
  });

  document.getElementById('googleLoginBtn')?.addEventListener('click', async () => {
    try { await loginWithGoogle(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });

  document.getElementById('forgotBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('tlEmail').value.trim();
    if (!email) { toast('Avval email manzilingizni kiriting.', 'error'); return; }
    try { await resetPassword(email); toast('Parolni tiklash havolasi emailingizga yuborildi.', 'info'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Teacher register */
  document.getElementById('openContractBtn')?.addEventListener('click', () => {
    state.contractReturnView = state.view;
    state.view = 'contractView';
    render();
  });
  document.getElementById('contractBackBtn')?.addEventListener('click', () => {
    state.view = state.contractReturnView || 'teacherAuth';
    render();
  });
  document.getElementById('contractAcceptBtn')?.addEventListener('click', () => {
    if (!document.getElementById('contractCheck').checked) { toast('Iltimos, avval belgini bosing.', 'error'); return; }
    state.pendingRegisterContract = true;
    state.view = state.contractReturnView || 'teacherAuth';
    render();
  });
  document.getElementById('teacherRegForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.pendingRegisterContract) { toast('Avval shartnomani tasdiqlang.', 'error'); return; }
    const fullName = document.getElementById('rName').value.trim();
    const email = document.getElementById('rEmail').value.trim();
    const phone = document.getElementById('rPhone').value.trim();
    const password = document.getElementById('rPass').value;
    try {
      await registerTeacher({ fullName, email, phone, password });
      state.pendingRegisterContract = false;
      state.regForm = { name: '', email: '', phone: '', password: '' };
      toast('Ariza yuborildi! Administrator tasdiqlashini kuting.', 'info');
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Google complete registration */
  document.getElementById('googleCompleteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.pendingRegisterContract) { toast('Avval shartnomani tasdiqlang.', 'error'); return; }
    const phone = document.getElementById('gcPhone').value.trim();
    try {
      await completeGoogleRegistration(state.firebaseUser.uid, { phone });
      state.pendingRegisterContract = false;
      const udoc = await getUserDoc(state.firebaseUser.uid);
      state.userDoc = udoc; state.view = 'teacherPending';
      toast('Ariza yuborildi! Administrator tasdiqlashini kuting.', 'info');
      render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Admin login \u2014 faqat Google */
  document.getElementById('adminGoogleLoginBtn')?.addEventListener('click', async () => {
    try { await loginWithGoogle(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });

  /* Admin actions */
  document.querySelectorAll('[data-approve]').forEach(el => el.addEventListener('click', async () => {
    await setTeacherStatus(el.dataset.approve, 'approved'); toast('O\u2019qituvchi tasdiqlandi.', 'info');
  }));
  document.querySelectorAll('[data-reject]').forEach(el => el.addEventListener('click', async () => {
    await setTeacherStatus(el.dataset.reject, 'rejected'); toast('Ariza rad etildi.', 'info');
  }));

  /* Teacher dashboard */
  document.getElementById('newGroupBtn')?.addEventListener('click', () => { state.modal = { type: 'newGroup' }; render(); });
  document.querySelectorAll('[data-selectgroup]').forEach(el => el.addEventListener('click', () => {
    state.activeGroupId = el.dataset.selectgroup; subscribeStudentsIfNeeded(); render();
  }));
  document.getElementById('addManualBtn')?.addEventListener('click', () => { state.modal = { type: 'addManual' }; render(); });
  document.getElementById('addPhotoBtn')?.addEventListener('click', () => { state.modal = { type: 'addPhoto' }; render(); });
  document.getElementById('printBtn')?.addEventListener('click', () => window.print());
  document.querySelectorAll('[data-addgrade]').forEach(el => el.addEventListener('click', () => { state.modal = { type: 'addGrade', studentId: el.dataset.addgrade }; render(); }));
  document.querySelectorAll('[data-delstudent]').forEach(el => el.addEventListener('click', async () => { await deleteStudent(el.dataset.delstudent); }));

  /* Modal generic */
  document.getElementById('modalCancel')?.addEventListener('click', () => { state.modal = null; render(); });
  document.getElementById('modalBg')?.addEventListener('click', (e) => { if (e.target.id === 'modalBg') { state.modal = null; render(); } });

  document.getElementById('ngSave')?.addEventListener('click', async () => {
    const name = document.getElementById('ngName').value.trim();
    const subject = document.getElementById('ngSubject').value.trim();
    if (!name || !subject) { toast('Barcha maydonlarni to\u2019ldiring.', 'error'); return; }
    const gid = await createGroup(state.firebaseUser.uid, name, subject);
    state.activeGroupId = gid; subscribeStudentsIfNeeded();
    state.modal = null; render();
  });

  document.getElementById('amSave')?.addEventListener('click', async () => {
    const name = document.getElementById('amName').value.trim();
    const cls = document.getElementById('amClass').value.trim();
    if (!name) { toast('Ismni kiriting.', 'error'); return; }
    await addStudent(state.firebaseUser.uid, state.activeGroupId, { fullName: name, className: cls });
    state.modal = null; render();
  });

  let selectedPhotoBase64 = null;
  document.getElementById('photoDropZone')?.addEventListener('click', () => document.getElementById('photoInput').click());
  document.getElementById('photoInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const zone = document.getElementById('photoDropZone'); zone.textContent = '\u23F3 Siqilmoqda...';
    try {
      selectedPhotoBase64 = await fileToCompressedBase64(file);
      document.getElementById('photoPreviewWrap').innerHTML = `<img src="${selectedPhotoBase64}" style="width:100%;border-radius:8px;margin-top:10px;border:1px solid var(--line);">`;
      zone.textContent = '\u{1F4E4} Rasmni tanlash uchun bosing (almashtirish)';
    } catch (err) { toast('Rasmni o\u2019qishda xatolik.', 'error'); zone.textContent = '\u{1F4E4} Rasmni tanlash uchun bosing'; }
  });
  document.getElementById('apSave')?.addEventListener('click', async () => {
    const name = document.getElementById('apName').value.trim();
    const cls = document.getElementById('apClass').value.trim();
    if (!name) { toast('Ismni kiriting.', 'error'); return; }
    try {
      await addStudent(state.firebaseUser.uid, state.activeGroupId, {
        fullName: name, className: cls, photo: selectedPhotoBase64, fromPhoto: !!selectedPhotoBase64
      });
      selectedPhotoBase64 = null;
      state.modal = null; render();
    } catch (err) { toast(friendlyError(err), 'error'); }
  });

  document.getElementById('agSave')?.addEventListener('click', async () => {
    const subject = document.getElementById('agSubject').value.trim();
    const value = parseInt(document.getElementById('agValue').value);
    if (!subject) { toast('Fan nomini kiriting.', 'error'); return; }
    await addGrade(state.modal.studentId, subject, value);
    state.modal = null; render();
  });
}

function startLockCountdownIfNeeded() {
  const el = document.getElementById('lockCountdown');
  if (!el) return;
  const timer = setInterval(() => {
    const cur = document.getElementById('lockCountdown');
    if (!cur) { clearInterval(timer); return; }
    let secs = parseInt(cur.textContent) - 1;
    if (secs <= 0) { clearInterval(timer); render(); } else cur.textContent = secs + 's';
  }, 1000);
}

render();
