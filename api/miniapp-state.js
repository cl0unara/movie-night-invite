const { createHmac, timingSafeEqual } = require('node:crypto');
const { get, put } = require('@vercel/blob');

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;
const STATE_PATH = 'movie-night/shared-state.json';
const DEFAULT_STATE = {
  movies: [
    { id: 'interstellar', title: 'Интерстеллар', year: 2014, category: 'Фантастика', watched: false, hidden: false },
    { id: 'chernobyl', title: 'Чернобыль', year: 2019, category: 'Сериал', watched: false, hidden: false },
    { id: 'one-plus-one', title: '1+1', year: 2011, category: 'Комедия', watched: false, hidden: false },
    { id: 'knives-out', title: 'Достать ножи', year: 2019, category: 'Детектив', watched: false, hidden: false },
    { id: 'bodyguards', title: 'Телохранители', year: 2023, category: 'Комедия', watched: false, hidden: false },
    { id: 'titanic', title: 'Титаник', year: 1997, category: 'Романтика', watched: false, hidden: false },
    { id: 'home-alone', title: 'Один дома', year: 1990, category: 'Семейное', watched: false, hidden: false }
  ]
};

function validateInitData(initData, botToken) {
  if (typeof initData !== 'string' || !initData || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => key + '=' + value)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = createHmac('sha256', secret).update(checkString).digest('hex');
  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date'));
  const now = Date.now() / 1000;
  if (!Number.isFinite(authDate) || authDate > now + 30 || now - authDate > 86400) return null;
  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { return null; }
  if (!user || !Number.isSafeInteger(user.id)) return null;
  return { id: String(user.id), firstName: String(user.first_name || '') };
}

async function readState() {
  try {
    const result = await get(STATE_PATH, { access: 'private' });
    if (!result || result.statusCode === 404) return { state: DEFAULT_STATE, etag: null };
    if (!result || result.statusCode !== 200) throw new Error('Shared state unavailable');
    const raw = await new Response(result.stream).text();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.movies)) throw new Error('Invalid state');
    return { state: parsed, etag: result.blob.etag };
  } catch (error) {
    if (error && (error.status === 404 || error.statusCode === 404)) return { state: DEFAULT_STATE, etag: null };
    throw error;
  }
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'Mini App storage is not configured' });
  const auth = validateInitData(req.headers['x-telegram-init-data'] || (req.body && req.body.initData), token);
  if (!auth) return res.status(401).json({ error: 'Open this app from the Telegram bot' });
  const isAdmin = Boolean(ADMIN_ID && auth.id === ADMIN_ID);
  try {
    const current = await readState();
    if (req.method === 'GET') {
      // Hidden entries are admin-only data; do not expose them in guest API responses.
      const visibleState = isAdmin
        ? current.state
        : { ...current.state, movies: current.state.movies.filter(movie => !movie.hidden) };
      return res.status(200).json({ ...visibleState, role: isAdmin ? 'admin' : 'guest' });
    }
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const body = req.body || {};
    const action = body.action;
    let next;
    if (action === 'reorder') {
      if (!Array.isArray(body.order) || body.order.length !== current.state.movies.length) {
        return res.status(400).json({ error: 'Invalid movie order' });
      }
      const existingIds = current.state.movies.map(movie => movie.id).sort();
      const requestedIds = body.order.slice().sort();
      if (existingIds.some((id, index) => id !== requestedIds[index]) || new Set(body.order).size !== body.order.length) {
        return res.status(400).json({ error: 'Invalid movie order' });
      }
      const byId = new Map(current.state.movies.map(movie => [movie.id, movie]));
      next = { ...current.state, movies: body.order.map(id => byId.get(id)) };
    } else {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!current.state.movies.some(movie => movie.id === id)) return res.status(404).json({ error: 'Movie not found' });
      if (!['watched', 'hidden'].includes(action) || typeof body.value !== 'boolean') {
        return res.status(400).json({ error: 'Invalid action' });
      }
      next = {
        ...current.state,
        movies: current.state.movies.map(movie => movie.id !== id ? movie : ({
          ...movie,
          ...(action === 'watched' ? { watched: body.value } : {}),
          ...(action === 'hidden' ? { hidden: body.value } : {})
        }))
      };
    }
    await put(STATE_PATH, JSON.stringify(next), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      ...(current.etag ? { ifMatch: current.etag } : {})
    });
    return res.status(200).json({ ...next, role: 'admin' });
  } catch (error) {
    if (error && (error.status === 412 || error.name === 'BlobPreconditionFailedError')) {
      return res.status(409).json({ error: 'State changed. Refresh and try again.' });
    }
    console.error('Mini App state operation failed.');
    return res.status(500).json({ error: 'Could not update shared state' });
  }
};
