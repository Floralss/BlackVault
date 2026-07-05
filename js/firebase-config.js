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

/* =========================================================
   РОЛИ
   Есть два способа стать админом:
   1) "Бутстрап-админ" — email или UID из списков ниже.
      Это тот, кто всегда имеет доступ, даже до того как в
      Firestore появится документ с ролью (например, самый
      первый запуск проекта). Уже вписан ваш email.
   2) Динамическая роль — поле role:"admin" / "helper" в
      документе users/{uid}. Её можно выдавать прямо из
      Админ-панели → вкладка "Команда", без правок кода.
   И то и другое ОБЯЗАТЕЛЬНО должно быть продублировано в
   firestore.rules — иначе это будет работать только "на вид"
   в интерфейсе, а не по-настоящему (см. README).
   ========================================================= */
const ADMIN_EMAILS = [
  "strepoomich27@gmail.com"
];
const ADMIN_UIDS = [
  // "МОЖНО_ТАКЖЕ_ВСТАВИТЬ_UID_ИЗ_FIREBASE_AUTH_ДЛЯ_НАДЁЖНОСТИ"
];

function isBootstrapAdmin(user){
  if (!user) return false;
  return ADMIN_UIDS.includes(user.uid) || (user.email && ADMIN_EMAILS.includes(user.email));
}
