const { timingSafeEqual } = require('node:crypto');
const { sendMessage, TelegramRequestError } = require('./telegram-client');
const { cancelReminder, scheduleReminder, isConfigured } = require('./reminder-store');

const MOVIES = {
  i: 'Интерстеллар',
  c: 'Чернобыль',
  p: '1+1',
};
const ALLOWED_TIMES = new Set(['1800', '1900', '2000', '2100', '2200', '2300', '0000', '0100', '0200']);

function secretsMatch(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function parsePlan(payload) {
  if (payload === 'no') return { accepted: false };

  const match = /^yes_([icp])_(\d{4}-\d{2}-\d{2})_(\d{4})(?:_([0-9a-z]+))?$/.exec(payload);
  if (!match || !ALLOWED_TIMES.has(match[3])) return null;

  const date = new Date(`${match[2]}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[2]) {
    return null;
  }

  const meetingMinute = match[4] ? Number.parseInt(match[4], 36) : null;
  if (match[4] && (
    !Number.isSafeInteger(meetingMinute)
    || meetingMinute <= 0
    || !Number.isSafeInteger(meetingMinute * 60000)
  )) return null;

  return {
    accepted: true,
    movie: MOVIES[match[1]],
    date: match[2],
    time: `${match[3].slice(0, 2)}:${match[3].slice(2)}`,
    meetingAt: meetingMinute === null ? null : meetingMinute * 60000,
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
      const night = ['00:00', '01:00', '02:00'].includes(plan.time) ? 'Ночь на ' : '';
      const dateAndTime = `${night}${formatDate(plan.date)}, ${plan.time}`;
      let reminderScheduled = false;
      if (plan.meetingAt !== null) {
        if (!isConfigured()) throw new Error('Reminder storage is not configured');
        reminderScheduled = await scheduleReminder(chatId, plan);
      }
      await sendMessage(
        token,
        adminChatId,
        `Новый ответ на приглашение 🎬\nОт: ${senderName}\nФильм: ${plan.movie}\nДата и время: ${dateAndTime}`,
      );
      const reply = reminderScheduled
        ? 'Жду тебя, Газява ❤️\nНапомню за полчаса до просмотра 🍿'
        : plan.meetingAt === null
          ? 'Жду тебя, Газява ❤️'
          : 'Жду тебя, Газява ❤️\nДо просмотра меньше 30 минут — заранее напомнить уже не успею.';
      await sendMessage(token, chatId, reply);
    } else {
      if (isConfigured()) await cancelReminder(chatId);
      await sendMessage(token, adminChatId, `Ответ на приглашение от ${senderName}: в этот раз не получится.`);
      await sendMessage(token, chatId, 'Спасибо, что ответила ❤️');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    const detail = error instanceof TelegramRequestError ? ` (${error.message})` : '';
    console.error(`Telegram message delivery failed${detail}.`);
    return res.status(502).json({ error: 'Telegram message delivery failed' });
  }
};
