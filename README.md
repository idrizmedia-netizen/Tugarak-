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
| `src/styles.css` | Dizayn tizimi |
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
