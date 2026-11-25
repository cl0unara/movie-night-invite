const { validateTelegramInitData } = require('./telegram-auth');
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
  const auth = validateTelegramInitData(req.headers['x-telegram-init-data'], token);
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
