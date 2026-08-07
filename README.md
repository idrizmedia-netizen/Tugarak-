# TUGARAK+ — To'garak boshqaruv tizimi

Firebase (Authentication + Firestore) bilan ishlaydigan, GitHub → Vercel orqali deploy qilinadigan to'liq loyiha. To'liq **Spark (bepul) reja**da ishlaydi — Firebase Storage yoki boshqa pullik xizmat talab qilinmaydi.

Imkoniyatlar: Google yoki email/parol orqali o'qituvchi ro'yxatdan o'tishi, elektron shartnoma, administrator tasdiqlash paneli, guruh va o'quvchilar ro'yxati (qo'lda yoki qog'ozdagi ro'yxat rasmi orqali), baholash va avtomatik o'zlashtirish hisob-kitobi, tekshiruvchi uchun chop etish, tun/kun rejimi, mobil va kompyuter rejimlariga moslashuv, parolni tiklash, xato urinishlarda vaqtinchalik bloklash.

---

## 1-qadam — Firebase loyihasini yaratish

1. https://console.firebase.google.com ga kiring → **Add project** → nomini kiriting (masalan `tugarak-plus`) → yarating.
2. Chap menyudan **Build → Authentication** → **Get started**.
   - **Sign-in method** bo'limida **Email/Password**ni yoqing.
   - Xuddi shu yerda **Google**ni ham yoqing (Project support email tanlang).
3. **Build → Firestore Database** → **Create database** → **Production mode** → yaqin regionni tanlang.

> **Eslatma:** Bu loyiha **Firebase Storage'ni ishlatmaydi**, chunki Google 2024-yildan buni Blaze (pullik) rejaga bog'lab qo'ygan. O'quvchi rasmlari (qog'ozdagi ro'yxat) o'rniga brauzerda kichraytirilib, siqilgan holda **to'g'ridan-to'g'ri Firestore hujjatiga** (base64 shaklda) saqlanadi — bu **Spark (bepul) reja**da to'liq ishlaydi.

## 2-qadam — Veb-ilova sozlamalarini olish

1. Loyiha sozlamalari (⚙ belgisi) → **Project settings** → pastda **Your apps** → **</> (Web)** belgisini bosing.
2. Ilova nomini kiriting → **Register app**.
3. Ko'rsatilgan `firebaseConfig` qiymatlarini nusxalab, loyihadagi `.env.example` faylini `.env` deb nomlab, qiymatlarni shu yerga joylashtiring:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_ADMIN_EMAILS=admin@sizningmaktab.uz
```

## 3-qadam — Xavfsizlik qoidalarini joylashtirish

Loyihada tayyor `firestore.rules` fayli bor. Uni Firebase konsoliga joylashtiring:

**Variant A — konsol orqali (eng oson):**
- Firestore → **Rules** bo'limi → `firestore.rules` faylidagi matnni to'liq nusxalab joylashtiring → **Publish**.

**Variant B — Firebase CLI orqali:**
```bash
npm install -g firebase-tools
firebase login
firebase use --add        # loyihangizni tanlang
firebase deploy --only firestore:rules
```

## 4-qadam — Administrator hisobini yaratish (MUHIM)

Admin roli maxsus `admins/{uid}` hujjati orqali beriladi:

1. Avval oddiy tarzda saytda **"To'garak rahbari" → Ro'yxatdan o'tish** orqali (yoki Firebase konsoli → Authentication → Users → **Add user**) o'zingiz uchun email/parol bilan hisob yarating.
2. Firebase konsoli → Authentication → Users bo'limida shu foydalanuvchining **UID** qiymatini nusxalang.
3. Firestore Database → **Start collection** → nomi: `admins` → **Document ID**: yuqorida nusxalagan UID → istalgan maydon bilan (masalan `grantedAt: true`) saqlang.
4. Endi saytda **"Administrator" → Kirish** orqali shu email/parol bilan kirishingiz mumkin.

> `.env` dagi `VITE_ADMIN_EMAILS` faqat interfeysda tezroq aniqlash uchun yordamchi qiymat — asosiy va majburiy huquq baribir yuqoridagi `admins/{uid}` hujjati orqali beriladi (xavfsizlik qoidalari shuni tekshiradi).

## 5-qadam — Lokal ishga tushirish

```bash
npm install
npm run dev
```

Brauzerda `http://localhost:5173` ochiladi.

## 6-qadam — GitHub'ga yuklash

```bash
git init
git add .
git commit -m "TUGARAK+ boshlang'ich versiya"
git branch -M main
git remote add origin https://github.com/FOYDALANUVCHI_NOMI/tugarak-plus.git
git push -u origin main
```

`.env` fayli `.gitignore` orqali GitHub'ga yuklanmaydi — bu to'g'ri, chunki maxfiy kalitlarni Vercel'ga alohida qo'shasiz.

## 7-qadam — Vercel'ga deploy qilish

1. https://vercel.com → **Add New → Project** → GitHub repozitoriyangizni tanlang.
2. Vercel avtomatik **Vite** ekanini aniqlaydi (Build command: `npm run build`, Output directory: `dist`).
3. **Environment Variables** bo'limiga `.env` faylidagi barcha qiymatlarni (VITE_FIREBASE_* va VITE_ADMIN_EMAILS) bittalab qo'shing.
4. **Deploy** tugmasini bosing.

## 8-qadam — Google kirishni Vercel domenida ishlatish

Deploy tugagach, Vercel bergan domenni (masalan `tugarak-plus.vercel.app`) nusxalang va:
- Firebase konsoli → Authentication → **Settings → Authorized domains** → **Add domain** → shu domenni qo'shing.

Bu qadam bajarilmasa, Google orqali kirishda `auth/unauthorized-domain` xatosi chiqadi.

---

## Loyiha tuzilmasi

```
tugarak-plus/
├─ public/
│  ├─ logo-mark.svg      — belgi (favicon va ilova ichida)
│  └─ logo-full.svg      — to'liq logotip (belgi + "TUGARAK+" yozuvi)
├─ src/
│  ├─ firebase.js        — Firebase ulanishi
│  ├─ auth.js            — ro'yxatdan o'tish, kirish, parol tiklash, admin tekshiruvi
│  ├─ db.js               — Firestore: o'qituvchilar, guruhlar, o'quvchilar
│  ├─ styles.css          — dizayn tizimi (tun/kun rejimi shu yerda)
│  └─ main.js             — butun interfeys, holat boshqaruvi va rasm siqish
├─ firestore.rules
├─ firebase.json
└─ index.html
```

## Xavfsizlik bo'yicha eslatmalar

- Xato parol kiritishda bloklash (3 urinishdan keyin 30 soniya) hozircha brauzer darajasida (`localStorage`) ishlaydi — asosiy demo darajasidagi himoya. To'liq server darajasidagi himoya uchun kelajakda **Firebase App Check** yoki **Cloud Functions** bilan kuchaytirish tavsiya etiladi.
- Parolni tiklash Firebase'ning o'zining email xizmati orqali ishlaydi (`sendPasswordResetEmail`) — real emailga havola boradi.
- Barcha ma'lumotlar (o'qituvchi, guruh, o'quvchi) xavfsizlik qoidalari orqali himoyalangan: har bir o'qituvchi faqat o'zining guruhi/o'quvchilarini ko'radi va tahrirlaydi, administrator esa hammasini ko'radi.
- **Rasmlar haqida:** qog'ozdagi ro'yxat surati brauzerda avtomatik ravishda kichraytirilib (480px gacha) va siqilib (JPEG, 60% sifat) Firestore hujjatiga saqlanadi. Bitta Firestore hujjati 1MB dan oshmasligi kerak bo'lgani uchun juda katta yoki juda ko'p tafsilotli rasmlar avtomatik siqiladi — bu odatiy telefon kamera suratlari uchun yetarli.

## Keyingi rivojlantirish g'oyalari

- Oylik/chorak bo'yicha alohida baho jadvali
- Excel (.xlsx) formatida eksport
- SMS/email orqali avtomatik bildirishnomalar
- Ko'p tilli interfeys (o'zbek/rus/ingliz)
