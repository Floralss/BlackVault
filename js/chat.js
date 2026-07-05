/* =========================================================
   CHAT — открытие диалога, отправка сообщений, статусы
   прочтения, разделители по датам, блокировка Premium-only
   ========================================================= */
let activeChatId = null;
let activeOtherUid = null;
let unsubscribeMessages = null;

async function startChatWith(otherUid){
  const chatId = [currentUser.uid, otherUid].sort().join("_");
  const ref = db.collection("chats").doc(chatId);
  const snap = await ref.get();

  if (!snap.exists){
    await ref.set({
      members: [currentUser.uid, otherUid],
      lastMessage: "",
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      unread: { [currentUser.uid]: 0, [otherUid]: 0 }
    });
  }
  openChat(chatId, otherUid);
}

async function openChat(chatId, otherUid){
  activeChatId = chatId;
  activeOtherUid = otherUid;

  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-chat-open").classList.add("active");
  document.querySelectorAll("#listScroll .list-item").forEach(li => li.classList.toggle("active", li.dataset.chatId === chatId));
  openChatMobile();

  const otherSnap = await db.collection("users").doc(otherUid).get();
  const other = otherSnap.exists ? otherSnap.data() : { name:"Пользователь" };

  document.getElementById("chatAvatar").src = avatarFallback(other);
  document.getElementById("chatName").innerHTML = escapeHtml(other.name) + (other.premium ? ' <img class="icon icon-sm" src="icons/verified.svg" alt="Premium">' : "");
  document.getElementById("chatStatus").textContent = other.online
    ? "в сети"
    : (other.privacy && other.privacy.onlyPremiumCanMessage ? "Только для Black Premium" : "не в сети");

  // Проверка ограничения "писать может только Premium"
  const iAmPremium = !!(currentUserData && currentUserData.premium);
  const locked = other.privacy && other.privacy.onlyPremiumCanMessage && !iAmPremium && otherUid !== currentUser.uid;
  document.getElementById("chatPremiumLock").classList.toggle("hidden", !locked);
  document.getElementById("chatInputRow").classList.toggle("hidden", locked);
  document.getElementById("chatBody").classList.toggle("hidden", locked);

  // Сбрасываем счётчик непрочитанных для меня при открытии чата
  db.collection("chats").doc(chatId).update({ [`unread.${currentUser.uid}`]: 0 }).catch(()=>{});

  if (unsubscribeMessages) unsubscribeMessages();
  unsubscribeMessages = db.collection("chats").doc(chatId).collection("messages")
    .orderBy("createdAt", "asc")
    .onSnapshot(renderMessages);
}

function sameDay(a, b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function formatDateDivider(d){
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
  if (sameDay(d, today)) return "Сегодня";
  if (sameDay(d, yesterday)) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day:"numeric", month:"long" });
}

function renderMessages(qs){
  const body = document.getElementById("chatBody");
  let lastDate = null;
  const parts = [];

  qs.docs.forEach(d => {
    const m = d.data();
    const mine = m.senderId === currentUser.uid;
    const date = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate() : new Date();

    if (!lastDate || !sameDay(lastDate, date)){
      parts.push(`<div class="date-divider">${formatDateDivider(date)}</div>`);
      lastDate = date;
    }

    const time = date.getHours().toString().padStart(2,"0") + ":" + date.getMinutes().toString().padStart(2,"0");
    const readIcon = mine
      ? `<img class="icon" src="icons/${m.read ? "check-double" : "check-single"}.svg" alt="">`
      : "";

    parts.push(`
      <div class="msg ${mine ? "out" : "in"}">
        ${escapeHtml(m.text)}
        <div class="msg-meta">${time} ${readIcon}</div>
      </div>`);
  });

  body.innerHTML = parts.join("");
  body.scrollTop = body.scrollHeight;

  // Помечаем входящие сообщения прочитанными, раз чат открыт
  qs.docs.forEach(d => {
    const m = d.data();
    if (m.senderId !== currentUser.uid && !m.read){
      d.ref.update({ read: true }).catch(()=>{});
    }
  });
}

async function sendMessage(){
  const input = document.getElementById("chatMessageInput");
  const text = input.value.trim();
  if (!text || !activeChatId) return;
  input.value = "";

  const chatRef = db.collection("chats").doc(activeChatId);
  await chatRef.collection("messages").add({
    text,
    senderId: currentUser.uid,
    read: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await chatRef.update({
    lastMessage: text,
    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
    [`unread.${activeOtherUid}`]: firebase.firestore.FieldValue.increment(1)
  });
}
