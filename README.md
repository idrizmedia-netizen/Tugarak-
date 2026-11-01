# TUGARAK+ — to'garak boshqaruv tizimi

Maktabdan tashqari to'garaklarni boshqarish: o'qituvchi ro'yxatdan o'tishi, administrator tasdiqlashi,
guruh va o'quvchilar, baholash, davomat, yillik ish reja, hujjatlar, hamkor o'qituvchilar, obuna rejalari,
reklama va bildirishnomalar. Uch tilli interfeys (uz / ru / en), tun/kun rejimi, PWA.

**Texnologiyalar:** Vite · Firebase (Authentication + Firestore, Spark/bepul reja) · Vercel.

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `src/firebase.js` | Firebase ulanishi |
| `src/auth.js` | Kirish/ro'yxatdan o'tish, Google (popup + redirect), admin tekshiruvi (`admins/{uid}`) |
| `src/db.js` | Firestore amallari (tekshiruv, writeBatch, to'liq tozalash bilan guruh o'chirish) |
| `src/main.js` | Butun interfeys va holat boshqaruvi |
| `src/i18n.js` | Tarjimalar (uz/ru/en) va shartnoma matni |
| `src/importParsers.js` | Excel/CSV/Word'dan o'quvchilar ro'yxatini import qilish (kutubxonalar kerak bo'lganda yuklanadi) |
| `src/lib/*.js` | Toza mantiq (DOM va Firebase'siz, shuning uchun sinab ko'riladi): sanalar, baholar va choraklar, jurnal ustunlari va klaviatura, to'lov holati va eslatma matni, statistika, grafiklar, ota-ona havolasi |
| `src/styles.css` | Dizayn tizimi |
| `tests/` | Avtomatik sinovlar (`npm test`) |
| `firestore.rules` | Xavfsizlik qoidalari — **o'zgartirgach Firebase Console → Firestore → Rules ga qo'yib "Publish" qiling** |
| `vercel.json` | SPA yo'naltirish va xavfsizlik sarlavhalari |

## Ishga tushirish

1. `.env.example` ni `.env` ga nusxalab, Firebase kalitlarini kiriting (`VITE_FIREBASE_*`).
2. `npm install` → `npm run dev`. **Birinchi marta o'rnatgandan keyin paydo bo'lgan `package-lock.json` ni ham GitHub'ga yuklang** — shunda Vercel har safar aynan bir xil versiyalarni o'rnatadi.
3. Vercel'da shu o'zgaruvchilarni **Environment Variables** ga kiriting.
4. Firebase Console → Authentication → Settings → **Authorized domains** ga Vercel domenini qo'shing.

> `VITE_ADMIN_EMAILS` butunlay olib tashlandi — agar Vercel'da qolgan bo'lsa, uni o'chiring.

## Birinchi administratorni yaratish

1. Saytda "Administrator" orqali Google bilan bir marta kiring (yoki Authentication → Users dan UID ni oling).
2. Firebase Console → Firestore → `admins` kolleksiyasi → **Add document**, Document ID = admin UID,
   maydon: `grantedAt` (timestamp) yoki istalgan maydon.
3. Sahifani yangilang. Qoidalar admin yozuvini faqat konsoldan yaratishga ruxsat beradi.

## Xavfsizlik (muhim)

- Ma'lumot yozish faqat **administrator tasdiqlagan** o'qituvchilarga ruxsat (qoidalarda).
- O'quvchi/davomat/hujjat/ish reja ma'lumotlariga **faqat guruh egasi va hamkorlari** kira oladi.
- `users` hujjatlarini faqat o'zi va administrator o'qiydi. Hamkor qo'shish `teacherDirectory/{email}` orqali
  ishlaydi (administrator o'qituvchini tasdiqlaganda yoziladi; mavjud o'qituvchilar uchun admin birinchi
  kirganda bir martalik avtomatik ko'chiriladi).
- Interfeysga qo'yiladigan har qanday Firestore qiymati tozalanadi (rasm/havola/fayl/baho) — XSS himoyasi.
- Brauzerdagi "3 xato → 30 soniya blok" faqat qo'shimcha himoya. Haqiqiy himoya Firebase Auth'ning
  `too-many-requests` cheklovi; kuchliroq himoya uchun Firebase **App Check** (reCAPTCHA) ni yoqing
  (pastdagi "App Check yoqish" bo'limi).
- Email/parol bilan ro'yxatdan o'tganlarga tasdiqlash xati yuboriladi. Tasdiqlanmagan o'qituvchiga sariq eslatma
  chiqadi, admin ariza ro'yxatida esa email holati ("tasdiqlangan" / "tasdiqlanmagan") ko'rinadi. Holat
  `users/{uid}.emailVerified` ga yoziladi va qoidalar uni Firebase tokenidagi haqiqiy qiymat bilan solishtiradi.
- Admin o'qituvchini **bloklashi** mumkin (status `blocked`): yozish va o'qish huquqi yopiladi, ma'lumotlar saqlanadi.
- Firebase kalitini Google Cloud Console → Credentials'da faqat o'z domeningizga (HTTP referrer) cheklang.
- `vercel.json` dagi CSP hozir **Report-Only** rejimida. Saytni ochib, F12 → Console'da CSP xatosi
  yo'qligiga ishonch hosil qilgach, `Content-Security-Policy-Report-Only` kalitini `Content-Security-Policy`
  ga o'zgartiring.

## Jurnal (maktab jurnali ko'rinishi)

- Guruh sahifasida ikki bo'lim bor: **📒 Jurnal** va **📊 Ko'rsatkichlar** (o'rtacha, daraja, davomat foizi, to'lov, tahrirlash).
- Guruh egasi **📅 Dars kunlari** orqali hafta kunlarini tanlaydi (masalan Du, Chor, Ju); tanlangan oyning shu kunlari
  jurnalda sana ustunlari bo'ladi (`groups/{id}.weekdays`, 1=dushanba ... 7=yakshanba).
- Katakni bosib baho (5/4/3/2) qo'yiladi; baho shu sanaga yoziladi (`grade.day = "YYYY-MM-DD"`). Eski baholar
  (`day` yo'q) qo'yilgan sanasi bo'yicha ko'rinadi — dars kuni bo'lmasa, `*` belgili qo'shimcha ustunda.
- Sana sarlavhasini bosish shu kun davomatini ochadi; davomatda kelmagan o'quvchi katakda **Y** belgisi bilan ko'rinadi.
- **＋ Sana** dars kunidan tashqari sanani qo'shish, **🖨 Chop etish** oylik jurnalni A4 (albom) chop etish/PDF uchun.
- **⌨ Klaviatura bilan tez baholash:** katakni bosib tanlang (sensorli ekranda bosish avvalgidek oynani ochadi),
  keyin `↑ ↓ ← →` — yurish, `5 4 3 2` — baho, `Del`/`Backspace` — shu kundagi oxirgi bahoni o'chirish,
  `Enter` yoki ikki marta bosish — oyna, `Esc` — tanlovni bekor qilish. Katakda bitta baho bo'lsa yangi raqam uni
  almashtiradi; bir nechta bo'lsa yangisi qo'shiladi (oynadagi kabi). Obuna tugagan (qulflangan) guruhda faqat yurish mumkin.
- **Σ Choraklar** tugmasi jurnalning o'ng chetiga ustunlar qo'shadi: **oy o'rtachasi**, **I–IV chorak** va **yillik**.
  Katak ichidagi kulrang raqam — baholarning avtomatik o'rtachasi; katakni bosib **qo'lda baho** (5/4/3/2) qo'yilsa, u
  o'rtachadan ustun turadi va qalin ko'rinadi (`students/{id}.qGrades = { q1, q2, q3, q4, year }`). Tugma holati
  brauzerda eslab qolinadi; yoqilgan bo'lsa chop etishda ham chiqadi. Yangi o'quv yilida qo'lda baholar ham arxivga ko'chadi.
- **Excel eksporti** (Hisobotlar → Excel) ko'rilayotgan oyning jurnalini ham alohida varaq (`Jurnal YYYY-MM`) qilib qo'shadi:
  sanalar × o'quvchilar, kelmaganlar **Y**, oxirida oy o'rtachasi, choraklar va yillik.

## Ko'rsatkichlar: grafiklar va to'lov eslatmasi

- **📈 Grafiklar** (Ko'rsatkichlar bo'limi, o'quvchi jadvali ostida): guruh o'rtachasi oylar bo'yicha, davomat dinamikasi (%),
  eng ko'p o'sgan 5 o'quvchi (birinchi va oxirgi baholangan oy o'rtachasi farqi; kamida ikki xil oyda baho kerak).
  Grafiklar tashqi kutubxonasiz, SVG bilan chiziladi.
- **Eslatma** tugmasi muddati o'tgan (yoki 3 kun ichida tugaydigan) o'quvchi yonida chiqadi: tayyor xabar matni
  (uz/ru/en, tilni tanlash va matnni tahrirlash mumkin) → **Nusxalash**, **Telegram** yoki **SMS** orqali ulashish.
  Xabar o'z-o'zidan yuborilmaydi — qabul qiluvchini o'qituvchi o'zi tanlaydi (avtomatik yuborish uchun server/Blaze reja kerak bo'ladi).
  Ota-onaning telefon raqami saqlanmaydi.

## Ota-onalar uchun faqat o'qish havolasi

O'qituvchi Ko'rsatkichlar → o'quvchi qatoridagi **👪 Ota-ona** tugmasi orqali havola yaratadi: `https://<domen>/p/<kalit>`.
Ota-ona ro'yxatdan o'tmasdan farzandining baho, davomat va chorak baholarini ko'radi.

**Himoya modeli (qaror qilingan kelishuv):**
- Havola — 192 bitli tasodifiy kalit. Kalitni bilgan kishi **faqat shu bitta** `parentLinks/{kalit}` hujjatini o'qiy oladi
  (qoidalarda `get` ochiq, `list` faqat guruh a'zolariga). Kalitni taxmin qilib bo'lmaydi, lekin **havolani olgan har kim ko'radi** —
  shu sabab uni faqat ota-onaga yuboring.
- **Ko'rinadi:** ism, guruh va fan nomi, baholar (sana bilan), davomat, chorak/yillik baholar. **Ko'rinmaydi:** telefon, manzil,
  tug'ilgan kun, rasm, to'lovlar, sinf, boshqa o'quvchilar. Hujjat qoidalar bilan ham shu maydonlarga cheklangan.
- Ma'lumot **surat (snapshot)** sifatida yoziladi: havola yaratilganda, **🔄 Ma'lumotni yangilash** bosilganda yoki
  Guruh sozlamalari → **Ota-ona havolalarini yangilash** (guruhdagi hammasi) bosilganda. Avtomatik yangilanmaydi
  (har bahoda yozish Spark limitini tez sarflardi) — ota-ona ko'rayotgan ma'lumot oxirgi yangilashdagi holat.
- O'qituvchi havolani istalgan vaqtda **o'chira oladi** (shundan so'ng ochilmaydi). O'quvchi yoki guruh o'chirilsa, havola ham o'chadi.
  Muddat (expiry) hozircha yo'q.
- Sahifa qidiruv tizimlariga yopiq (`noindex`, `X-Robots-Tag`), `Referrer-Policy: no-referrer`, keshlanmaydi (`vercel.json`).
- Bolalar shaxsiy ma'lumotini ulashishdan oldin ota-onalar roziligi va amaldagi qonunchilik talablarini tekshiring.

> **Qoidalarni yangilang:** `firestore.rules` da `students.qGrades` va `parentLinks` qo'shilgan. Ularni Firebase Console'da **Publish** qilmaguncha
> chorak baholari va ota-ona havolalari `permission-denied` beradi.

## Sinovlar

`npm install` → `npm test` (vitest + jsdom). 100 dan ortiq sinov: sana/to'lov hisoblari, jurnal ustunlari va klaviatura mantiqi, chorak
baholari, statistika va grafiklar, eslatma matni, Excel varag'i, tarjimalar (uz/ru/en kalitlari va `{o'rin}` belgilari mosligi),
XSS ekranlash, ota-ona hujjatida shaxsiy ma'lumot yo'qligi, `firestore.rules` qamrovi (kod yozadigan maydonlar qoidalarda bormi)
hamda `main.js` ni soxta Firebase bilan ishga tushirib ko'radigan interfeys sinovlari. **Qoidalarning o'zi emulyatorda sinalmagan** —
o'zgartirgach Firebase Rules Playground yoki emulyatorda tekshiring.

## App Check yoqish (reCAPTCHA v3)

Tartibga qat'iy rioya qiling: avval kalit va deploy, **oxirida** Enforce. Aks holda hamma foydalanuvchi bloklanib qoladi.

1. https://www.google.com/recaptcha/admin → **Create** → turi **reCAPTCHA v3** → domenlar: Vercel domeningiz
   (masalan `tugarak.vercel.app`) va `localhost`. Ikkita kalit beriladi: **site key** va **secret key**.
2. Firebase Console → **App Check** → **Apps** → veb-ilovangiz → **reCAPTCHA** → **secret key**'ni kiriting → Save.
3. **Site key**'ni Vercel → Settings → Environment Variables'ga `VITE_RECAPTCHA_SITE_KEY` nomi bilan qo'shing
   va loyihani qayta deploy qiling.
4. Saytni oching, bir-ikki kun ishlatib, App Check → **Requests** (Metrics) bo'limida so'rovlarning
   "verified" ekanini ko'ring.
5. Hammasi to'g'ri bo'lsa: App Check → **APIs** → **Cloud Firestore** → **Enforce** (kerak bo'lsa Authentication ham).
6. Mahalliy ishlab chiqish (`npm run dev`): brauzer konsoliga "App Check debug token" chiqadi. Uni Console →
   App Check → ilovangiz → **Manage debug tokens** ga qo'shing.

## Ma'lum cheklovlar

- Obuna cheklovlari (guruh/o'quvchi soni) hozircha faqat brauzerda tekshiriladi; server tomonda majburlash
  uchun Cloud Functions (Blaze reja) kerak.
- Rasm va hujjatlar Firestore hujjatida base64 ko'rinishida saqlanadi (Storage ishlatilmaydi). Hujjat hajmi
  1 MB bilan cheklangan; rasmlar 480px gacha siqiladi, fayllar 500 KB gacha.
- **Yangi o'quv yili:** guruh egasi "Guruh sozlamalari → Yangi o'quv yilini boshlash" orqali joriy baholarni
  o'quvchilarning arxiviga (yil nomi bilan, eng ko'pi 10 yil) ko'chiradi va baholarni tozalaydi. O'quvchilar,
  to'lovlar, hujjatlar, ish reja va davomat yozuvlari saqlanadi; davomat foizi yangi yil boshlangan sanadan
  hisoblanadi (eski davomatni "Davomat hisoboti"da oy bo'yicha ko'rish mumkin). Amalni qaytarib bo'lmaydi.
- Arxiv faqat o'quvchi kartasidagi "Arxiv" oynasida ko'rinadi; eksport va hisobotlar joriy yilni oladi.
