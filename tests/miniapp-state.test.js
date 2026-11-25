const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { test } = require('node:test');
const Module = require('node:module');

const BOT_TOKEN = '123:test-token';
const ADMIN_ID = 555;
const DEFAULT_MOVIES = [
  { id: 'interstellar', title: 'Интерстеллар', year: 2014, category: 'Фантастика', watched: false, hidden: false },
  { id: 'titanic', title: 'Титаник', year: 1997, category: 'Романтика', watched: false, hidden: true },
];
let mockState = structuredClone({ movies: DEFAULT_MOVIES });
let mockEtag = 'etag-1';
let mockGetError = null;
let putCalls = 0;

process.env.ADMIN_TELEGRAM_ID = String(ADMIN_ID);
const originalLoad = Module._load;
Module._load = function loadWithBlobMock(request, parent, isMain) {
  if (request === '@vercel/blob') {
    return {
      get: async () => {
        if (mockGetError) throw mockGetError;
        return {
        statusCode: 200,
        stream: new Response(JSON.stringify(mockState)).body,
        blob: { etag: mockEtag },
      };
      },
      put: async (_path, content, options) => {
        putCalls += 1;
        if (options.ifMatch && options.ifMatch !== mockEtag) {
          const error = new Error('Precondition failed');
          error.status = 412;
          throw error;
        }
        mockState = JSON.parse(content);
        mockEtag = 'etag-' + (putCalls + 1);
        return { etag: mockEtag };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const handler = require('../api/miniapp-state');
Module._load = originalLoad;

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function createInitData(userId) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAE-test-query',
    user: JSON.stringify({ id: userId, first_name: 'Tester' }),
  });
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => key + '=' + value)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(checkString).digest('hex'));
  return params.toString();
}

async function call(method, userId, body) {
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
  const response = createResponse();
  await handler({
    method,
    headers: { 'x-telegram-init-data': createInitData(userId) },
    body,
  }, response);
  return response;
}

test('guest API response does not disclose hidden movies', async () => {
  mockState = structuredClone({ movies: DEFAULT_MOVIES });
  const response = await call('GET', 777);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.role, 'guest');
  assert.deepEqual(response.body.movies.map(movie => movie.id), ['interstellar']);
});

test('only the configured Telegram owner receives the admin role and hidden catalog', async () => {
  mockState = structuredClone({ movies: DEFAULT_MOVIES });
  const guest = await call('GET', 777);
  const admin = await call('GET', ADMIN_ID);
  assert.equal(guest.body.role, 'guest');
  assert.equal(admin.body.role, 'admin');
  assert.equal(admin.body.movies.length, 2);
});

test('guest cannot change movie flags even with a forged admin action body', async () => {
  mockState = structuredClone({ movies: DEFAULT_MOVIES });
  const before = putCalls;
  const response = await call('POST', 777, { action: 'hidden', id: 'interstellar', value: true, role: 'admin' });
  assert.equal(response.statusCode, 403);
  assert.equal(putCalls, before);
  assert.equal(mockState.movies[0].hidden, false);
});

test('admin can hide and restore a movie in shared state', async () => {
  mockState = structuredClone({ movies: DEFAULT_MOVIES });
  const hidden = await call('POST', ADMIN_ID, { action: 'hidden', id: 'interstellar', value: true });
  assert.equal(hidden.statusCode, 200);
  assert.equal(hidden.body.movies[0].hidden, true);
  const restored = await call('POST', ADMIN_ID, { action: 'hidden', id: 'interstellar', value: false });
  assert.equal(restored.statusCode, 200);
  assert.equal(restored.body.movies[0].hidden, false);
});

test('admin reorder rejects duplicates and unknown IDs', async () => {
  mockState = structuredClone({ movies: DEFAULT_MOVIES });
  const before = putCalls;
  const response = await call('POST', ADMIN_ID, { action: 'reorder', order: ['interstellar', 'interstellar'] });
  assert.equal(response.statusCode, 400);
  assert.equal(putCalls, before);
});

test('tampered Telegram initData cannot access shared state', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
  const response = createResponse();
  await handler({
    method: 'GET',
    headers: { 'x-telegram-init-data': createInitData(ADMIN_ID) + 'tampered' },
  }, response);
  assert.equal(response.statusCode, 401);
});


test('shared-state storage outage does not silently reset the catalog', async () => {
  mockGetError = Object.assign(new Error('Blob unavailable'), { status: 503 });
  const response = await call('GET', ADMIN_ID);
  mockGetError = null;
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: 'Could not update shared state' });
});
