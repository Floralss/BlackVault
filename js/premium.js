/* =========================================================
   PREMIUM — публичные тарифные карточки (цены/описания
   задаёт админ через admin.js, здесь только чтение)
   ========================================================= */
async function loadPlans(){
  const grid = document.getElementById("plansGrid");
  grid.innerHTML = `<p class="hint">Загружаем тарифы…</p>`;

  const snap = await db.collection("plans").orderBy("order", "asc").get().catch(() => null);
  if (!snap || snap.empty){
    grid.innerHTML = `<p class="hint">Тарифы пока не настроены администратором.</p>`;
    return;
  }

  grid.innerHTML = snap.docs.map(d => {
    const p = d.data();
    return `
      <div class="plan-card ${p.featured ? "featured" : ""}">
        ${p.featured ? '<span class="seal small" style="position:absolute;top:18px;right:18px;">★</span>' : ""}
        <div class="li-name">${escapeHtml(p.name)}</div>
        <div class="price">${escapeHtml(p.price)} <span>/ ${escapeHtml(p.period || "мес")}</span></div>
        <ul>${(p.features || []).map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
        <button class="btn ${p.featured ? "btn-gold" : "btn-ghost"} btn-block" onclick="subscribeToPlan('${d.id}')">Оформить</button>
      </div>`;
  }).join("");
}

// Заглушка оформления подписки: реальная оплата должна проходить через
// платёжный шлюз (Stripe/ЮKassa и т.п.) и Cloud Function, которая уже
// на сервере проставит currentUserData.premium = true. Делать это
// напрямую из браузера небезопасно — см. README, раздел "Оплата".
async function subscribeToPlan(planId){
  toast("Подключите платёжный провайдер в Cloud Functions, чтобы включить оплату (см. README)");
}
