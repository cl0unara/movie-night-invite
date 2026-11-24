const assert = require('node:assert/strict');
const { test } = require('node:test');
const handler = require('../api/telegram');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('accepted start payload notifies the owner and replies to the guest', async () => {
  const originalEnv = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    fetch: global.fetch,
  };
  const requests = [];
  process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
  process.env.TELEGRAM_ADMIN_CHAT_ID = '7001';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };

  try {
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: {
        message: {
          chat: { id: 555 },
          text: '/start yes_p_2026-03-30_0000',
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body.chat_id, '7001');
    assert.match(requests[0].body.text, /Фильм: 1\+1/);
    assert.match(requests[0].body.text, /Ночь на .*30 марта 2026.*00:00/);
    assert.equal(requests[1].body.chat_id, 555);
    assert.equal(requests[1].body.text, 'Жду тебя, Газява ❤️');
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
  }
});

test('webhook rejects requests without Telegram secret', async () => {
  const originalEnv = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  };
  process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
  process.env.TELEGRAM_ADMIN_CHAT_ID = '7001';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  const previousFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('Telegram must not be called for unauthorized updates');
  };

  try {
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: {},
      body: { message: { chat: { id: 555 }, text: '/start no' } },
    }, response);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Unauthorized' });
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = previousFetch;
  }
});

test('declined start payload notifies the owner and thanks the guest', async () => {
  const originalEnv = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    fetch: global.fetch,
  };
  const requests = [];
  process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
  process.env.TELEGRAM_ADMIN_CHAT_ID = '7001';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };

  try {
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: { message: { chat: { id: 555 }, text: '/start no' } },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 2);
    assert.match(requests[0].body.text, /в этот раз не получится/);
    assert.equal(requests[1].body.text, 'Спасибо, что ответила ❤️');
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
  }
});
