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
          from: { first_name: 'Аня', username: 'anya' },
          text: '/start yes_p_2026-03-30_0000',
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body.chat_id, '7001');
    assert.match(requests[0].body.text, /От: Аня \(@anya\)/);
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

test('Telegram API rejection is logged without exposing the bot token', async () => {
  const originalEnv = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    fetch: global.fetch,
    consoleError: console.error,
  };
  const logs = [];
  process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
  delete process.env.TELEGRAM_ADMIN_CHAT_ID;
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      ok: false,
      error_code: 400,
      description: 'Bad Request: chat not found',
    }),
  });
  console.error = (...args) => logs.push(args);

  try {
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: {
        message: {
          chat: { id: 555 },
          text: '/start',
        },
      },
    }, response);

    assert.equal(response.statusCode, 502);
    assert.match(JSON.stringify(logs), /Bad Request: chat not found/);
    assert.doesNotMatch(JSON.stringify(logs), /123:test-token/);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
    console.error = originalEnv.consoleError;
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
      body: {
        message: {
          chat: { id: 555 },
          from: { first_name: 'Аня' },
          text: '/start no',
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 2);
    assert.match(requests[0].body.text, /от Аня: в этот раз не получится/);
    assert.equal(requests[1].body.text, 'Спасибо, что ответила ❤️');
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
  }
});

test('one and two in the morning are forwarded as overnight choices', async () => {
  const originalEnv = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    fetch: global.fetch,
  };
  const messages = [];
  process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
  process.env.TELEGRAM_ADMIN_CHAT_ID = '7001';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  global.fetch = async (url, options) => {
    messages.push(JSON.parse(options.body).text);
    return { ok: true, json: async () => ({ ok: true }) };
  };

  try {
    for (const time of ['0100', '0200']) {
      const response = createResponse();
      await handler({
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: {
          message: {
            chat: { id: 555 },
            text: `/start yes_i_2026-03-30_${time}`,
          },
        },
      }, response);
      assert.equal(response.statusCode, 200);
    }

    assert.match(messages[0], /Ночь на .*01:00/);
    assert.match(messages[2], /Ночь на .*02:00/);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
  }
});

test('accepted choices with a timestamp are saved for a reminder', async () => {
  const originalEnv = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    qstashToken: process.env.QSTASH_TOKEN,
    callbackSecret: process.env.REMINDER_CALLBACK_SECRET,
    fetch: global.fetch,
  };
  const redisCommands = [];
  const telegramMessages = [];
  let queuedMessage;
  process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
  process.env.TELEGRAM_ADMIN_CHAT_ID = '7001';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-secret';
  process.env.QSTASH_TOKEN = 'qstash-secret';
  process.env.REMINDER_CALLBACK_SECRET = 'callback-secret';
  global.fetch = async (url, options) => {
    if (url === 'https://redis.test') {
      redisCommands.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ result: 1 }) };
    }
    if (url.startsWith('https://qstash.upstash.io/')) {
      queuedMessage = { url, options };
      return { ok: true, json: async () => ({ messageId: 'message-id' }) };
    }
    telegramMessages.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true }) };
  };

  try {
    const startMinute = Math.floor((Date.now() + 60 * 60 * 1000) / 60000).toString(36);
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: {
        message: {
          chat: { id: 555 },
          text: `/start yes_i_2026-03-30_2000_${startMinute}`,
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(redisCommands.length, 1);
    assert.equal(redisCommands[0][0], 'HSET');
    assert.match(redisCommands[0][3], /"movie":"Интерстеллар"/);
    assert.ok(queuedMessage);
    assert.equal(queuedMessage.options.headers['upstash-forward-authorization'], 'Bearer callback-secret');
    assert.equal(
      queuedMessage.options.headers['upstash-not-before'],
      String(Math.floor((Number.parseInt(startMinute, 36) * 60) - 30 * 60)),
    );
    assert.match(queuedMessage.url, /\/api\/reminders$/);
    assert.equal(telegramMessages.at(-1).text, 'Жду тебя, Газява ❤️\nНапомню за полчаса до просмотра 🍿');
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    process.env.UPSTASH_REDIS_REST_URL = originalEnv.redisUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = originalEnv.redisToken;
    process.env.QSTASH_TOKEN = originalEnv.qstashToken;
    process.env.REMINDER_CALLBACK_SECRET = originalEnv.callbackSecret;
    global.fetch = originalEnv.fetch;
  }
});
