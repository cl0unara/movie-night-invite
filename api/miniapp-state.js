const { createHmac, timingSafeEqual } = require('node:crypto');
const { get, put, head } = require('@vercel/blob');

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;
const STATE_PATH = 'movie-night/shared-state.json';
const DEFAULT_STATE = {
  movies: [
    { id: 'interstellar', title: 'Интерстеллар', year: 2014, watched: false, hidden: false },
    { id: 'chernobyl', title: 'Чернобыль', year: 2019, watched: false, hidden: false },
    { id: 'one-plus-one', title: '1+1', year: 2011, watched: false, hidden: false },
    { id: 'knives-out', title: 'Достать ножи', year: 2019, watched: false, hidden: false },
    { id: 'bodyguards', title: 'Телохранители', year: 2023, watched: false, hidden: false },
    { id: 'titanic', title: 'Титаник', year: 1997, watched: false, hidden: false },
    { id: 'home-alone', title: 'Один дома', year: 1990, watched: false, hidden: false }
  ]
};

function validateInitData(initData, botToken) {
  if (typeof initData !== 'string' || !initData || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete('hash');
  params.delete('signature');
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => key + '=' + value)
    .join('\n');
  const secret = createHmac('sha256', botToken).update('WebAppData').digest();
  const calculated = createHmac('sha256', secret).update(checkString).digest('hex');
  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;
  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { return null; }
  if (!user || !Number.isSafeInteger(user.id)) return null;
  return { id: String(user.id), firstName: String(user.first_name || '') };
}

async function readState() {
  try {
    const result = await get(STATE_PATH, { access: 'private' });
    if (!result || result.statusCode !== 200) return { state: DEFAULT_STATE, etag: null };
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
  const isAdmin = auth.id === ADMIN_ID;
  try {
    const current = await readState();
    if (req.method === 'GET') return res.status(200).json({ ...current.state, role: isAdmin ? 'admin' : 'guest' });
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const body = req.body || {};
    const id = typeof body.id === 'string' ? body.id : '';
    const action = body.action;
    if (!current.state.movies.some(movie => movie.id === id)) return res.status(404).json({ error: 'Movie not found' });
    const next = {
      ...current.state,
      movies: current.state.movies.map(movie => movie.id !== id ? movie : ({
        ...movie,
        ...(action === 'watched' ? { watched: Boolean(body.value) } : {}),
        ...(action === 'hidden' ? { hidden: Boolean(body.value) } : {})
      }))
    };
    if (!['watched', 'hidden'].includes(action) || typeof body.value !== 'boolean') return res.status(400).json({ error: 'Invalid action' });
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
