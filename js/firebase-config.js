/* =========================================================
   FIREBASE CONFIG
   Важно: этот apiKey — публичный идентификатор проекта,
   Firebase так и задуман (он виден в devtools любого сайта
   на Firebase). Он НЕ является секретом.
   Настоящая защита данных — это Firestore/Storage Security
   Rules (firestore.rules / storage.rules в этой сборке) и,
   опционально, Firebase App Check. См. README.md.
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyBGFONUBgybQr0KCn_Ao_ZT9HkWVSU4jEw",
  authDomain: "black-social-af844.firebaseapp.com",
  projectId: "black-social-af844",
  storageBucket: "black-social-af844.firebasestorage.app",
  messagingSenderId: "296441938682",
  appId: "1:296441938682:web:096a3e642bd00116f7bf43",
  measurementId: "G-2PX2QMR8HS"
};

firebase.initializeApp(firebaseConfig);
try { firebase.analytics(); } catch (e) { /* аналитика не критична */ }

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Список UID администраторов, которым доступна /admin (панель тарифов Premium).
// В боевой версии лучше заменить на Firebase Custom Claims (см. README),
// потому что любой список во фронтенде виден в devtools — он не даёт прав
// сам по себе, реальная защита — правило в firestore.rules,
// которое проверяет этот же UID на сервере.
const ADMIN_UIDS = [
  // "СЮДА_ВСТАВИТЬ_UID_АДМИНА_ИЗ_FIREBASE_AUTH"
];
