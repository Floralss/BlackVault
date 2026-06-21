const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');

initializeApp();
const db = getFirestore();

// ─────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────
// The owner code is never sent to the client in plaintext or even hashed —
// it lives only here, server-side, and is compared server-side.
const OWNER_CODE_HASH = crypto
  .createHash('sha256')
  .update("ghkslhtoprodl';c'klkgodjthjnmnjxslg:LkOihjodfjnjvnjkkg;ldfhjkpfdrjyijfklvmklsd;f'")
  .digest('hex');

const VALID_CURRENCIES = ['USD', 'UAH', 'RUB', 'TON', 'BTC', 'ETH'];
const RATES = { USD: 1, UAH: 41.5, RUB: 92, TON: 6.5, BTC: 64797.46, ETH: 3478.2 };
const STAFF_ROLES = ['admin', 'helper', 'media', 'sponsor'];
const MONEY_ROLES = ['admin']; // who (besides owner) can give/take money
const TAG_GRANT_ROLES = ['admin', 'helper', 'media', 'sponsor']; // who can grant unique tags free
const SUPPORT_ROLES = ['admin', 'helper', 'media', 'sponsor']; // who can answer tickets

const FORBIDDEN_TAG_WORDS = ['admin', 'owner', 'helper', 'media', 'sponsor', 'админ', 'владелец', 'хелпер', 'модератор', 'moderator'];

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'BV-' + s;
}
function genId(len = 10) {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 36).toString(36).toUpperCase();
  return s;
}

async function getWallet(uid) {
  const snap = await db.collection('wallets').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Кошелёк не найден');
  return snap.data();
}

function requireAuth(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
  return req.auth.uid;
}

async function requireOwner(uid) {
  const w = await getWallet(uid);
  if (!w.isOwner) throw new HttpsError('permission-denied', 'Только владелец может это делать');
  return w;
}

async function requireStaff(uid, allowedRoles) {
  const w = await getWallet(uid);
  if (w.isOwner) return w;
  if (!allowedRoles.includes(w.role)) throw new HttpsError('permission-denied', 'Недостаточно прав');
  return w;
}

async function findUserByCodeOrName(input) {
  input = (input || '').trim();
  if (!input) throw new HttpsError('invalid-argument', 'Не указан пользователь');
  let snap;
  if (input.toUpperCase().startsWith('BV-')) {
    snap = await db.collection('wallets').where('code', '==', input.toUpperCase()).limit(1).get();
  } else {
    snap = await db.collection('wallets').where('username', '==', input.replace('@', '')).limit(1).get();
  }
  if (snap.empty) throw new HttpsError('not-found', 'Пользователь не найден');
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

function validateCurrency(cur) {
  if (!VALID_CURRENCIES.includes(cur)) throw new HttpsError('invalid-argument', 'Неверная валюта');
}
function validateAmount(amt) {
  if (typeof amt !== 'number' || !isFinite(amt) || amt <= 0) {
    throw new HttpsError('invalid-argument', 'Неверная сумма');
  }
}

// ─────────────────────────────────────────────────────────
//  OWNER ACTIVATION — code never leaves the server
// ─────────────────────────────────────────────────────────
exports.activateOwner = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = req.data?.code || '';
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  if (hash !== OWNER_CODE_HASH) {
    throw new HttpsError('permission-denied', 'Неверный код');
  }
  await db.collection('wallets').doc(uid).update({ isOwner: true, role: 'owner' });
  return { success: true };
});

// ─────────────────────────────────────────────────────────
//  STAFF MANAGEMENT — only owner can assign/remove staff
// ─────────────────────────────────────────────────────────
exports.setStaffRole = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireOwner(uid);
  const { target, role } = req.data || {};
  const validRoles = ['admin', 'helper', 'media', 'sponsor', 'user'];
  if (!validRoles.includes(role)) throw new HttpsError('invalid-argument', 'Неверная роль');
  const { id: targetId, data: targetData } = await findUserByCodeOrName(target);
  if (targetData.isOwner) throw new HttpsError('permission-denied', 'Нельзя изменить роль владельца');
  await db.collection('wallets').doc(targetId).update({ role });
  return { success: true, username: targetData.username, role };
});

// ─────────────────────────────────────────────────────────
//  BLOCK / FREEZE — staff and owner only
// ─────────────────────────────────────────────────────────
exports.setWalletStatus = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireStaff(uid, STAFF_ROLES.filter(r => r !== 'media' && r !== 'sponsor'));
  const { target, field, value } = req.data || {};
  if (!['blocked', 'frozen'].includes(field)) throw new HttpsError('invalid-argument', 'Неверное поле');
  if (typeof value !== 'boolean') throw new HttpsError('invalid-argument', 'Неверное значение');
  const { id: targetId, data: targetData } = await findUserByCodeOrName(target);
  if (targetData.isOwner) throw new HttpsError('permission-denied', 'Нельзя заблокировать владельца');
  await db.collection('wallets').doc(targetId).update({ [field]: value });
  return { success: true, username: targetData.username };
});

// ─────────────────────────────────────────────────────────
//  GIVE MONEY — owner + admin
// ─────────────────────────────────────────────────────────
exports.giveMoney = onCall(async (req) => {
  const uid = requireAuth(req);
  const caller = await requireStaff(uid, MONEY_ROLES);
  const { target, currency, amount } = req.data || {};
  validateCurrency(currency);
  validateAmount(amount);
  const { id: targetId, data: targetData } = await findUserByCodeOrName(target);

  await db.collection('wallets').doc(targetId).update({
    [`balances.${currency}`]: FieldValue.increment(amount)
  });
  await db.collection('transactions').add({
    fromUid: 'system', fromCode: 'SYSTEM', fromUsername: 'Система',
    toUid: targetId, toCode: targetData.code, toUsername: targetData.username,
    currency, amount, type: 'admin_grant',
    issuedBy: caller.username,
    createdAt: FieldValue.serverTimestamp()
  });
  return { success: true, username: targetData.username };
});

// ─────────────────────────────────────────────────────────
//  TAKE (WITHDRAW) MONEY — owner + admin, including from self/owner
// ─────────────────────────────────────────────────────────
exports.takeMoney = onCall(async (req) => {
  const uid = requireAuth(req);
  const caller = await requireStaff(uid, MONEY_ROLES);
  const { target, currency, amount } = req.data || {};
  validateCurrency(currency);
  validateAmount(amount);
  const { id: targetId, data: targetData } = await findUserByCodeOrName(target);

  // Owner CAN take money from themselves or anyone, including other owners' targets if ever multiple.
  // Only restriction: non-owner admins cannot take from the owner.
  if (targetData.isOwner && !caller.isOwner) {
    throw new HttpsError('permission-denied', 'Только владелец может изъять средства у владельца');
  }

  const currentBal = (targetData.balances && targetData.balances[currency]) || 0;
  if (currentBal < amount) {
    throw new HttpsError('failed-precondition', 'У пользователя недостаточно средств');
  }

  await db.collection('wallets').doc(targetId).update({
    [`balances.${currency}`]: FieldValue.increment(-amount)
  });
  await db.collection('transactions').add({
    fromUid: targetId, fromCode: targetData.code, fromUsername: targetData.username,
    toUid: 'system', toCode: 'SYSTEM', toUsername: 'Система (изъятие)',
    currency, amount, type: 'admin_take',
    issuedBy: caller.username,
    createdAt: FieldValue.serverTimestamp()
  });
  return { success: true, username: targetData.username };
});

// ─────────────────────────────────────────────────────────
//  TRANSFER between users (with 5s delay simulated client-side; server just executes atomically)
// ─────────────────────────────────────────────────────────
exports.transferMoney = onCall(async (req) => {
  const uid = requireAuth(req);
  const sender = await getWallet(uid);
  if (sender.blocked || sender.frozen) throw new HttpsError('permission-denied', 'Кошелёк заблокирован');

  const { target, currency, amount, comment } = req.data || {};
  validateCurrency(currency);
  validateAmount(amount);
  const safeComment = (comment || '').toString().slice(0, 200);

  const { id: targetId, data: targetData } = await findUserByCodeOrName(target);
  if (targetId === uid) throw new HttpsError('invalid-argument', 'Нельзя переводить себе');
  if (targetData.blocked || targetData.frozen) throw new HttpsError('failed-precondition', 'Кошелёк получателя недоступен');

  const senderBal = (sender.balances && sender.balances[currency]) || 0;
  if (senderBal < amount) throw new HttpsError('failed-precondition', 'Недостаточно средств');

  const batch = db.batch();
  batch.update(db.collection('wallets').doc(uid), { [`balances.${currency}`]: FieldValue.increment(-amount) });
  batch.update(db.collection('wallets').doc(targetId), { [`balances.${currency}`]: FieldValue.increment(amount) });
  batch.set(db.collection('transactions').doc(), {
    fromUid: uid, fromCode: sender.code, fromUsername: sender.username,
    toUid: targetId, toCode: targetData.code, toUsername: targetData.username,
    currency, amount, comment: safeComment, type: 'transfer',
    createdAt: FieldValue.serverTimestamp()
  });
  await batch.commit();
  return { success: true, username: targetData.username };
});

// ─────────────────────────────────────────────────────────
//  EXCHANGE currency (rates fixed server-side, can't be spoofed)
// ─────────────────────────────────────────────────────────
exports.exchangeCurrency = onCall(async (req) => {
  const uid = requireAuth(req);
  const user = await getWallet(uid);
  if (user.blocked || user.frozen) throw new HttpsError('permission-denied', 'Кошелёк заблокирован');

  const { from, to, amount } = req.data || {};
  validateCurrency(from); validateCurrency(to);
  validateAmount(amount);
  if (from === to) throw new HttpsError('invalid-argument', 'Выберите разные валюты');

  const bal = (user.balances && user.balances[from]) || 0;
  if (bal < amount) throw new HttpsError('failed-precondition', 'Недостаточно средств');

  const usdValue = amount * RATES[from];
  const result = usdValue / RATES[to];

  await db.collection('wallets').doc(uid).update({
    [`balances.${from}`]: FieldValue.increment(-amount),
    [`balances.${to}`]: FieldValue.increment(result)
  });
  await db.collection('transactions').add({
    fromUid: uid, fromCode: user.code, fromUsername: user.username,
    toUid: uid, toCode: user.code, toUsername: user.username,
    currency: from, toCurrency: to, amount, toAmount: result, type: 'exchange',
    createdAt: FieldValue.serverTimestamp()
  });
  return { success: true, result };
});

// ─────────────────────────────────────────────────────────
//  CHECKS — create & redeem (balance changes only here)
// ─────────────────────────────────────────────────────────
exports.createCheck = onCall(async (req) => {
  const uid = requireAuth(req);
  const user = await getWallet(uid);
  if (user.blocked || user.frozen) throw new HttpsError('permission-denied', 'Кошелёк заблокирован');

  const { currency, amount, description } = req.data || {};
  validateCurrency(currency);
  validateAmount(amount);
  const safeDesc = (description || '').toString().slice(0, 200);

  const bal = (user.balances && user.balances[currency]) || 0;
  if (bal < amount) throw new HttpsError('failed-precondition', 'Недостаточно средств');

  const checkId = genId(10);
  await db.collection('checks').doc(checkId).set({
    id: checkId, fromUid: uid, fromCode: user.code, fromUsername: user.username,
    currency, amount, description: safeDesc, status: 'active',
    createdAt: FieldValue.serverTimestamp()
  });
  await db.collection('wallets').doc(uid).update({ [`balances.${currency}`]: FieldValue.increment(-amount) });
  return { success: true, checkId };
});

exports.redeemCheck = onCall(async (req) => {
  const uid = requireAuth(req);
  const user = await getWallet(uid);
  if (user.blocked || user.frozen) throw new HttpsError('permission-denied', 'Кошелёк заблокирован');

  const checkId = (req.data?.checkId || '').toUpperCase();
  const checkRef = db.collection('checks').doc(checkId);
  const checkSnap = await checkRef.get();
  if (!checkSnap.exists) throw new HttpsError('not-found', 'Чек не найден');
  const check = checkSnap.data();
  if (check.status !== 'active') throw new HttpsError('failed-precondition', 'Чек уже использован');
  if (check.fromUid === uid) throw new HttpsError('invalid-argument', 'Нельзя оплатить свой чек');

  const batch = db.batch();
  batch.update(checkRef, { status: 'paid', paidBy: uid, paidAt: FieldValue.serverTimestamp() });
  batch.update(db.collection('wallets').doc(check.fromUid), { [`balances.${check.currency}`]: FieldValue.increment(check.amount) });
  batch.set(db.collection('transactions').doc(), {
    fromUid: uid, fromCode: user.code, fromUsername: user.username,
    toUid: check.fromUid, toCode: check.fromCode, toUsername: check.fromUsername,
    currency: check.currency, amount: check.amount, type: 'check_payment', checkId,
    createdAt: FieldValue.serverTimestamp()
  });
  await batch.commit();
  return { success: true, fromUsername: check.fromUsername, amount: check.amount, currency: check.currency };
});

// ─────────────────────────────────────────────────────────
//  DEPOSIT REQUESTS — complete/cancel only by staff
// ─────────────────────────────────────────────────────────
exports.completeDeposit = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireStaff(uid, SUPPORT_ROLES.filter(r => r !== 'media' && r !== 'sponsor'));
  const reqId = req.data?.requestId;
  if (!reqId) throw new HttpsError('invalid-argument', 'Не указана заявка');

  const reqRef = db.collection('depositRequests').doc(reqId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) throw new HttpsError('not-found', 'Заявка не найдена');
  const r = reqSnap.data();
  if (r.status === 'completed') throw new HttpsError('failed-precondition', 'Уже завершено');

  await db.collection('wallets').doc(r.uid).update({ [`balances.${r.currency}`]: FieldValue.increment(r.amount) });
  await db.collection('transactions').add({
    fromUid: 'system', fromCode: 'SYSTEM', fromUsername: 'Пополнение',
    toUid: r.uid, toCode: r.code, toUsername: r.username,
    currency: r.currency, amount: r.amount, type: 'deposit',
    createdAt: FieldValue.serverTimestamp()
  });
  await reqRef.update({
    status: 'completed',
    messages: FieldValue.arrayUnion({ uid: 'system', username: 'Система', text: `✅ Пополнение завершено! Зачислено ${r.amount} ${r.currency}`, ts: Date.now(), sys: true }),
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { success: true };
});

exports.cancelDeposit = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireStaff(uid, SUPPORT_ROLES.filter(r => r !== 'media' && r !== 'sponsor'));
  const reqId = req.data?.requestId;
  if (!reqId) throw new HttpsError('invalid-argument', 'Не указана заявка');
  const reqRef = db.collection('depositRequests').doc(reqId);
  await reqRef.update({
    status: 'cancelled',
    messages: FieldValue.arrayUnion({ uid: 'system', username: 'Система', text: '❌ Заявка отменена администратором', ts: Date.now(), sys: true }),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { success: true };
});

exports.setDepositInProgress = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireStaff(uid, SUPPORT_ROLES.filter(r => r !== 'media' && r !== 'sponsor'));
  const reqId = req.data?.requestId;
  const reqRef = db.collection('depositRequests').doc(reqId);
  const snap = await reqRef.get();
  if (snap.exists && snap.data().status === 'pending') {
    await reqRef.update({ status: 'inprogress' });
  }
  return { success: true };
});

// ─────────────────────────────────────────────────────────
//  SUPPORT TICKETS — close ticket (staff only), set in-progress
// ─────────────────────────────────────────────────────────
exports.closeTicket = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireStaff(uid, SUPPORT_ROLES);
  const ticketId = req.data?.ticketId;
  if (!ticketId) throw new HttpsError('invalid-argument', 'Не указан тикет');
  await db.collection('reports').doc(ticketId).update({ status: 'closed', closedAt: FieldValue.serverTimestamp() });
  return { success: true };
});

exports.setTicketInProgress = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireStaff(uid, SUPPORT_ROLES);
  const ticketId = req.data?.ticketId;
  const ref = db.collection('reports').doc(ticketId);
  const snap = await ref.get();
  if (snap.exists && snap.data().status === 'open') {
    await ref.update({ status: 'inprogress' });
  }
  return { success: true };
});

// ─────────────────────────────────────────────────────────
//  DELETE ACCOUNT — owner can delete anyone instantly;
//  admins create a delete request that only the owner can execute.
// ─────────────────────────────────────────────────────────
exports.deleteAccount = onCall(async (req) => {
  const uid = requireAuth(req);
  const caller = await getWallet(uid);
  const { target, reason, adminNick } = req.data || {};

  if (caller.isOwner) {
    const { id: targetId, data: targetData } = await findUserByCodeOrName(target);
    await db.collection('wallets').doc(targetId).delete();
    return { success: true, deleted: true, username: targetData.username };
  }

  if (caller.role !== 'admin') throw new HttpsError('permission-denied', 'Недостаточно прав');
  const { id: targetId, data: targetData } = await findUserByCodeOrName(target);
  if (targetData.isOwner) throw new HttpsError('permission-denied', 'Нельзя удалить владельца');

  await db.collection('deleteRequests').add({
    targetUid: targetId, targetUsername: targetData.username,
    reason: (reason || '').toString().slice(0, 300),
    adminUsername: adminNick || caller.username, adminUid: uid,
    status: 'pending', createdAt: FieldValue.serverTimestamp()
  });
  return { success: true, deleted: false };
});

exports.deleteSelf = onCall(async (req) => {
  const uid = requireAuth(req);
  await db.collection('wallets').doc(uid).delete();
  return { success: true };
});

// ─────────────────────────────────────────────────────────
//  TG/DISCORD VERIFICATION — approve/deny by staff
// ─────────────────────────────────────────────────────────
exports.approveSocialLink = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireStaff(uid, SUPPORT_ROLES);
  const { requestId } = req.data || {};
  const reqRef = db.collection('tgRequests').doc(requestId);
  const snap = await reqRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Заявка не найдена');
  const r = snap.data();

  await reqRef.update({ status: 'approved' });
  if (r.platform === 'telegram') {
    await db.collection('wallets').doc(r.uid).update({ tg: r.tg, tgVerified: true, tgPending: false });
  } else {
    await db.collection('wallets').doc(r.uid).update({ dc: r.dc, dcVerified: true, dcPending: false });
  }
  return { success: true };
});

exports.denySocialLink = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireStaff(uid, SUPPORT_ROLES);
  const { requestId } = req.data || {};
  await db.collection('tgRequests').doc(requestId).update({ status: 'denied' });
  return { success: true };
});

// ─────────────────────────────────────────────────────────
//  SHOP — tags, UI themes, frames, VIP — server validates price & deducts balance atomically
// ─────────────────────────────────────────────────────────
const SHOP_PRICES_UAH = {
  customTag: 150,
  customizeTag: 200,
  uiTheme: 50,
  avatarFrame: 80,
  vip: 150
};

function uahToCur(uahAmount, cur) {
  const usdAmount = uahAmount / RATES.UAH;
  return (usdAmount * RATES.USD) / RATES[cur];
}

async function chargeShop(uid, userData, itemKey, payCurrency, txType) {
  validateCurrency(payCurrency);
  const uahPrice = SHOP_PRICES_UAH[itemKey];
  const amount = payCurrency === 'UAH' ? uahPrice : uahToCur(uahPrice, payCurrency);
  const bal = (userData.balances && userData.balances[payCurrency]) || 0;
  if (bal < amount) throw new HttpsError('failed-precondition', `Недостаточно средств. Нужно ${amount.toFixed(2)} ${payCurrency}`);

  await db.collection('wallets').doc(uid).update({ [`balances.${payCurrency}`]: FieldValue.increment(-amount) });
  await db.collection('transactions').add({
    fromUid: uid, fromCode: userData.code, fromUsername: userData.username,
    toUid: 'shop', toCode: 'SHOP', toUsername: 'Магазин',
    currency: payCurrency, amount, type: txType,
    createdAt: FieldValue.serverTimestamp()
  });
  return amount;
}

exports.buyCustomTag = onCall(async (req) => {
  const uid = requireAuth(req);
  const user = await getWallet(uid);
  const { name, color, font, effect, payCurrency } = req.data || {};
  const cleanName = (name || '').toString().trim().slice(0, 16);
  if (cleanName.length < 2) throw new HttpsError('invalid-argument', 'Название минимум 2 символа');
  if (FORBIDDEN_TAG_WORDS.some(w => cleanName.toLowerCase().includes(w))) {
    throw new HttpsError('invalid-argument', 'Это название зарезервировано');
  }
  const safeColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#7C5CFC';
  const safeFont = ['normal', 'bold', 'italic'].includes(font) ? font : 'normal';
  const safeEffect = ['solid', 'rainbow'].includes(effect) ? effect : 'solid';

  await chargeShop(uid, user, 'customTag', payCurrency, 'shop_tag');

  const newTag = { name: cleanName, color: safeColor, font: safeFont, effect: safeEffect, id: genId(6) };
  const existing = user.customTags || (user.customTag ? [user.customTag] : []);
  const updated = [...existing, newTag].slice(0, 5); // cap at 5 tags
  await db.collection('wallets').doc(uid).update({ customTags: updated });
  return { success: true, tag: newTag };
});

exports.customizeServiceTag = onCall(async (req) => {
  const uid = requireAuth(req);
  const user = await getWallet(uid);
  const isStaff = user.isOwner || STAFF_ROLES.includes(user.role);
  const { color, effect, payCurrency } = req.data || {};
  const safeColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#7C5CFC';
  const safeEffect = ['solid', 'rainbow', 'redblack'].includes(effect) ? effect : 'solid';

  await chargeShop(uid, user, 'customizeTag', payCurrency, 'shop_customize');

  if (isStaff) {
    await db.collection('wallets').doc(uid).update({ tagColor: safeColor, tagEffect: safeEffect });
  } else {
    const tags = user.customTags || [];
    if (!tags.length) throw new HttpsError('failed-precondition', 'Сначала создайте тег');
    tags[tags.length - 1] = { ...tags[tags.length - 1], color: safeColor };
    await db.collection('wallets').doc(uid).update({ customTags: tags });
  }
  return { success: true };
});

exports.buyUiTheme = onCall(async (req) => {
  const uid = requireAuth(req);
  const user = await getWallet(uid);
  const { btn1, btn2, imageData, payCurrency } = req.data || {};

  await chargeShop(uid, user, 'uiTheme', payCurrency, 'shop_ui');

  const themeCode = 'BVTHEME-' + genId(8);
  const themeData = imageData
    ? { btn1: '#7C5CFC', btn2: '#A78BFA', image: imageData.slice(0, 700000) } // cap image size
    : {
        btn1: /^#[0-9A-Fa-f]{6}$/.test(btn1) ? btn1 : '#7C5CFC',
        btn2: /^#[0-9A-Fa-f]{6}$/.test(btn2) ? btn2 : '#A78BFA'
      };

  await db.collection('themes').doc(themeCode).set({
    ...themeData, creatorUid: uid, createdAt: FieldValue.serverTimestamp()
  });
  await db.collection('wallets').doc(uid).update({ themeCode, themeData });
  return { success: true, themeCode, themeData };
});

exports.useThemeCode = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = (req.data?.code || '').toUpperCase();
  const snap = await db.collection('themes').doc(code).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Код не найден');
  const t = snap.data();
  const themeData = t.image ? { btn1: t.btn1, btn2: t.btn2, image: t.image } : { btn1: t.btn1, btn2: t.btn2 };
  await db.collection('wallets').doc(uid).update({ themeCode: code, themeData });
  return { success: true, themeData };
});

exports.buyAvatarFrame = onCall(async (req) => {
  const uid = requireAuth(req);
  const user = await getWallet(uid);
  const { color, payCurrency } = req.data || {};
  const safeColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#7C5CFC';
  await chargeShop(uid, user, 'avatarFrame', payCurrency, 'shop_frame');
  await db.collection('wallets').doc(uid).update({ avatarFrame: safeColor });
  return { success: true };
});

exports.buyVip = onCall(async (req) => {
  const uid = requireAuth(req);
  const user = await getWallet(uid);
  const { payCurrency } = req.data || {};
  await chargeShop(uid, user, 'vip', payCurrency, 'shop_vip');
  const vipUntil = Date.now() + 30 * 24 * 60 * 60 * 1000;
  await db.collection('wallets').doc(uid).update({ vipUntil });
  return { success: true, vipUntil };
});

// ─────────────────────────────────────────────────────────
//  GRANT UNIQUE TAG FREE — staff only (helper/admin/media/sponsor/owner)
// ─────────────────────────────────────────────────────────
exports.grantUniqueTag = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireStaff(uid, TAG_GRANT_ROLES);
  const { target, name, color, font, effect } = req.data || {};
  const cleanName = (name || '').toString().trim().slice(0, 16);
  if (cleanName.length < 2) throw new HttpsError('invalid-argument', 'Название минимум 2 символа');
  const safeColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#7C5CFC';
  const safeFont = ['normal', 'bold', 'italic'].includes(font) ? font : 'normal';
  const safeEffect = ['solid', 'rainbow', 'redblack'].includes(effect) ? effect : 'solid';

  const { id: targetId, data: targetData } = await findUserByCodeOrName(target);
  const newTag = { name: cleanName, color: safeColor, font: safeFont, effect: safeEffect, id: genId(6), granted: true };
  const existing = targetData.customTags || [];
  const updated = [...existing, newTag].slice(0, 5);
  await db.collection('wallets').doc(targetId).update({ customTags: updated });
  return { success: true, username: targetData.username };
});

// ─────────────────────────────────────────────────────────
//  STOCKS — buy with any currency, server computes price
// ─────────────────────────────────────────────────────────
const STOCKS = {
  AAPL: { price: 227.52 }, TSLA: { price: 248.91 }, GOOGL: { price: 174.36 },
  AMZN: { price: 186.43 }, MSFT: { price: 421.07 }, NVDA: { price: 135.58 }
};

exports.buyStock = onCall(async (req) => {
  const uid = requireAuth(req);
  const user = await getWallet(uid);
  if (user.blocked || user.frozen) throw new HttpsError('permission-denied', 'Кошелёк заблокирован');

  const { symbol, qty, payCurrency } = req.data || {};
  if (!STOCKS[symbol]) throw new HttpsError('invalid-argument', 'Неизвестная акция');
  if (typeof qty !== 'number' || qty <= 0) throw new HttpsError('invalid-argument', 'Неверное количество');
  validateCurrency(payCurrency);

  const usdCost = STOCKS[symbol].price * qty;
  const cost = payCurrency === 'USD' ? usdCost : usdCost / RATES[payCurrency];
  const bal = (user.balances && user.balances[payCurrency]) || 0;
  if (bal < cost) throw new HttpsError('failed-precondition', 'Недостаточно средств');

  await db.collection('wallets').doc(uid).update({
    [`balances.${payCurrency}`]: FieldValue.increment(-cost),
    [`stocks.${symbol}`]: FieldValue.increment(qty)
  });
  await db.collection('transactions').add({
    fromUid: uid, fromCode: user.code, fromUsername: user.username,
    toUid: 'market', toCode: 'MARKET', toUsername: 'Биржа',
    currency: payCurrency, amount: cost, type: 'stock_buy', stockSymbol: symbol, stockQty: qty,
    createdAt: FieldValue.serverTimestamp()
  });
  return { success: true, cost, qty };
});

// ─────────────────────────────────────────────────────────
//  CONTESTS — owner creates, users enter
// ─────────────────────────────────────────────────────────
exports.createContest = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireOwner(uid);
  const { type, imageUrl, name, task, prize, investCurrency } = req.data || {};
  if (!['task', 'invest'].includes(type)) throw new HttpsError('invalid-argument', 'Неверный тип');
  const cleanName = (name || '').toString().trim().slice(0, 100);
  if (!cleanName) throw new HttpsError('invalid-argument', 'Введите название');

  const contestData = {
    type,
    imageUrl: (imageUrl || '').toString().slice(0, 500),
    name: cleanName,
    task: (task || '').toString().slice(0, 1000),
    prize: (prize || '').toString().slice(0, 200),
    investCurrency: investCurrency || 'USD',
    status: 'active',
    createdAt: FieldValue.serverTimestamp()
  };
  const ref = await db.collection('contests').add(contestData);
  return { success: true, contestId: ref.id };
});

exports.closeContest = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireOwner(uid);
  const { contestId } = req.data || {};
  await db.collection('contests').doc(contestId).update({ status: 'closed', closedAt: FieldValue.serverTimestamp() });
  return { success: true };
});

exports.enterContest = onCall(async (req) => {
  const uid = requireAuth(req);
  const user = await getWallet(uid);
  const { contestId, answer, investAmount, investCurrency } = req.data || {};

  const contestSnap = await db.collection('contests').doc(contestId).get();
  if (!contestSnap.exists) throw new HttpsError('not-found', 'Конкурс не найден');
  const contest = contestSnap.data();
  if (contest.status !== 'active') throw new HttpsError('failed-precondition', 'Конкурс закрыт');

  if (contest.type === 'invest') {
    validateCurrency(investCurrency);
    validateAmount(investAmount);
    const bal = (user.balances && user.balances[investCurrency]) || 0;
    if (bal < investAmount) throw new HttpsError('failed-precondition', 'Недостаточно средств');
    // Funds are held by transferring to a contest pool (owner does manual payout via giveMoney later)
    await db.collection('wallets').doc(uid).update({ [`balances.${investCurrency}`]: FieldValue.increment(-investAmount) });
    await db.collection('transactions').add({
      fromUid: uid, fromCode: user.code, fromUsername: user.username,
      toUid: 'contest', toCode: 'CONTEST', toUsername: 'Конкурс: ' + contest.name,
      currency: investCurrency, amount: investAmount, type: 'contest_invest', contestId,
      createdAt: FieldValue.serverTimestamp()
    });
  }

  await db.collection('contestEntries').add({
    contestId, uid, username: user.username, code: user.code,
    answer: (answer || '').toString().slice(0, 500),
    investAmount: contest.type === 'invest' ? investAmount : null,
    investCurrency: contest.type === 'invest' ? investCurrency : null,
    createdAt: FieldValue.serverTimestamp()
  });
  return { success: true };
});
