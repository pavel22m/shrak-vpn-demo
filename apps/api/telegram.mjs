import { createHmac, timingSafeEqual } from 'node:crypto';

export function validateTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!receivedHash || !Number.isInteger(authDate)) return null;
  if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const expected = Buffer.from(calculatedHash, 'hex');
  const actual = Buffer.from(receivedHash, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let user;
  try {
    user = JSON.parse(params.get('user') ?? '{}');
  } catch {
    return null;
  }
  if (!user.id) return null;
  return user;
}

export function readDevUser(request) {
  const header = typeof request.headers?.get === 'function'
    ? request.headers.get('x-demo-user-id')
    : request.headers?.['x-demo-user-id'] ?? request.headers?.['X-Demo-User-Id'];
  if (!header || !/^\d{1,30}$/.test(header)) return null;
  return { id: header, first_name: 'Demo', username: 'demo_user' };
}
