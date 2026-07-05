/* =========================================================
   TEAM — вкладка "Команда" в админке (выдача ролей helper/admin)
   и панель хелпера (поиск пользователя по email)
   ========================================================= */

/* ---------- Админка: вкладки Тарифы / Команда ---------- */
function setAdminTab(tab){
  document.getElementById("adminTabPlans").classList.toggle("active", tab === "plans");
  document.getElementById("adminTabTeam").classList.toggle("active", tab === "team");
  document.getElementById("adminPanePlans").classList.toggle("hidden", tab !== "plans");
  document.getElementById("adminPaneTeam").classList.toggle("hidden", tab !== "team");
  if (tab === "team") loadTeamList();
}

async function findUserByEmail(){
  const email = document.getElementById("teamSearchEmail").value.trim().toLowerCase();
  const box = document.getElementById("teamSearchResult");
  if (!email){ box.innerHTML = ""; return; }
  box.innerHTML = `<p class="hint">Ищем…</p>`;

  const snap = await db.collection("users").where("email", "==", email).limit(1).get();
  if (snap.empty){
    box.innerHTML = `<p class="hint">Пользователь с таким email не найден.</p>`;
    return;
  }
  const doc = snap.docs[0];
  const u = doc.data();
  box.innerHTML = renderTeamRow(doc.id, u, true);
}

function renderTeamRow(uid, u, standalone){
  const role = u.role || "user";
  const wrap = standalone ? "list-item" : "";
  return `
    <div class="${wrap}" style="padding:14px 0; display:flex; align-items:center; gap:14px;">
      <img class="avatar" src="${avatarFallback(u)}">
      <div class="li-body">
        <div class="li-name">${escapeHtml(u.name || "Без имени")}</div>
        <div class="li-sub">${escapeHtml(u.email || "")} • роль: ${escapeHtml(role)}</div>
      </div>
      <div class="row gap-8">
        <button class="btn btn-sm ${role==='helper' ? 'btn-gold' : 'btn-ghost'}" onclick="setUserRole('${uid}','helper')">Хелпер</button>
        <button class="btn btn-sm ${role==='admin' ? 'btn-gold' : 'btn-ghost'}" onclick="setUserRole('${uid}','admin')">Админ</button>
        ${role !== 'user' ? `<button class="btn btn-sm btn-danger" onclick="setUserRole('${uid}','user')">Снять роль</button>` : ""}
      </div>
    </div>`;
}

async function setUserRole(uid, role){
  await db.collection("users").doc(uid).update({ role });
  toast("Роль обновлена");
  if (!document.getElementById("adminPaneTeam").classList.contains("hidden")){
    loadTeamList();
    document.getElementById("teamSearchResult").innerHTML = "";
  }
}

async function loadTeamList(){
  const body = document.getElementById("teamTableBody");
  body.innerHTML = `<tr><td colspan="4">Загрузка…</td></tr>`;
  const snap = await db.collection("users").where("role", "in", ["helper","admin"]).get().catch(() => ({docs:[]}));
  if (!snap.docs.length){
    body.innerHTML = `<tr><td colspan="4">Пока никто не назначен.</td></tr>`;
    return;
  }
  body.innerHTML = snap.docs.map(d => {
    const u = d.data();
    return `<tr>
      <td>${escapeHtml(u.name || "—")}</td>
      <td>${escapeHtml(u.email || "—")}</td>
      <td>${escapeHtml(u.role)}</td>
      <td><button class="btn btn-sm btn-danger" onclick="setUserRole('${d.id}','user')">Снять</button></td>
    </tr>`;
  }).join("");
}

/* ---------- Панель хелпера ---------- */
async function helperFindUser(){
  const email = document.getElementById("helperSearchEmail").value.trim().toLowerCase();
  const box = document.getElementById("helperSearchResult");
  if (!email){ box.innerHTML = ""; return; }
  box.innerHTML = `<p class="hint">Ищем…</p>`;

  const snap = await db.collection("users").where("email", "==", email).limit(1).get();
  if (snap.empty){
    box.innerHTML = `<p class="hint">Пользователь с таким email не найден.</p>`;
    return;
  }
  const doc = snap.docs[0];
  const u = doc.data();
  const banned = !!u.banned;
  box.innerHTML = `
    <div style="padding:16px 0; display:flex; align-items:center; gap:14px;">
      <img class="avatar" src="${avatarFallback(u)}">
      <div class="li-body">
        <div class="li-name">${escapeHtml(u.name || "Без имени")}</div>
        <div class="li-sub">${escapeHtml(u.email || "")} ${u.phone ? "• " + escapeHtml(u.phone) : ""}</div>
        <div class="li-sub">${escapeHtml(u.bio || "Без описания")}</div>
      </div>
      <button class="btn btn-sm ${banned ? 'btn-ghost' : 'btn-danger'}" onclick="toggleBan('${doc.id}', ${!banned})">${banned ? "Снять блокировку" : "Заблокировать"}</button>
    </div>`;
}

// Блокировка — служебный флаг для модерации. Чтобы она реально ограничивала
// действия (например, отправку сообщений), доработайте firestore.rules:
// добавьте проверку !get(.../users/$(uid)).data.banned в правило создания
// сообщений — сейчас поле только видно хелперу/админу и хранится в профиле.
async function toggleBan(uid, value){
  await db.collection("users").doc(uid).update({ banned: value });
  toast(value ? "Пользователь заблокирован" : "Блокировка снята");
  helperFindUser();
}
