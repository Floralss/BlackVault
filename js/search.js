/* =========================================================
   SEARCH — люди, каналы, группы + сопоставление контактов
   Firestore не умеет в LIKE '%text%', поэтому здесь простой
   вариант "начинается с" через диапазон по nameLower.
   Для продакшена лучше подключить Algolia/Typesense.
   ========================================================= */
let searchFilter = "all";

function setSearchFilter(f){
  searchFilter = f;
  document.querySelectorAll("#searchFilters .chip").forEach(c => c.classList.toggle("active", c.dataset.f === f));
  runSearch(document.getElementById("listSearchInput").value);
}

function renderSearchListEmpty(){
  document.getElementById("listScroll").innerHTML =
    `<div class="empty-state"><div class="seal">🔎</div><p>Начните вводить имя человека, канала или группы.</p></div>`;
}

async function runSearch(qRaw){
  const q = qRaw.trim();
  if (!q){ renderSearchListEmpty(); return; }
  const qLower = q.toLowerCase();
  const end = qLower + "\uf8ff";
  const wrap = document.getElementById("listScroll");
  wrap.innerHTML = `<div class="empty-state"><p>Ищем «${escapeHtml(q)}»…</p></div>`;

  const results = [];

  if (searchFilter === "all" || searchFilter === "people"){
    const usersSnap = await db.collection("users")
      .orderBy("nameLower")
      .startAt(qLower).endAt(end)
      .limit(15).get().catch(()=>({docs:[]}));
    usersSnap.docs.forEach(d => {
      if (d.id === currentUser.uid) return;
      results.push({ type:"person", id:d.id, data:d.data() });
    });
  }
  if (searchFilter === "all" || searchFilter === "channels"){
    const chSnap = await db.collection("channels")
      .orderBy("nameLower").startAt(qLower).endAt(end)
      .limit(15).get().catch(()=>({docs:[]}));
    chSnap.docs.forEach(d => results.push({ type:"channel", id:d.id, data:d.data() }));
  }
  if (searchFilter === "all" || searchFilter === "groups"){
    const grSnap = await db.collection("groups")
      .orderBy("nameLower").startAt(qLower).endAt(end)
      .limit(15).get().catch(()=>({docs:[]}));
    grSnap.docs.forEach(d => results.push({ type:"group", id:d.id, data:d.data() }));
  }

  if (!results.length){
    wrap.innerHTML = `<div class="empty-state"><div class="seal">B</div><p>Ничего похожего на «${escapeHtml(q)}» не нашлось.</p></div>`;
    return;
  }

  wrap.innerHTML = results.map(r => {
    const d = r.data;
    const iconSrc = r.type === "channel" ? "icons/channel.svg" : r.type === "group" ? "icons/group.svg" : null;
    const avatar = iconSrc
      ? `<div class="avatar"><img class="icon icon-sm" src="${iconSrc}" alt=""></div>`
      : `<img class="avatar" src="${avatarFallback(d)}">`;
    const sub = r.type === "person" ? (d.handle || "") : `${r.type === "channel" ? "Канал" : "Группа"} • ${d.membersCount || 0} участников`;
    return `
      <div class="list-item" onclick="openSearchResult('${r.type}','${r.id}')">
        ${avatar}
        <div class="li-body">
          <div class="li-name">${escapeHtml(d.name)} ${d.premium ? '<img class="icon icon-sm" src="icons/verified.svg" alt="Premium">' : ""}</div>
          <div class="li-sub">${escapeHtml(sub)}</div>
        </div>
      </div>`;
  }).join("");
}

function openSearchResult(type, id){
  if (type === "person"){
    startChatWith(id);
  } else {
    toast("Открытие каналов/групп — в разработке в этой сборке");
  }
}

// Сопоставление контактов телефонной книги (вызывается, например, после
// импорта контактов через File/Contact Picker API на мобильном).
async function matchContacts(phoneNumbers){
  if (!phoneNumbers || !phoneNumbers.length) return [];
  const chunks = [];
  for (let i=0;i<phoneNumbers.length;i+=10) chunks.push(phoneNumbers.slice(i,i+10));
  const found = [];
  for (const chunk of chunks){
    const snap = await db.collection("users").where("phone","in", chunk).get();
    snap.docs.forEach(d => found.push({ id:d.id, ...d.data() }));
  }
  return found;
}
