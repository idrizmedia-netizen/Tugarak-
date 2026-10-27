export const state = {
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
  notifications: [],
  subscription: { enabled: false, plans: { free: { price: 0, discount: 0, features: [] }, monthly: { price: 0, discount: 0, features: [] }, yearly: { price: 0, discount: 0, features: [] } } },
  profileForm: { name: '', phone: '' },
  ad: { enabled: false, title: '', text: '', link: '', image: null },
  ads: [],
  adDismissed: false,
  groupDocs: [],
  attendance: [],
  workPlan: [],
  allGroupsAdmin: [],
  allStudentsAdmin: [],
  studentQuery: '', studentSort: 'added', teacherQuery: '',
};

/** Modullar o'rtasida baham ko'riladigan o'zgaruvchan ichki holat (avval main.js dagi `let` o'zgaruvchilar). */
export const rt = {
  unsubTeachers: null,
  unsubGroups: null,
  unsubStudents: null,
  unsubNotifications: null,
  unsubSubscription: null,
  unsubAds: null,
  unsubUserDoc: null,
  adminDataLoadedAt: 0,
  adminDataLoading: false,
  syncedGroupId: null,
  extrasRun: 0,
  directoryBackfillStarted: false,
  deferredInstallPrompt: null,
  authRun: 0,
  adCarouselIndex: 0,
};

/** Foydalanuvchi almashganda/chiqqanda oldingi akkaunt ma'lumotlari xotirada qolib ketmasligi uchun. */
export function resetSessionState() {
  rt.syncedGroupId = null; rt.extrasRun++;
  state.teachers = []; state.groups = []; state.students = []; state.activeGroupId = null;
  state.notifications = []; state.ads = []; state.groupDocs = []; state.attendance = []; state.workPlan = [];
  state.allGroupsAdmin = []; state.allStudentsAdmin = []; state.modal = null; state.adDismissed = false;
}
