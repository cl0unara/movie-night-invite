const assert = require('node:assert/strict');
const { test } = require('node:test');
const handler = require('../api/reminders');

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

test('reminder dispatcher sends due reminders and removes them from the queue', async () => {
  const originalEnv = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    callbackSecret: process.env.REMINDER_CALLBACK_SECRET,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    qstashToken: process.env.QSTASH_TOKEN,
    fetch: global.fetch,
  };
  const calls = [];
  const meetingAt = Math.floor((Date.now() - 10 * 60 * 1000) / 60000) * 60000;
  const reminder = {
    chatId: '555',
    movie: 'Интерстеллар',
    date: '2026-03-30',
    time: '20:00',
    meetingAt,
  };
  process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
  process.env.REMINDER_CALLBACK_SECRET = 'callback-secret';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-secret';
  process.env.QSTASH_TOKEN = 'qstash-secret';
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === 'https://redis.test') {
      const command = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          result: command[0] === 'HGET' ? JSON.stringify(reminder) : 1,
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };

  try {
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer callback-secret' },
      body: { chatId: '555', meetingAt },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { ok: true, sent: true });
    const telegramCall = calls.find(({ url }) => url.includes('api.telegram.org'));
    assert.equal(telegramCall.options.body.includes('Напоминание 🍿'), true);
    assert.equal(telegramCall.options.body.includes('Через полчаса'), true);
    assert.equal(calls.some(({ url, options }) => (
      url === 'https://redis.test' && JSON.parse(options.body)[0] === 'EVAL'
    )), true);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.REMINDER_CALLBACK_SECRET = originalEnv.callbackSecret;
    process.env.UPSTASH_REDIS_REST_URL = originalEnv.redisUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = originalEnv.redisToken;
    process.env.QSTASH_TOKEN = originalEnv.qstashToken;
    global.fetch = originalEnv.fetch;
  }
});

test('reminder dispatcher rejects requests without its secret', async () => {
  const originalSecret = process.env.REMINDER_CALLBACK_SECRET;
  const originalFetch = global.fetch;
  process.env.REMINDER_CALLBACK_SECRET = 'callback-secret';
  global.fetch = async () => {
    throw new Error('Redis and Telegram must not be called for unauthorized requests');
  };

  try {
    const response = createResponse();
    await handler({ method: 'POST', headers: {} }, response);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Unauthorized' });
  } finally {
    process.env.REMINDER_CALLBACK_SECRET = originalSecret;
    global.fetch = originalFetch;
  }
});

test('reminder dispatcher chains dates beyond QStash free delay limit', async () => {
  const originalEnv = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    callbackSecret: process.env.REMINDER_CALLBACK_SECRET,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    qstashToken: process.env.QSTASH_TOKEN,
    fetch: global.fetch,
  };
  const meetingAt = Date.now() + 10 * 24 * 60 * 60 * 1000;
  const reminder = {
    chatId: '555',
    movie: 'Интерстеллар',
    date: '2026-03-30',
    time: '20:00',
    meetingAt,
  };
  let queuedMessage;
  process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
  process.env.REMINDER_CALLBACK_SECRET = 'callback-secret';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-secret';
  process.env.QSTASH_TOKEN = 'qstash-secret';
  global.fetch = async (url, options = {}) => {
    if (url === 'https://redis.test') {
      return { ok: true, json: async () => ({ result: JSON.stringify(reminder) }) };
    }
    if (url.startsWith('https://qstash.upstash.io/')) {
      queuedMessage = { url, options };
      return { ok: true, json: async () => ({ messageId: 'message-id' }) };
    }
    throw new Error('Telegram must not be called before the reminder time');
  };

  try {
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer callback-secret' },
      body: { chatId: '555', meetingAt },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { ok: true, rescheduled: true });
    assert.ok(queuedMessage);
    const notBefore = Number(queuedMessage.options.headers['upstash-not-before']);
    const sixDaysFromNow = Math.floor(Date.now() / 1000) + 6 * 24 * 60 * 60;
    assert.ok(notBefore <= sixDaysFromNow);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.REMINDER_CALLBACK_SECRET = originalEnv.callbackSecret;
    process.env.UPSTASH_REDIS_REST_URL = originalEnv.redisUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = originalEnv.redisToken;
    process.env.QSTASH_TOKEN = originalEnv.qstashToken;
    global.fetch = originalEnv.fetch;
  }
});
