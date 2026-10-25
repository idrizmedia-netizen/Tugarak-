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
  `too-many-requests` cheklovi; kuchliroq himoya uchun Firebase **App Check** (reCAPTCHA) ni yoqing.
- Firebase kalitini Google Cloud Console → Credentials'da faqat o'z domeningizga (HTTP referrer) cheklang.
- `vercel.json` dagi CSP hozir **Report-Only** rejimida. Saytni ochib, F12 → Console'da CSP xatosi
  yo'qligiga ishonch hosil qilgach, `Content-Security-Policy-Report-Only` kalitini `Content-Security-Policy`
  ga o'zgartiring.

## Ma'lum cheklovlar

- Obuna cheklovlari (guruh/o'quvchi soni) hozircha faqat brauzerda tekshiriladi; server tomonda majburlash
  uchun Cloud Functions (Blaze reja) kerak.
- Rasm va hujjatlar Firestore hujjatida base64 ko'rinishida saqlanadi (Storage ishlatilmaydi). Hujjat hajmi
  1 MB bilan cheklangan; rasmlar 480px gacha siqiladi, fayllar 500 KB gacha.
- Baholar o'quv yillari bo'yicha ajratilmaydi (faqat choraklik hisobot joriy o'quv yilini oladi).
