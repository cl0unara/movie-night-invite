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
          text: '/start yes_p_2026-03-30_2215',
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body.chat_id, '7001');
    assert.match(requests[0].body.text, /От: Аня \(@anya\)/);
    assert.match(requests[0].body.text, /Фильм: 1\+1/);
    assert.match(requests[0].body.text, /30 марта 2026.*22:15/);
    assert.equal(requests[1].body.chat_id, 555);
    assert.match(requests[1].body.text, /Жду тебя, Газява/);
    assert.deepEqual(requests[1].body.reply_markup.inline_keyboard[0][0], {
      text: 'Отменить запись',
      callback_data: 'cancel_p_2026-03-30_2215',
    });
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
    assert.match(JSON.stringify(logs), /HTTP 400, code 400: Bad Request: chat not found/);
    assert.doesNotMatch(JSON.stringify(logs), /123:test-token/);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
    console.error = originalEnv.consoleError;
  }
});

test('Telegram transport errors are logged without exposing the bot token', async () => {
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
  global.fetch = async () => {
    const cause = new Error('Connection reset');
    cause.code = 'ECONNRESET';
    throw Object.assign(new TypeError('fetch failed'), { cause });
  };
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
    assert.match(JSON.stringify(logs), /transport failure \(TypeError, ECONNRESET\)/);
    assert.doesNotMatch(JSON.stringify(logs), /123:test-token/);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
    console.error = originalEnv.consoleError;
  }
});

test('accepted legacy payloads notify the owner without using reminder storage', async () => {
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
          text: '/start yes_i_2026-03-30_2000_legacytimestamp',
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 2);
    assert.match(requests[0].body.text, /Фильм: Интерстеллар/);
    assert.match(requests[1].body.text, /Жду тебя, Газява/);
    assert.equal(requests[1].body.reply_markup.inline_keyboard[0][0].text, 'Отменить запись');
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
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

test('quarter-hour evening times are forwarded to the owner', async () => {
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
    for (const time of ['1800', '1815', '2215', '2230', '2245', '2345']) {
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

    assert.match(messages[0], /18:00/);
    assert.match(messages[4], /22:15/);
    assert.match(messages[8], /22:45/);
    assert.match(messages[10], /23:45/);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
  }
});

test('cancellation payload notifies the owner with the cancelled plan', async () => {
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
    requests.push(JSON.parse(options.body));
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
          text: '/start cancel_i_2026-03-30_2215',
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 2);
    assert.match(requests[0].text, /Отмена договорённости/);
    assert.match(requests[0].text, /Интерстеллар/);
    assert.match(requests[0].text, /22:15/);
    assert.equal(requests[1].text, 'Договорённость отменена. Спасибо, что предупредила ❤️');
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
  }
});


test('inline cancellation button notifies the owner and removes itself', async () => {
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
        callback_query: {
          id: 'callback-123',
          data: 'cancel_c_2026-03-30_2230',
          from: { id: 555, first_name: 'Аня', username: 'anya' },
          message: { message_id: 42, chat: { id: 555, type: 'private' } },
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 4);
    assert.equal(requests[0].url, 'https://api.telegram.org/bot123:test-token/sendMessage');
    assert.match(requests[0].body.text, /Отмена договорённости/);
    assert.match(requests[0].body.text, /Чернобыль/);
    assert.match(requests[0].body.text, /22:30/);
    assert.equal(requests[1].url, 'https://api.telegram.org/bot123:test-token/editMessageReplyMarkup');
    assert.deepEqual(requests[1].body.reply_markup, { inline_keyboard: [] });
    assert.equal(requests[2].url, 'https://api.telegram.org/bot123:test-token/answerCallbackQuery');
    assert.equal(requests[2].body.callback_query_id, 'callback-123');
    assert.equal(requests[3].body.chat_id, 555);
    assert.equal(requests[3].body.text, 'Договорённость отменена. Спасибо, что предупредила ❤️');
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
  }
});


test('new movie and series payloads are accepted and named correctly', async () => {
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
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true }) };
  };
  try {
    for (const [code, title] of [['k', 'Достать ножи'], ['t', 'Телохранители'], ['a', 'Титаник'], ['h', 'Один дома']]) {
      const response = createResponse();
      await handler({
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { message: { chat: { id: 555 }, text: `/start yes_${code}_2026-03-30_2215` } },
      }, response);
      assert.equal(response.statusCode, 200);
      assert.match(requests.at(-2).text, new RegExp(title));
      assert.match(requests.at(-1).reply_markup.inline_keyboard[0][0].callback_data, new RegExp(`cancel_${code}_`));
    }
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
  }
});


test('inline cancellation button cannot be used by another Telegram user', async () => {
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
        callback_query: {
          id: 'forged-callback',
          data: 'cancel_c_2026-03-30_2230',
          from: { id: 999, first_name: 'Attacker' },
          message: { message_id: 42, chat: { id: 555, type: 'private' } },
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.telegram.org/bot123:test-token/answerCallbackQuery');
    assert.equal(requests[0].body.callback_query_id, 'forged-callback');
    assert.match(requests[0].body.text, /владельцу записи/);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = originalEnv.token;
    process.env.TELEGRAM_ADMIN_CHAT_ID = originalEnv.adminChatId;
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    global.fetch = originalEnv.fetch;
  }
});
