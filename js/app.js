/* =========================================================
   APP CORE — навигация, текущий пользователь, список чатов
   ========================================================= */
let currentUser = null;
let currentUserData = null;
let currentView = "chats";
let unsubscribeChats = null;

function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2600);
}

// --- Auth guard ---
auth.onAuthStateChanged(async (user) => {
  if (!user){
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  await loadCurrentUserData();
  applyTheme();
  goView("chats");
  loadChatsList();
});

async function loadCurrentUserData(){
  const snap = await db.collection("users").doc(currentUser.uid).get();
  currentUserData = snap.exists ? snap.data() : { name: currentUser.displayName || "Вы", privacy:{} };

  document.getElementById("navAvatar").src = avatarFallback(currentUserData);
  if (ADMIN_UIDS.includes(currentUser.uid)){
    document.getElementById("adminNavBtn").classList.remove("hidden");
  }
  renderProfile();
  renderSettings();
}

function avatarFallback(u){
  if (u.privacy && u.privacy.hideAvatar) return placeholderAvatar(u.name);
  return u.avatarUrl || placeholderAvatar(u.name);
}
function placeholderAvatar(name){
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="#221e1a"/><text x="50%" y="55%" font-size="34" fill="#e4c98a" font-family="Georgia" text-anchor="middle">${letter}</text></svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

// --- Навигация между вкладками ---
function goView(name){
  currentView = name;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));

  const views = ["chats","chat-open","search","profile","premium","settings","admin"];
  views.forEach(v => {
    const el = document.getElementById("view-" + v);
    if (el) el.classList.remove("active");
  });

  document.getElementById("listTitle").textContent = {
    chats:"Чаты", search:"Поиск", profile:"Профиль", premium:"Black Premium", settings:"Настройки", admin:"Админка"
  }[name] || "Black";

  document.getElementById("searchFilters").style.display = name === "search" ? "flex" : "none";
  document.getElementById("listSearchInput").placeholder = name === "search"
    ? "Введите имя, канал или группу…"
    : "Найти человека, канал, группу…";

  if (name === "chats"){
    document.getElementById("view-chats").classList.add("active");
    loadChatsList();
  } else if (name === "search"){
    document.getElementById("view-search").classList.add("active");
    renderSearchListEmpty();
  } else {
    document.getElementById("view-" + name).classList.add("active");
    if (name === "profile") renderProfile();
    if (name === "premium") loadPlans();
    if (name === "settings") renderSettings();
    if (name === "admin") loadAdminPlans();
  }
}

function onSearchInput(value){
  if (currentView === "search"){
    runSearch(value);
  } else {
    filterChatsList(value);
  }
}

// --- Список чатов ---
function loadChatsList(){
  if (unsubscribeChats) unsubscribeChats();
  unsubscribeChats = db.collection("chats")
    .where("members", "array-contains", currentUser.uid)
    .orderBy("lastMessageAt", "desc")
    .onSnapshot(renderChatsList, (err) => {
      // без индекса orderBy может упасть — покажем как есть
      db.collection("chats").where("members","array-contains", currentUser.uid)
        .onSnapshot(renderChatsList);
    });
}

async function renderChatsList(qs){
  const wrap = document.getElementById("listScroll");
  if (currentView !== "chats") return;
  if (qs.empty){
    wrap.innerHTML = `<div class="empty-state"><div class="seal">B</div><h3>Пока пусто</h3><p>Найдите собеседника через поиск и начните первый диалог.</p></div>`;
    return;
  }
  const rows = [];
  for (const doc of qs.docs){
    const chat = doc.data();
    const otherUid = (chat.members || []).find(m => m !== currentUser.uid);
    const other = chat.membersInfo ? chat.membersInfo[otherUid] : { name: chat.title || "Чат" };
    rows.push(`
      <div class="list-item" onclick="openChat('${doc.id}','${otherUid}')">
        <img class="avatar" src="${other.avatarUrl || placeholderAvatar(other.name)}">
        <div class="li-body">
          <div class="li-top">
            <span class="li-name">${escapeHtml(other.name || "Пользователь")}</span>
            <span class="li-time">${formatTime(chat.lastMessageAt)}</span>
          </div>
          <div class="li-sub">${escapeHtml(chat.lastMessage || "Нет сообщений")}</div>
        </div>
      </div>`);
  }
  wrap.innerHTML = rows.join("");
}

function filterChatsList(q){
  const items = document.querySelectorAll("#listScroll .list-item");
  items.forEach(it => {
    const name = it.querySelector(".li-name").textContent.toLowerCase();
    it.style.display = name.includes(q.toLowerCase()) ? "" : "none";
  });
}

function formatTime(ts){
  if (!ts || !ts.toDate) return "";
  const d = ts.toDate();
  return d.getHours().toString().padStart(2,"0") + ":" + d.getMinutes().toString().padStart(2,"0");
}

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function logout(){
  auth.signOut().then(() => window.location.href = "index.html");
}

/* ---------- Кастомизация темы: живёт в Firestore у пользователя,
   чтобы интерфейс выглядел так же на любом устройстве ---------- */
function applyTheme(){
  const theme = (currentUserData && currentUserData.theme) || {};
  if (theme.accent) setAccent(theme.accent, theme.accentSoft, false);
  if (theme.radius) setRadius(theme.radius, false);
}
