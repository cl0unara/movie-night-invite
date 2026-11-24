const assert = require('node:assert/strict');
const { test } = require('node:test');
const handler = require('../api/setup');

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

test('setup registers the Telegram webhook on the Vercel deployment', async () => {
  const originalEnv = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    setupSecret: process.env.WEBHOOK_SETUP_SECRET,
    vercelUrl: process.env.VERCEL_URL,
    fetch: global.fetch,
  };
  let request;
  process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'hook-secret';
  process.env.WEBHOOK_SETUP_SECRET = 'setup-secret';
  process.env.VERCEL_URL = 'movie-invite-test.vercel.app';
  global.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ ok: true }) };
  };

  try {
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer setup-secret' },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(request.url, 'https://api.telegram.org/bot123:test-token/setWebhook');
    assert.equal(request.body.url, 'https://movie-invite-test.vercel.app/api/telegram');
    assert.equal(request.body.secret_token, 'hook-secret');
    assert.deepEqual(request.body.allowed_updates, ['message']);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    process.env.WEBHOOK_SETUP_SECRET = originalEnv.setupSecret;
    process.env.VERCEL_URL = originalEnv.vercelUrl;
    global.fetch = originalEnv.fetch;
  }
});
