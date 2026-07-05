/* =========================================================
   PROFILE — кастомизация, аватар, музыка профиля
   ========================================================= */
function renderProfile(){
  if (!currentUserData) return;
  const u = currentUserData;
  document.getElementById("profileAvatarBig").src = avatarFallback(u);
  document.getElementById("profileName").innerHTML =
    escapeHtml(u.name || "Без имени") + (u.premium ? ' <img class="icon icon-sm" src="icons/verified.svg" alt="Premium">' : "");
  document.getElementById("profileHandle").textContent = u.handle || "";
  document.getElementById("nameInput").value = u.name || "";
  document.getElementById("profileBio").textContent = u.bio || "Пользователь пока ничего не написал о себе.";
  document.getElementById("bioInput").value = u.bio || "";
  renderTrack(u);
}

function renderTrack(u){
  const box = document.getElementById("trackDisplay");
  if (!u.musicUrl){
    box.innerHTML = `<p class="hint">Трек не выбран — добавьте музыку, которая будет играть в вашем профиле.</p>`;
    return;
  }
  box.innerHTML = `
    <div class="track-row">
      <button class="play-btn" onclick="togglePlay('${u.musicUrl}', this)"><img class="icon icon-sm" src="icons/play.svg" alt="Играть"></button>
      <div class="track-meta">
        <div class="t">${escapeHtml(u.musicTitle || "Трек профиля")}</div>
        <div class="a">Музыка профиля • ${escapeHtml(u.name || "")}</div>
      </div>
    </div>`;
}

function togglePlay(url, btn){
  const player = document.getElementById("audioPlayer");
  if (player.src === url && !player.paused){
    player.pause();
    btn.innerHTML = '<img class="icon icon-sm" src="icons/play.svg" alt="Играть">';
  } else {
    player.src = url;
    player.play();
    btn.innerHTML = '<img class="icon icon-sm" src="icons/pause.svg" alt="Пауза">';
    player.onended = () => btn.innerHTML = '<img class="icon icon-sm" src="icons/play.svg" alt="Играть">';
  }
}

async function saveName(newName){
  const name = newName.trim().slice(0,60);
  if (!name) return;
  await db.collection("users").doc(currentUser.uid).update({ name, nameLower: name.toLowerCase() });
  currentUserData.name = name;
  renderProfile();
}

async function saveBio(){
  const bio = document.getElementById("bioInput").value.trim().slice(0, 280);
  await db.collection("users").doc(currentUser.uid).update({ bio });
  currentUserData.bio = bio;
  renderProfile();
  toast("Профиль обновлён");
}

function openAvatarPicker(){ document.getElementById("avatarFile").click(); }

async function uploadAvatar(file){
  if (!file) return;
  if (file.size > 5 * 1024 * 1024){ toast("Файл больше 5МБ — выберите изображение поменьше"); return; }
  toast("Загружаем фото…");
  const ref = storage.ref(`avatars/${currentUser.uid}/${Date.now()}_${file.name}`);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  await db.collection("users").doc(currentUser.uid).update({ avatarUrl: url });
  currentUserData.avatarUrl = url;
  document.getElementById("navAvatar").src = avatarFallback(currentUserData);
  renderProfile();
  toast("Фото профиля обновлено");
}

async function uploadMusic(file){
  if (!file) return;
  if (file.size > 15 * 1024 * 1024){ toast("Файл больше 15МБ — выберите трек поменьше"); return; }
  toast("Загружаем трек…");
  const ref = storage.ref(`music/${currentUser.uid}/${Date.now()}_${file.name}`);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  const title = file.name.replace(/\.[^/.]+$/, "");
  await db.collection("users").doc(currentUser.uid).update({ musicUrl: url, musicTitle: title });
  currentUserData.musicUrl = url;
  currentUserData.musicTitle = title;
  renderTrack(currentUserData);
  toast("Музыка профиля обновлена");
}
