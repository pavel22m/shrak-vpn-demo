import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import {
  getPublicState,
  demoTopUp,
  purchasePlan,
  createTicket,
  getAdminState,
  adminTopUp,
  adminGrantPlan,
  adminRevokePlan,
} from './store.mjs';
import { validateTelegramInitData, readDevUser } from './telegram.mjs';

const PORT = Number(process.env.PORT ?? 8787);
const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID ?? '';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL ?? `http://localhost:${PORT}`;
const WEB_ROOT = resolve('apps/web');
const BRAND_ROOT = resolve('public');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
]);

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function getHeader(request, name) {
  return typeof request.headers?.get === 'function'
    ? request.headers.get(name)
    : request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
}

function getTelegramUser(request) {
  if (BOT_TOKEN) {
    const initData = getHeader(request, 'x-telegram-init-data') ?? '';
    const user = validateTelegramInitData(initData, BOT_TOKEN);
    if (user) return user;
  }
  if (!BOT_TOKEN) return readDevUser(request);
  return null;
}

function isAdmin(user) {
  return Boolean(user && ADMIN_TELEGRAM_ID && String(user.id) === String(ADMIN_TELEGRAM_ID));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

async function handleApi(request, response, url) {
  const user = getTelegramUser(request);
  if (!user) return sendJson(response, 401, { error: 'Откройте приложение через Telegram или задайте demo user для локального теста' });
  const body = request.method === 'POST' ? await readBody(request) : {};
  if (body === null) return sendJson(response, 400, { error: 'Некорректный JSON' });

  try {
    if (request.method === 'GET' && url.pathname === '/api/me') {
      return sendJson(response, 200, { ...getPublicState(user.id), isAdmin: isAdmin(user) });
    }
    if (request.method === 'POST' && url.pathname === '/api/demo/topup') {
      return sendJson(response, 200, demoTopUp(user.id, body.amount));
    }
    if (request.method === 'POST' && url.pathname === '/api/purchase') {
      return sendJson(response, 200, purchasePlan(user.id, body.planId, body.requestId));
    }
    if (request.method === 'POST' && url.pathname === '/api/support') {
      return sendJson(response, 200, { ticket: createTicket(user.id, body.message) });
    }
    if (url.pathname.startsWith('/api/admin/')) {
      if (!isAdmin(user)) return sendJson(response, 403, { error: 'Админ-панель доступна только владельцу' });
      if (request.method === 'GET' && url.pathname === '/api/admin/state') {
        return sendJson(response, 200, getAdminState());
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/topup') {
        return sendJson(response, 200, { state: adminTopUp(body.telegramId, body.amount) });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/grant') {
        return sendJson(response, 200, { user: adminGrantPlan(body.telegramId, body.planId) });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/revoke') {
        return sendJson(response, 200, { user: adminRevokePlan(body.telegramId) });
      }
    }
    return sendJson(response, 404, { error: 'Маршрут не найден' });
  } catch (error) {
    return sendJson(response, 400, { error: error instanceof Error ? error.message : 'Ошибка сервера' });
  }
}

async function callTelegram(method, payload) {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN не настроен на сервере');
  const telegramResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await telegramResponse.json().catch(() => ({}));
  if (!telegramResponse.ok || !result.ok) {
    console.error(`Telegram ${method} failed`, result);
    throw new Error(result.description || `Telegram API error: ${telegramResponse.status}`);
  }
  return result;
}

async function handleTelegramWebhook(request, response) {
  const body = await readBody(request);
  const message = body?.message;
  if (!message?.chat?.id) return sendJson(response, 200, { ok: true });
  const miniAppUrl = `${PUBLIC_APP_URL}/`;
  const text = [
    '🛡️ Шрак VPN',
    '',
    'Демо-кабинет для управления подпиской:',
    '• тарифы и покупка',
    '• тестовый баланс',
    '• доступ к конфигурации',
    '',
    'Нажмите кнопку ниже, чтобы открыть приложение.',
  ].join('\n');
  try {
    await callTelegram('sendMessage', {
      chat_id: message.chat.id,
      text,
      reply_markup: {
        inline_keyboard: [[{ text: 'Открыть Шрак VPN', web_app: { url: miniAppUrl } }]],
      },
    });
  } catch (error) {
    console.error('Webhook reply failed', error);
  }
  return sendJson(response, 200, { ok: true });
}

async function serveFile(request, response, url) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Метод не поддерживается' });
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  if (filePath === '/admin') filePath = '/index.html';
  const base = filePath.startsWith('/branding/') ? BRAND_ROOT : WEB_ROOT;
  const fullPath = normalize(join(base, filePath.startsWith('/branding/') ? filePath : `.${filePath}`));
  const allowedRoot = filePath.startsWith('/branding/') ? join(BRAND_ROOT, 'branding') : WEB_ROOT;
  if (!resolve(fullPath).startsWith(resolve(allowedRoot))) return sendJson(response, 403, { error: 'Доступ запрещён' });
  try {
    const content = await readFile(fullPath);
    response.writeHead(200, { 'Content-Type': contentTypes.get(extname(fullPath)) ?? 'application/octet-stream' });
    response.end(content);
  } catch {
    const content = await readFile(join(WEB_ROOT, 'index.html'));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(content);
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
    return handleTelegramWebhook(request, response);
  }
  if (url.pathname.startsWith('/api/')) {
    return handleApi(request, response, url);
  }
  return serveFile(request, response, url);
});

server.listen(PORT, () => {
  console.log(`Шрак VPN demo: ${PUBLIC_APP_URL}`);
});
