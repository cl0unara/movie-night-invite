const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { test } = require('node:test');
const Module = require('node:module');
let mockBlobState = null;
let mockEtag = 'test-etag';
const originalLoad = Module._load;
Module._load = function loadWithBlobMock(request, parent, isMain) {
  if (request === '@vercel/blob') {
    return {
      get: async () => {
        if (mockBlobState === null) return null;
        return { statusCode: 200, stream: new Response(JSON.stringify(mockBlobState)).body, blob: { etag: mockEtag } };
      },
      put: async (_path, body) => { mockBlobState = JSON.parse(body); mockEtag = 'test-etag-' + Math.random(); return {}; },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const handler = require('../api/miniapp-booking');
Module._load = originalLoad;

const BOT_TOKEN = '123:test-token';
const USER = { id: 555, first_name: 'Аня', username: 'anya' };

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function createInitData(user = USER, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAE-test-query',
    user: JSON.stringify(user),
  });
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => key + '=' + value)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

async function withBookingEnvironment(run) {
  const original = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    admin: process.env.TELEGRAM_ADMIN_CHAT_ID,
    blob: process.env.BLOB_READ_WRITE_TOKEN,
    fetch: global.fetch,
    now: Date.now,
  };
  const requests = [];
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  process.env.TELEGRAM_ADMIN_CHAT_ID = '7001';
  process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
  mockBlobState = null;
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  try {
    await run(requests);
  } finally {
    if (original.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = original.token;
    if (original.admin === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID;
    else process.env.TELEGRAM_ADMIN_CHAT_ID = original.admin;
    if (original.blob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = original.blob;
    mockBlobState = null;
    global.fetch = original.fetch;
    Date.now = original.now;
  }
}

function requestBody({ date = '2026-11-27', time = '20:00', offset = -120, authDate } = {}) {
  return {
    movieId: 'titanic',
    date,
    time,
    timeZoneOffsetMinutes: offset,
    initData: createInitData(USER, authDate),
  };
}

test('booking accepts a future local slot and sends both Telegram messages', async () => {
  await withBookingEnvironment(async requests => {
    const fixedNow = Date.UTC(2026, 10, 25, 17, 0, 0);
    Date.now = () => fixedNow;
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { 'x-telegram-init-data': createInitData(USER, Math.floor(fixedNow / 1000)) },
      body: requestBody({ date: '2026-11-25', time: '20:00', offset: -120, authDate: Math.floor(fixedNow / 1000) }),
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body.chat_id, '7001');
    assert.match(requests[0].body.text, /Фильм: Титаник/);
    assert.equal(requests[1].body.chat_id, '555');
    assert.match(requests[1].body.reply_markup.inline_keyboard[0][0].callback_data, /^cancel_a_2026-11-25_2000_555$/);
    assert.equal(mockBlobState.bookings.length, 1);
    assert.equal(mockBlobState.bookings[0].status, 'confirmed');
  });
});

test('booking rejects a past local slot even when its wall-clock time looks future in UTC', async () => {
  await withBookingEnvironment(async requests => {
    const fixedNow = Date.UTC(2026, 10, 25, 17, 0, 0);
    Date.now = () => fixedNow;
    const response = createResponse();
    const authDate = Math.floor(fixedNow / 1000);
    await handler({
      method: 'POST',
      headers: { 'x-telegram-init-data': createInitData(USER, authDate) },
      body: requestBody({ date: '2026-11-25', time: '18:00', offset: -120, authDate }),
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(response.body.error, /время уже прошло/);
    assert.equal(requests.length, 0);
  });
});

test('booking rejects missing or impossible timezone offsets', async () => {
  await withBookingEnvironment(async requests => {
    const response = createResponse();
    const authDate = Math.floor(Date.now() / 1000);
    await handler({
      method: 'POST',
      headers: { 'x-telegram-init-data': createInitData(USER, authDate) },
      body: requestBody({ offset: 900, authDate }),
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(response.body.error, /часовой пояс/);
    assert.equal(requests.length, 0);
  });
});

test('booking rejects auth data from the future or older than 24 hours', async () => {
  await withBookingEnvironment(async requests => {
    const now = Math.floor(Date.now() / 1000);
    for (const authDate of [now + 60, now - 86401]) {
      const response = createResponse();
      await handler({
        method: 'POST',
        headers: { 'x-telegram-init-data': createInitData(USER, authDate) },
        body: requestBody({ authDate }),
      }, response);
      assert.equal(response.statusCode, 401);
    }
    assert.equal(requests.length, 0);
  });
});

test('booking rejects invalid movie, date and time values', async () => {
  await withBookingEnvironment(async requests => {
    const authDate = Math.floor(Date.now() / 1000);
    for (const body of [
      requestBody({ authDate, date: '2026-02-30' }),
      requestBody({ authDate, time: '23:46' }),
      { ...requestBody({ authDate }), movieId: 'unknown' },
    ]) {
      const response = createResponse();
      await handler({
        method: 'POST',
        headers: { 'x-telegram-init-data': createInitData(USER, authDate) },
        body,
      }, response);
      assert.equal(response.statusCode, 400);
    }
    assert.equal(requests.length, 0);
  });
});


test('booking rejects a movie hidden or marked watched in shared state', async () => {
  await withBookingEnvironment(async requests => {
    const authDate = Math.floor(Date.now() / 1000);
    mockBlobState = { movies: [{ id: 'titanic', hidden: true, watched: false }] };
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { 'x-telegram-init-data': createInitData(USER, authDate) },
      body: requestBody({ authDate }),
    }, response);

    assert.equal(response.statusCode, 409);
    assert.match(response.body.error, /больше недоступен/);
    assert.equal(requests.length, 0);
  });
});
