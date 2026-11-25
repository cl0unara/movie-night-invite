const { createHmac, timingSafeEqual } = require('node:crypto');

const MAX_INIT_DATA_LENGTH = 8192;
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const FUTURE_CLOCK_SKEW_SECONDS = 60;

function validateTelegramInitData(initData, botToken, nowSeconds = Date.now() / 1000) {
  if (typeof initData !== 'string' || !initData || initData.length > MAX_INIT_DATA_LENGTH) return null;
  if (typeof botToken !== 'string' || !botToken) return null;

  const params = new URLSearchParams(initData);
  const entries = [...params.entries()];
  const seen = new Set();
  for (const [key] of entries) {
    if (seen.has(key)) return null;
    seen.add(key);
  }

  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw || !/^\d+$/.test(authDateRaw)) return null;
  const authDate = Number(authDateRaw);
  if (!Number.isSafeInteger(authDate)) return null;
  if (authDate > nowSeconds + FUTURE_CLOCK_SKEW_SECONDS) return null;
  if (nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) return null;

  const checkString = entries
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => key + '=' + value)
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = createHmac('sha256', secret).update(checkString).digest();
  const received = Buffer.from(hash, 'hex');
  if (calculated.length !== received.length || !timingSafeEqual(calculated, received)) return null;

  let user;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return null;

  const firstName = typeof user.first_name === 'string' ? user.first_name : '';
  const lastName = typeof user.last_name === 'string' ? user.last_name : '';
  const username = typeof user.username === 'string' ? user.username : '';
  return {
    id: String(user.id),
    firstName,
    lastName,
    username,
    name: [firstName, lastName].filter(Boolean).join(' ').trim() || 'Гость',
  };
}

module.exports = { validateTelegramInitData };
