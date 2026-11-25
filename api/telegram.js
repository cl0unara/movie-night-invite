const { timingSafeEqual } = require('node:crypto');
const {
  sendMessage,
  answerCallbackQuery,
  removeInlineKeyboard,
  TelegramRequestError,
} = require('./telegram-client');

const MOVIES = {
  i: 'Интерстеллар',
  c: 'Чернобыль',
  p: '1+1',
  k: 'Достать ножи',
  t: 'Телохранители',
  a: 'Титаник',
  h: 'Один дома',
};
const MOVIE_CODES = {
  Интерстеллар: 'i',
  Чернобыль: 'c',
  '1+1': 'p',
  'Достать ножи': 'k',
  'Телохранители': 't',
  'Титаник': 'a',
  'Один дома': 'h',
};
function isAllowedTime(time) {
  if (!/^\d{4}$/.test(time)) return false;
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(2));
  return hours >= 18 && hours <= 23 && minutes <= 45 && minutes % 15 === 0;
}

function secretsMatch(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function parsePlan(payload) {
  if (payload === 'no') return { accepted: false };

  const match = /^(yes|cancel)_([icpktah])_(\d{4}-\d{2}-\d{2})_(\d{4})(?:_[0-9a-z]+)?$/.exec(payload);
  if (!match || !isAllowedTime(match[4])) return null;

  const date = new Date(`${match[3]}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[3]) {
    return null;
  }

  return {
    accepted: match[1] === 'yes',
    cancelled: match[1] === 'cancel',
    movie: MOVIES[match[2]],
    date: match[3],
    time: `${match[4].slice(0, 2)}:${match[4].slice(2)}`,
  };
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateString}T00:00:00Z`));
}

function formatSenderName(from) {
  if (!from || typeof from !== 'object') return 'Пользователь Telegram';

  const name = [from.first_name, from.last_name]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .join(' ');
  const username = typeof from.username === 'string' && from.username.trim()
    ? `@${from.username.trim()}`
    : '';

  if (name && username) return `${name} (${username})`;
  return name || username || 'Пользователь Telegram';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !webhookSecret) {
    return res.status(503).json({ error: 'Telegram bot is not configured' });
  }
  if (adminChatId && !/^-?\d+$/.test(adminChatId)) {
    return res.status(503).json({ error: 'TELEGRAM_ADMIN_CHAT_ID must be numeric' });
  }

  if (!secretsMatch(webhookSecret, req.headers['x-telegram-bot-api-secret-token'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const callback = req.body && req.body.callback_query;
  if (callback) {
    const callbackChatId = callback.message && callback.message.chat && callback.message.chat.id;
    const callbackMessageId = callback.message && callback.message.message_id;
    const callbackData = callback.data;
    const callbackSender = formatSenderName(callback.from);
    const callbackPlan = typeof callbackData === 'string' ? parsePlan(callbackData) : null;

    if (!callback.id || !callbackChatId || !callbackMessageId || !callbackPlan || !callbackPlan.cancelled) {
      if (callback.id) await answerCallbackQuery(token, callback.id, 'Не удалось отменить эту запись.');
      return res.status(200).json({ ok: true });
    }
    if (!adminChatId) {
      await answerCallbackQuery(token, callback.id, 'Бот ещё настраивается.');
      return res.status(200).json({ ok: true });
    }

    try {
      await sendMessage(
        token,
        adminChatId,
        `Отмена договорённости 💔\nОт: ${callbackSender}\nФильм: ${callbackPlan.movie}\nОтменённый план: ${formatDate(callbackPlan.date)}, ${callbackPlan.time}`,
      );
      await removeInlineKeyboard(token, callbackChatId, callbackMessageId);
      await answerCallbackQuery(token, callback.id, 'Запись отменена.');
      await sendMessage(token, callbackChatId, 'Договорённость отменена. Спасибо, что предупредила ❤️');
      return res.status(200).json({ ok: true });
    } catch (error) {
      const detail = error instanceof TelegramRequestError ? ` (${error.message})` : '';
      console.error(`Telegram cancellation failed${detail}.`);
      return res.status(502).json({ error: 'Telegram cancellation failed' });
    }
  }

  const message = req.body && req.body.message;
  const chatId = message && message.chat && message.chat.id;
  const text = message && message.text;
  const senderName = formatSenderName(message && message.from);
  if ((typeof chatId !== 'number' && typeof chatId !== 'string') || typeof text !== 'string') {
    return res.status(200).json({ ok: true });
  }

  const start = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]+))?$/.exec(text.trim());
  if (!start) return res.status(200).json({ ok: true });

  const payload = start[1];
  try {
    if (!payload) {
      const greeting = adminChatId
        ? 'Бот подключён. Открой приглашение и отправь ответ через кнопку.'
        : `Твой chat ID: ${chatId}\nДобавь его в Vercel как TELEGRAM_ADMIN_CHAT_ID.`;
      await sendMessage(token, chatId, greeting);
      return res.status(200).json({ ok: true });
    }

    const plan = parsePlan(payload);
    if (!plan) {
      await sendMessage(token, chatId, 'Не удалось прочитать ответ. Открой приглашение и попробуй ещё раз.');
      return res.status(200).json({ ok: true });
    }
    if (!adminChatId) {
      await sendMessage(token, chatId, 'Бот ещё настраивается. Попробуй отправить ответ чуть позже.');
      return res.status(200).json({ ok: true });
    }

    if (plan.accepted) {
      const dateAndTime = `${formatDate(plan.date)}, ${plan.time}`;
      await sendMessage(
        token,
        adminChatId,
        `Новый ответ на приглашение 🎬\nОт: ${senderName}\nФильм: ${plan.movie}\nДата и время: ${dateAndTime}`,
      );
      const cancelPayload = `cancel_${MOVIE_CODES[plan.movie]}_${plan.date}_${plan.time.replace(':', '')}`;
      await sendMessage(token, chatId, 'Жду тебя, Газява ❤️\nЕсли планы изменятся, запись можно отменить кнопкой ниже.', {
        inline_keyboard: [[{ text: 'Отменить запись', callback_data: cancelPayload }]],
      });
    } else if (plan.cancelled) {
      await sendMessage(
        token,
        adminChatId,
        `Отмена договорённости 💔\nОт: ${senderName}\nФильм: ${plan.movie}\nОтменённый план: ${formatDate(plan.date)}, ${plan.time}`,
      );
      await sendMessage(token, chatId, 'Договорённость отменена. Спасибо, что предупредила ❤️');
    } else {
      await sendMessage(token, adminChatId, `Ответ на приглашение от ${senderName}: в этот раз не получится.`);
      await sendMessage(token, chatId, 'Спасибо, что ответила ❤️');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    const detail = error instanceof TelegramRequestError
      ? ` (${error.message})`
      : '';
    console.error(`Telegram message delivery failed${detail}.`);
    return res.status(502).json({ error: 'Telegram message delivery failed' });
  }
};
