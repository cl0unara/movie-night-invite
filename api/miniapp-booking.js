const { createHmac, timingSafeEqual } = require('node:crypto');
const { sendMessage, TelegramRequestError } = require('./telegram-client');

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
  if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;
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
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(value + 'T12:00:00'));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !adminChatId || !/^-?\d+$/.test(adminChatId)) {
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
  const parsedDate = new Date(date + 'T12:00:00');
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return res.status(400).json({ error: 'Некорректная дата.' });
  }
  const [hours, minutes] = time.split(':').map(Number);
  if (hours < 18 || hours > 23 || minutes > 45 || minutes % 15 !== 0) {
    return res.status(400).json({ error: 'Выбери время с 18:00 до 23:45.' });
  }
  if (new Date(date + 'T' + time + ':00').getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Это время уже прошло. Выбери другое.' });
  }

  const dateAndTime = formatDate(date) + ', ' + time;
  const cancelPayload = 'cancel_' + movie[1] + '_' + date + '_' + time.replace(':', '');
  const sender = auth.name + (auth.username ? ' (' + auth.username + ')' : '');
  try {
    await sendMessage(
      token,
      adminChatId,
      'Новая запись на киновечер 🎬\nОт: ' + sender + '\nФильм: ' + movie[0] + '\nДата и время: ' + dateAndTime,
    );
    await sendMessage(
      token,
      auth.id,
      'Твой план на вечер готов! 💗\n\n🎬 ' + movie[0] + '\n📅 ' + dateAndTime + '\n\nДо встречи ❤️',
      { inline_keyboard: [[{ text: 'Отменить запись', callback_data: cancelPayload }]] },
    );
    return res.status(200).json({ ok: true, movie: movie[0], date, time });
  } catch (error) {
    const detail = error instanceof TelegramRequestError ? ' ' + error.message : '';
    console.error('Mini App booking delivery failed.' + detail);
    return res.status(502).json({ error: 'Не получилось отправить запись в Telegram. Попробуй ещё раз.' });
  }
};
