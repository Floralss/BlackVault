/* =========================================================
   CHAT — открытие диалога, отправка сообщений,
   проверка "писать может только Black Premium"
   ========================================================= */
let activeChatId = null;
let activeOtherUid = null;
let unsubscribeMessages = null;

async function startChatWith(otherUid){
  const chatId = [currentUser.uid, otherUid].sort().join("_");
  const ref = db.collection("chats").doc(chatId);
  const snap = await ref.get();

  const otherSnap = await db.collection("users").doc(otherUid).get();
  const other = otherSnap.exists ? otherSnap.data() : { name:"Пользователь" };

  if (!snap.exists){
    await ref.set({
      members: [currentUser.uid, otherUid],
      membersInfo: {
        [currentUser.uid]: { name: currentUserData.name, avatarUrl: avatarFallback(currentUserData) },
        [otherUid]: { name: other.name, avatarUrl: avatarFallback(other) }
      },
      lastMessage: "",
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
  openChat(chatId, otherUid);
}

async function openChat(chatId, otherUid){
  activeChatId = chatId;
  activeOtherUid = otherUid;

  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-chat-open").classList.add("active");

  const otherSnap = await db.collection("users").doc(otherUid).get();
  const other = otherSnap.exists ? otherSnap.data() : { name:"Пользователь" };

  document.getElementById("chatAvatar").src = avatarFallback(other);
  document.getElementById("chatName").innerHTML = escapeHtml(other.name) + (other.premium ? ' <span class="seal small">✓</span>' : "");
  document.getElementById("chatStatus").textContent = other.privacy && other.privacy.onlyPremiumCanMessage ? "Только для Black Premium" : "в сети";

  // Проверка ограничения "писать может только Premium"
  const iAmPremium = !!(currentUserData && currentUserData.premium);
  const locked = other.privacy && other.privacy.onlyPremiumCanMessage && !iAmPremium && otherUid !== currentUser.uid;
  document.getElementById("chatPremiumLock").classList.toggle("hidden", !locked);
  document.getElementById("chatInputRow").classList.toggle("hidden", locked);
  document.getElementById("chatBody").classList.toggle("hidden", locked);

  if (unsubscribeMessages) unsubscribeMessages();
  unsubscribeMessages = db.collection("chats").doc(chatId).collection("messages")
    .orderBy("createdAt", "asc")
    .onSnapshot(renderMessages);
}

function renderMessages(qs){
  const body = document.getElementById("chatBody");
  body.innerHTML = qs.docs.map(d => {
    const m = d.data();
    const mine = m.senderId === currentUser.uid;
    return `<div class="msg ${mine ? "out" : "in"}">${escapeHtml(m.text)}</div>`;
  }).join("");
  body.scrollTop = body.scrollHeight;
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
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await chatRef.update({
    lastMessage: text,
    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}
