const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { validateTelegramInitData } = require('../api/telegram-auth');

const TOKEN = '123456:unit-test-token';
const NOW = Math.floor(Date.now() / 1000);

function signedInitData(overrides = {}) {
  const values = new Map([
    ['auth_date', String(NOW)],
    ['query_id', 'AAEAAAE'],
    ['user', JSON.stringify({ id: 903292061, first_name: 'Admin' })],
    ...Object.entries(overrides),
  ]);
  const check = [...values.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => key + '=' + value)
    .join('\\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return [...values.entries()].map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&')
    + '&hash=' + hash;
}

test('accepts a valid, fresh Telegram initData signature', () => {
  const result = validateTelegramInitData(signedInitData(), TOKEN, NOW);
  assert.equal(result.id, '903292061');
  assert.equal(result.name, 'Admin');
});

test('rejects tampered user data', () => {
  const data = signedInitData().replace('Admin', 'Attacker');
  assert.equal(validateTelegramInitData(data, TOKEN, NOW), null);
});

test('rejects duplicate parameters, including duplicate hashes', () => {
  const valid = signedInitData();
  assert.equal(validateTelegramInitData(valid + '&auth_date=' + NOW, TOKEN, NOW), null);
  assert.equal(validateTelegramInitData(valid + '&hash=' + '0'.repeat(64), TOKEN, NOW), null);
});

test('rejects expired and future-dated initData', () => {
  assert.equal(validateTelegramInitData(signedInitData({ auth_date: String(NOW - 86401) }), TOKEN, NOW), null);
  assert.equal(validateTelegramInitData(signedInitData({ auth_date: String(NOW + 61) }), TOKEN, NOW), null);
});

test('rejects malformed identities and missing secrets', () => {
  assert.equal(validateTelegramInitData(signedInitData({ user: '{bad json' }), TOKEN, NOW), null);
  assert.equal(validateTelegramInitData(signedInitData(), '', NOW), null);
  assert.equal(validateTelegramInitData('', TOKEN, NOW), null);
});
