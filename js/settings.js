/* =========================================================
   SETTINGS — приватность (телефон/аватар/только-Premium-пишут)
   и кастомизация интерфейса (акцент, скругления)
   ========================================================= */
function renderSettings(){
  if (!currentUserData) return;
  const p = currentUserData.privacy || {};
  document.getElementById("toggleHidePhone").checked = !!p.hidePhone;
  document.getElementById("toggleHideAvatar").checked = !!p.hideAvatar;
  document.getElementById("toggleOnlyPremium").checked = !!p.onlyPremiumCanMessage;
}

async function savePrivacy(){
  const privacy = {
    hidePhone: document.getElementById("toggleHidePhone").checked,
    hideAvatar: document.getElementById("toggleHideAvatar").checked,
    onlyPremiumCanMessage: document.getElementById("toggleOnlyPremium").checked
  };

  if (privacy.onlyPremiumCanMessage && !currentUserData.premium){
    toast("Эта функция доступна только с подпиской Black Premium");
    document.getElementById("toggleOnlyPremium").checked = false;
    return;
  }

  await db.collection("users").doc(currentUser.uid).update({ privacy });
  currentUserData.privacy = privacy;
  document.getElementById("navAvatar").src = avatarFallback(currentUserData);
  toast("Настройки приватности сохранены");
}

/* ---------- Кастомизация интерфейса ---------- */
function setAccent(gold, goldSoft, persist = true){
  document.documentElement.style.setProperty("--gold", gold);
  document.documentElement.style.setProperty("--gold-soft", goldSoft);
  if (typeof event !== "undefined" && event && event.currentTarget && event.currentTarget.classList.contains("swatch")){
    document.querySelectorAll(".swatch").forEach(s => s.classList.remove("active"));
    event.currentTarget.classList.add("active");
  }
  if (persist) saveThemePref({ accent: gold, accentSoft: goldSoft });
}

function setRadius(px, persist = true){
  document.documentElement.style.setProperty("--radius-m", px + "px");
  document.documentElement.style.setProperty("--radius-l", (Number(px)+8) + "px");
  document.documentElement.style.setProperty("--radius-s", Math.max(0, Number(px)-6) + "px");
  if (persist) saveThemePref({ radius: px });
}

let themeSaveTimer = null;
function saveThemePref(partial){
  clearTimeout(themeSaveTimer);
  themeSaveTimer = setTimeout(async () => {
    const theme = { ...(currentUserData.theme || {}), ...partial };
    currentUserData.theme = theme;
    await db.collection("users").doc(currentUser.uid).update({ theme });
  }, 400);
}
