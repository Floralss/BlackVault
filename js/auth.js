/* =========================================================
   AUTH — регистрация и вход по email или по телефону
   ========================================================= */
let mode = "login";      // 'login' | 'register'
let channel = "email";   // 'email' | 'phone'
let confirmationResult = null;

function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2600);
}
function showError(msg){ document.getElementById("authError").textContent = msg || ""; }

function setMode(m){
  mode = m;
  document.getElementById("tabLogin").classList.toggle("active", m==="login");
  document.getElementById("tabRegister").classList.toggle("active", m==="register");
  document.getElementById("nameField").classList.toggle("hidden", m!=="register");
  document.getElementById("formTitle").textContent = m==="login" ? "С возвращением" : "Создать аккаунт";
  document.getElementById("formSub").textContent = m==="login"
    ? "Войдите, чтобы продолжить общение"
    : "Регистрация займёт меньше минуты";
  document.getElementById("submitBtn").textContent = m==="login" ? "Войти" : "Зарегистрироваться";
  document.getElementById("switchModeText").innerHTML = m==="login"
    ? 'Нет аккаунта? <a onclick="setMode(\'register\')">Создать</a>'
    : 'Уже есть аккаунт? <a onclick="setMode(\'login\')">Войти</a>';
  showError("");
}

function setChannel(c){
  channel = c;
  document.getElementById("tabEmail").classList.toggle("active", c==="email");
  document.getElementById("tabPhone").classList.toggle("active", c==="phone");
  document.getElementById("emailField").classList.toggle("hidden", c!=="email");
  document.getElementById("passField").classList.toggle("hidden", c!=="phone" ? false : true);
  document.getElementById("phoneField").classList.toggle("hidden", c!=="phone");
  document.getElementById("codeField").classList.add("hidden");
  confirmationResult = null;
  showError("");
}

function ensureRecaptcha(){
  if (window.recaptchaVerifier) return;
  window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier("recaptcha-container", {
    size: "invisible"
  });
}

async function handleSubmit(){
  showError("");
  const name = document.getElementById("displayName").value.trim();

  if (channel === "email"){
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    if (!email || !password){ showError("Заполните почту и пароль."); return; }

    try{
      if (mode === "register"){
        if (!name){ showError("Укажите имя пользователя."); return; }
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        await createUserDocument(cred.user, { name, email });
      } else {
        await auth.signInWithEmailAndPassword(email, password);
      }
      window.location.href = "app.html";
    } catch(e){
      showError(translateAuthError(e));
    }

  } else {
    // Телефон: 1) отправляем код 2) подтверждаем код
    const phone = document.getElementById("phone").value.trim();
    const codeFieldHidden = document.getElementById("codeField").classList.contains("hidden");

    if (codeFieldHidden){
      if (!phone.startsWith("+")){ showError("Введите номер в международном формате, например +380..."); return; }
      try{
        ensureRecaptcha();
        confirmationResult = await auth.signInWithPhoneNumber(phone, window.recaptchaVerifier);
        document.getElementById("codeField").classList.remove("hidden");
        document.getElementById("submitBtn").textContent = "Подтвердить код";
        toast("Код отправлен по SMS");
      } catch(e){
        showError(translateAuthError(e));
      }
    } else {
      const code = document.getElementById("smsCode").value.trim();
      if (!code){ showError("Введите код из SMS."); return; }
      try{
        const cred = await confirmationResult.confirm(code);
        if (mode === "register" && name){
          await cred.user.updateProfile({ displayName: name });
        }
        await createUserDocument(cred.user, { name: name || cred.user.phoneNumber, phone: cred.user.phoneNumber });
        window.location.href = "app.html";
      } catch(e){
        showError(translateAuthError(e));
      }
    }
  }
}

// Создаёт/дополняет документ пользователя в Firestore при первом входе.
// Номер телефона и контакты пользователя хранятся здесь, чтобы Black мог
// потом сопоставлять контакты (см. search.js -> matchContacts()).
async function createUserDocument(user, extra){
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  if (snap.exists) return;

  const finalName = extra.name || "Новый пользователь";
  await ref.set({
    uid: user.uid,
    name: finalName,
    nameLower: finalName.toLowerCase(),
    handle: "@" + (user.uid.slice(0,8)),
    email: extra.email || user.email || null,
    phone: extra.phone || user.phoneNumber || null,
    bio: "",
    avatarUrl: null,
    musicUrl: null,
    musicTitle: null,
    premium: false,
    privacy: {
      hidePhone: true,
      hideAvatar: false,
      onlyPremiumCanMessage: false
    },
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function translateAuthError(e){
  const map = {
    "auth/email-already-in-use": "Этот email уже зарегистрирован.",
    "auth/invalid-email": "Некорректный email.",
    "auth/weak-password": "Пароль слишком простой (мин. 6-8 символов).",
    "auth/wrong-password": "Неверный пароль.",
    "auth/user-not-found": "Пользователь не найден.",
    "auth/invalid-phone-number": "Некорректный номер телефона.",
    "auth/invalid-verification-code": "Неверный код из SMS.",
    "auth/too-many-requests": "Слишком много попыток. Попробуйте позже."
  };
  return map[e.code] || (e.message || "Что-то пошло не так.");
}

// если уже залогинен — сразу в приложение
auth.onAuthStateChanged(user => {
  if (user && window.location.pathname.endsWith("index.html") || (user && window.location.pathname==="/")) {
    window.location.href = "app.html";
  }
});
