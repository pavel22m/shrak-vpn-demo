import { randomUUID } from 'node:crypto';

export const plans = [
  { id: 'week', name: 'Старт', days: 7, price: 149, accent: 'violet', description: 'Попробовать без долгих обязательств' },
  { id: 'month', name: 'Месяц', days: 30, price: 399, accent: 'cyan', description: 'Оптимальный тариф на каждый день' },
  { id: 'quarter', name: '90 дней', days: 90, price: 899, accent: 'gold', description: 'Максимальная выгода для постоянного доступа' },
];

const users = new Map();
const transactions = [];
const supportTickets = [];
const processedPurchases = new Set();

function createDemoUser(telegramId, profile = {}) {
  const user = {
    telegramId: String(telegramId),
    username: profile.username ?? '',
    firstName: profile.firstName ?? 'Гость',
    balance: 0,
    subscription: null,
    createdAt: new Date().toISOString(),
  };
  users.set(user.telegramId, user);
  return user;
}

export function getOrCreateUser(telegramId, profile = {}) {
  const key = String(telegramId);
  const current = users.get(key);
  if (current) {
    current.username = profile.username ?? current.username;
    current.firstName = profile.firstName ?? current.firstName;
    return current;
  }
  return createDemoUser(key, profile);
}

export function getUser(telegramId) {
  return users.get(String(telegramId)) ?? null;
}

export function getPublicState(telegramId) {
  const user = getOrCreateUser(telegramId);
  return {
    user: {
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      balance: user.balance,
      subscription: user.subscription,
    },
    plans,
    transactions: transactions.filter((item) => item.telegramId === user.telegramId).slice(-20).reverse(),
  };
}

export function demoTopUp(telegramId, amount = 1000) {
  const user = getOrCreateUser(telegramId);
  const value = Number(amount);
  if (!Number.isInteger(value) || value < 1 || value > 100000) {
    throw new Error('Некорректная сумма пополнения');
  }
  user.balance += value;
  transactions.push({ id: randomUUID(), telegramId: user.telegramId, type: 'top_up', amount: value, createdAt: new Date().toISOString(), label: 'Демо-пополнение' });
  return getPublicState(user.telegramId);
}

export function purchasePlan(telegramId, planId, requestId = randomUUID()) {
  if (processedPurchases.has(requestId)) return getPublicState(telegramId);
  const user = getOrCreateUser(telegramId);
  const plan = plans.find((item) => item.id === planId);
  if (!plan) throw new Error('Тариф не найден');
  if (user.balance < plan.price) throw new Error('Недостаточно средств на демо-балансе');

  const now = new Date();
  const currentEnd = user.subscription?.expiresAt && new Date(user.subscription.expiresAt) > now
    ? new Date(user.subscription.expiresAt)
    : now;
  currentEnd.setDate(currentEnd.getDate() + plan.days);
  user.balance -= plan.price;
  user.subscription = {
    planId: plan.id,
    planName: plan.name,
    expiresAt: currentEnd.toISOString(),
    status: 'active',
    config: 'demo://wireguard/shrak-vpn-example',
  };
  transactions.push({ id: randomUUID(), telegramId: user.telegramId, type: 'purchase', amount: -plan.price, createdAt: now.toISOString(), label: `Подписка «${plan.name}»` });
  processedPurchases.add(requestId);
  return getPublicState(user.telegramId);
}

export function createTicket(telegramId, message) {
  const text = String(message ?? '').trim();
  if (!text || text.length > 1000) throw new Error('Напишите сообщение до 1000 символов');
  const user = getOrCreateUser(telegramId);
  const ticket = { id: randomUUID(), telegramId: user.telegramId, username: user.username, message: text, status: 'new', createdAt: new Date().toISOString() };
  supportTickets.push(ticket);
  return ticket;
}

export function getAdminState() {
  return {
    stats: {
      users: users.size,
      activeSubscriptions: [...users.values()].filter((user) => user.subscription?.status === 'active').length,
      revenue: Math.abs(transactions.filter((item) => item.type === 'purchase').reduce((sum, item) => sum + item.amount, 0)),
      tickets: supportTickets.filter((ticket) => ticket.status === 'new').length,
    },
    users: [...users.values()].map((user) => ({ ...user })),
    transactions: transactions.slice(-50).reverse(),
    tickets: supportTickets.slice(-50).reverse(),
    plans,
  };
}

export function adminTopUp(telegramId, amount) {
  return demoTopUp(telegramId, amount);
}

export function adminGrantPlan(telegramId, planId) {
  const user = getOrCreateUser(telegramId);
  const plan = plans.find((item) => item.id === planId);
  if (!plan) throw new Error('Тариф не найден');
  const end = new Date();
  end.setDate(end.getDate() + plan.days);
  user.subscription = { planId: plan.id, planName: plan.name, expiresAt: end.toISOString(), status: 'active', config: 'demo://wireguard/shrak-vpn-example' };
  transactions.push({ id: randomUUID(), telegramId: user.telegramId, type: 'grant', amount: 0, createdAt: new Date().toISOString(), label: `Выдано администратором: ${plan.name}` });
  return user;
}

export function adminRevokePlan(telegramId) {
  const user = getUser(telegramId);
  if (!user) throw new Error('Пользователь не найден');
  user.subscription = null;
  return user;
}

export function resetStoreForTests() {
  users.clear();
  transactions.length = 0;
  supportTickets.length = 0;
  processedPurchases.clear();
}
