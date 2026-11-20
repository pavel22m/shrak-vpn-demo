const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const state = {
  data: null,
  admin: null,
};
const demoUserId = new URLSearchParams(location.search).get('demo_user') || '100000001';
const headers = () => {
  const initData = tg?.initData || '';
  return {
    'Content-Type': 'application/json',
    ...(initData ? { 'X-Telegram-Init-Data': initData } : { 'X-Demo-User-Id': demoUserId }),
  };
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const date = (value) => value ? new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toast.timeout);
  toast.timeout = window.setTimeout(() => el.classList.remove('show'), 3000);
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить запрос');
  return payload;
}

function render() {
  if (!state.data) return;
  const { user, plans } = state.data;
  $('#balance').textContent = money(user.balance);
  $('#subscriptionStatus').textContent = user.subscription?.status === 'active' ? 'Активна' : 'Не активна';
  $('#subscriptionDate').textContent = user.subscription?.expiresAt ? `До ${date(user.subscription.expiresAt)}` : 'Выберите тариф ниже';
  $('#configSection').classList.toggle('hidden', !user.subscription);
  $('#plans').innerHTML = plans.map((plan, index) => `
    <article class="plan-card card ${index === 1 ? 'featured' : ''}" style="--plan-color:${plan.accent === 'cyan' ? 'var(--cyan)' : plan.accent === 'gold' ? '#ffd166' : 'var(--violet)'}">
      <span class="plan-tag">${index === 1 ? 'ПОПУЛЯРНЫЙ' : plan.days + ' ДНЕЙ'}</span>
      <h4>${plan.name}</h4>
      <p>${plan.description}</p>
      <div class="price">${money(plan.price)} <small>/ доступ</small></div>
      <button class="primary-button" data-plan="${plan.id}">Подключить</button>
    </article>
  `).join('');
  $('#plans').querySelectorAll('[data-plan]').forEach((button) => button.addEventListener('click', () => buy(button.dataset.plan)));
  $('#configValue').textContent = user.subscription?.config || 'demo://wireguard/shrak-vpn-example';
  if (state.data.isAdmin) $('#adminSection').classList.remove('hidden');
}

async function load() {
  try {
    state.data = await api('/api/me');
    render();
  } catch (error) {
    toast(error.message);
  }
}

async function topup() {
  try {
    state.data = await api('/api/demo/topup', { method: 'POST', body: JSON.stringify({ amount: 1000 }) });
    render();
    toast('Демо-баланс пополнен на 1 000 ₽');
  } catch (error) { toast(error.message); }
}

async function buy(planId) {
  const plan = state.data.plans.find((item) => item.id === planId);
  if (!confirm(`Подключить тариф «${plan.name}» за ${money(plan.price)} в DEMO-режиме?`)) return;
  try {
    state.data = await api('/api/purchase', { method: 'POST', body: JSON.stringify({ planId, requestId: crypto.randomUUID() }) });
    render();
    toast('Подписка активирована в демо-режиме');
  } catch (error) { toast(error.message); }
}

function showModal(content) {
  $('#modalContent').innerHTML = content;
  $('#modal').showModal();
}

function showHistory() {
  const rows = state.data?.transactions || [];
  showModal(`<p class="eyebrow accent">ИСТОРИЯ</p><h3>Операции</h3>${rows.length ? rows.map((row) => `<div class="history-item"><span>${row.label}<small class="muted">${date(row.createdAt)}</small></span><strong>${row.amount > 0 ? '+' : ''}${money(row.amount)}</strong></div>`).join('') : '<p>Операций пока нет.</p>'}`);
}

function showSupport() {
  showModal(`<p class="eyebrow accent">ПОДДЕРЖКА</p><h3>Написать команде</h3><p>Опишите вопрос — он появится в панели владельца.</p><textarea id="supportMessage" placeholder="Например: не получается подключить подписку"></textarea><button class="primary-button" data-action="send-support">Отправить сообщение</button>`);
  $('[data-action="send-support"]').addEventListener('click', async () => {
    try {
      await api('/api/support', { method: 'POST', body: JSON.stringify({ message: $('#supportMessage').value }) });
      $('#modal').close();
      toast('Сообщение отправлено');
    } catch (error) { toast(error.message); }
  });
}

async function loadAdmin() {
  try {
    state.admin = await api('/api/admin/state');
    const { stats, users, plans } = state.admin;
    $('#adminStats').innerHTML = [['Пользователи', stats.users], ['Подписки', stats.activeSubscriptions], ['Оборот DEMO', money(stats.revenue)], ['Новые тикеты', stats.tickets]].map(([label, value]) => `<div class="admin-stat"><span class="eyebrow">${label}</span><strong>${value}</strong></div>`).join('');
    $('#adminPlan').innerHTML = plans.map((plan) => `<option value="${plan.id}">${plan.name} · ${plan.days} дней</option>`).join('');
    $('#adminUsers').innerHTML = `<p class="eyebrow accent">ПОЛЬЗОВАТЕЛИ</p>${users.length ? users.map((user) => `<div class="admin-user"><span><strong>${user.firstName} ${user.username ? `· @${user.username}` : ''}</strong><span class="muted">ID ${user.telegramId}</span></span><span><strong>${money(user.balance)}</strong><span class="muted">${user.subscription?.planName || 'Без подписки'}</span></span></div>`).join('') : '<p class="muted">Пользователей пока нет.</p>'}`;
  } catch (error) { toast(error.message); }
}

async function adminAction(kind) {
  const telegramId = $('#adminUserId').value.trim();
  if (!telegramId) return toast('Введите Telegram ID');
  try {
    const payload = kind === 'topup'
      ? { telegramId, amount: Number($('#adminAmount').value) }
      : { telegramId, planId: $('#adminPlan').value };
    await api(`/api/admin/${kind}`, { method: 'POST', body: JSON.stringify(payload) });
    await loadAdmin();
    toast('Демо-операция выполнена');
  } catch (error) { toast(error.message); }
}

$$('[data-action="topup"]').forEach((el) => el.addEventListener('click', topup));
$$('[data-action="history"]').forEach((el) => el.addEventListener('click', showHistory));
$$('[data-action="support"]').forEach((el) => el.addEventListener('click', showSupport));
$$('[data-action="copy-config"]').forEach((el) => el.addEventListener('click', async () => {
  await navigator.clipboard?.writeText($('#configValue').textContent);
  toast('Конфигурация скопирована');
}));
$$('[data-action="close-modal"]').forEach((el) => el.addEventListener('click', () => $('#modal').close()));
$$('[data-action="refresh-admin"]').forEach((el) => el.addEventListener('click', loadAdmin));
$$('[data-action="admin-topup"]').forEach((el) => el.addEventListener('click', () => adminAction('topup')));
$$('[data-action="admin-grant"]').forEach((el) => el.addEventListener('click', () => adminAction('grant')));
$$('[data-action="admin-revoke"]').forEach((el) => el.addEventListener('click', () => adminAction('revoke')));
$$('[data-scroll]').forEach((el) => el.addEventListener('click', () => document.getElementById(el.dataset.scroll === 'top' ? 'app' : el.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' })));
$('#profileButton').addEventListener('click', () => showModal(`<p class="eyebrow accent">ЛИЧНЫЙ КАБИНЕТ</p><h3>${state.data?.user.firstName || 'Профиль'}</h3><p>Telegram ID: ${state.data?.user.telegramId || '—'}<br />Режим: демо<br />Сервис: Шрак VPN</p>`));

load();
