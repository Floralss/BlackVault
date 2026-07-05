/* =========================================================
   ADMIN — редактирование тарифов Black Premium.
   Видимость кнопки в интерфейсе задаётся списком ADMIN_UIDS,
   но это только UX. Реальная защита от записи посторонними —
   правило в firestore.rules: match /plans/{id} { allow write:
   if request.auth.uid in [...] }. Обязательно синхронизируйте
   оба списка.
   ========================================================= */
let adminPlansCache = [];

async function loadAdminPlans(){
  if (!isAdminClient()){
    document.getElementById("view-admin").innerHTML = `<div class="empty-state" style="margin:auto;"><p>Нет доступа.</p></div>`;
    return;
  }
  const snap = await db.collection("plans").orderBy("order","asc").get().catch(() => ({docs:[]}));
  adminPlansCache = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  renderAdminPlans();
}

function renderAdminPlans(){
  const body = document.getElementById("adminPlansBody");
  body.innerHTML = adminPlansCache.map((p, i) => `
    <tr>
      <td><input value="${escapeAttr(p.name)}" oninput="adminPlansCache[${i}].name=this.value"></td>
      <td><input value="${escapeAttr(p.price)}" oninput="adminPlansCache[${i}].price=this.value" placeholder="199 ₴"></td>
      <td><input value="${escapeAttr(p.period||'мес')}" oninput="adminPlansCache[${i}].period=this.value"></td>
      <td><textarea rows="2" oninput="adminPlansCache[${i}].features=this.value.split('\\n')">${escapeAttr((p.features||[]).join("\n"))}</textarea></td>
      <td style="text-align:center;"><input type="checkbox" ${p.featured?"checked":""} onchange="adminPlansCache[${i}].featured=this.checked"></td>
      <td><button class="btn btn-danger btn-sm" onclick="removePlanRow(${i})"><img class="icon icon-sm" src="icons/close.svg" alt="Удалить"></button></td>
    </tr>`).join("");
}

function escapeAttr(s){ return (s||"").toString().replace(/"/g,"&quot;"); }

function addPlanRow(){
  adminPlansCache.push({ name:"Новый тариф", price:"0 ₴", period:"мес", features:[], featured:false, order: adminPlansCache.length });
  renderAdminPlans();
}
function removePlanRow(i){
  adminPlansCache.splice(i,1);
  renderAdminPlans();
}

async function savePlans(){
  const batch = db.batch();
  // удаляем все старые и записываем заново — просто и надёжно для небольшого списка тарифов
  const oldSnap = await db.collection("plans").get();
  oldSnap.docs.forEach(d => batch.delete(d.ref));
  adminPlansCache.forEach((p, i) => {
    const ref = db.collection("plans").doc();
    batch.set(ref, { ...p, order: i });
  });
  await batch.commit();
  toast("Тарифы обновлены");
  loadAdminPlans();
}
