const { createHmac, timingSafeEqual } = require('node:crypto');
const { get } = require('@vercel/blob');
const { sendMessage, TelegramRequestError } = require('./telegram-client');
const { createBooking, markBookingNotification } = require('./booking-store');

const STATE_PATH = 'movie-night/shared-state.json';
const MOVIES = {
  interstellar: ['Интерстеллар', 'i'],
  chernobyl: ['Чернобыль', 'c'],
  'one-plus-one': ['1+1', 'p'],
  'knives-out': ['Достать ножи', 'k'],
  bodyguards: ['Телохранители', 't'],
  titanic: ['Титаник', 'a'],
  'home-alone': ['Один дома', 'h'],
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
  return {
    id: String(user.id),
    name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'Гость',
    username: typeof user.username === 'string' ? '@' + user.username : '',
  };
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(value + 'T12:00:00Z'));
}

async function isMovieAvailable(movieId) {
  try {
    const result = await get(STATE_PATH, { access: 'private' });
    if (!result || result.statusCode === 404) {
      return Object.prototype.hasOwnProperty.call(MOVIES, movieId);
    }
    if (!result || result.statusCode !== 200) throw new Error('Shared movie state unavailable');
    const parsed = JSON.parse(await new Response(result.stream).text());
    if (!parsed || !Array.isArray(parsed.movies)) throw new Error('Invalid shared movie state');
    return parsed.movies.some(movie => movie && movie.id === movieId && !movie.hidden && !movie.watched);
  } catch (error) {
    if (error && (error.status === 404 || error.statusCode === 404)) {
      return Object.prototype.hasOwnProperty.call(MOVIES, movieId);
    }
    throw error;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !adminChatId || !/^-?\d+$/.test(adminChatId) || !process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Бот ещё не настроен для получения записей. Напиши администратору.' });
  }
  const auth = validateInitData(req.headers['x-telegram-init-data'] || (req.body && req.body.initData), token);
  if (!auth) return res.status(401).json({ error: 'Открой киноплан через Telegram-бота и попробуй снова.' });

  const body = req.body || {};
  const movie = MOVIES[body.movieId];
  const date = typeof body.date === 'string' ? body.date : '';
  const time = typeof body.time === 'string' ? body.time : '';
  if (!movie || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'Проверь выбранный фильм, дату и время.' });
  }
  let movieAvailable;
  try {
    movieAvailable = await isMovieAvailable(body.movieId);
  } catch {
    return res.status(503).json({ error: 'Не удалось проверить каталог. Попробуй ещё раз позже.' });
  }
  if (!movieAvailable) return res.status(409).json({ error: 'Этот фильм больше недоступен. Обнови каталог и выбери другой.' });

  const [year, month, day] = date.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return res.status(400).json({ error: 'Некорректная дата.' });
  }
  const [hours, minutes] = time.split(':').map(Number);
  if (hours < 18 || hours > 23 || minutes > 45 || minutes % 15 !== 0) {
    return res.status(400).json({ error: 'Выбери время с 18:00 до 23:45.' });
  }
  const offset = body.timeZoneOffsetMinutes;
  if (!Number.isInteger(offset) || offset < -840 || offset > 840) {
    return res.status(400).json({ error: 'Не удалось определить часовой пояс. Перезапусти приложение.' });
  }
  // Date/time are entered in the guest's local timezone; getTimezoneOffset is UTC - local.
  const bookingTimestamp = Date.UTC(year, month - 1, day, hours, minutes) + offset * 60 * 1000;
  if (bookingTimestamp <= Date.now()) {
    return res.status(400).json({ error: 'Это время уже прошло. Выбери другое.' });
  }

  const dateAndTime = formatDate(date) + ', ' + time;
  const cancelPayload = 'cancel_' + movie[1] + '_' + date + '_' + time.replace(':', '') + '_' + auth.id;
  const sender = auth.name + (auth.username ? ' (' + auth.username + ')' : '');
  try {
    const booking = await createBooking({
      userId: auth.id,
      movieId: body.movieId,
      movieTitle: movie[0],
      date,
      time,
      timeZoneOffsetMinutes: offset,
      guestName: auth.name,
      guestUsername: auth.username,
    });
    if (!booking.adminNotifiedAt) {
      await sendMessage(
        token,
        adminChatId,
        'Новая запись на киновечер 🎬\\nОт: ' + sender + '\\nФильм: ' + movie[0] + '\\nДата и время: ' + dateAndTime,
      );
      await markBookingNotification({ userId: auth.id, movieId: body.movieId, date, time, field: 'adminNotifiedAt' });
    }
    if (!booking.guestNotifiedAt) {
      await sendMessage(
        token,
        auth.id,
        'Твой план на вечер готов! 💗\\n\\n🎬 ' + movie[0] + '\\n📅 ' + dateAndTime + '\\n\\nДо встречи ❤️',
        { inline_keyboard: [[{ text: 'Отменить запись', callback_data: cancelPayload }]] },
      );
      await markBookingNotification({ userId: auth.id, movieId: body.movieId, date, time, field: 'guestNotifiedAt' });
    }
    return res.status(200).json({ ok: true, movie: movie[0], date, time });
  } catch (error) {
    const detail = error instanceof TelegramRequestError ? ' ' + error.message : '';
    console.error('Mini App booking delivery failed.' + detail);
    return res.status(502).json({ error: 'Не получилось отправить запись в Telegram. Попробуй ещё раз.' });
  }
};
