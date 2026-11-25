const { timingSafeEqual } = require('node:crypto');
const {
  sendMessage,
  setChatMenuButton,
  answerCallbackQuery,
  removeInlineKeyboard,
  TelegramRequestError,
} = require('./telegram-client');
const { createBooking, cancelBooking, markBookingNotification } = require('./booking-store');

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

  const match = /^(yes|cancel)_([icpktah])_(\d{4}-\d{2}-\d{2})_(\d{4})(?:_([0-9a-z]+))?$/.exec(payload);
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
    userId: match[5] && /^\\d+$/.test(match[5]) ? match[5] : null,
    movieId: ({ i: 'interstellar', c: 'chernobyl', p: 'one-plus-one', k: 'knives-out', t: 'bodyguards', a: 'titanic', h: 'home-alone' })[match[2]],
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
    const callbackChatType = callback.message && callback.message.chat && callback.message.chat.type;
    const callbackUserId = callback.from && callback.from.id;
    const callbackData = callback.data;
    const callbackSender = formatSenderName(callback.from);
    const callbackPlan = typeof callbackData === 'string' ? parsePlan(callbackData) : null;

    if (!callback.id || !callbackChatId || !callbackMessageId || callbackChatType !== 'private'
      || String(callbackUserId) !== String(callbackChatId) || !callbackPlan || !callbackPlan.cancelled) {
      if (callback.id) await answerCallbackQuery(token, callback.id, 'Не удалось отменить эту запись.');
      return res.status(200).json({ ok: true });
    }
    if (!adminChatId) {
      await answerCallbackQuery(token, callback.id, 'Бот ещё настраивается.');
      return res.status(200).json({ ok: true });
    }

    if (!callbackPlan.userId || callbackPlan.userId !== String(callbackUserId)) {
      await answerCallbackQuery(token, callback.id, 'Эта кнопка устарела. Открой актуальную запись в чате.');
      return res.status(200).json({ ok: true });
    }

    try {
      await answerCallbackQuery(token, callback.id, 'Отменяем запись…');
      const result = await cancelBooking({
        userId: callbackUserId,
        movieId: callbackPlan.movieId,
        date: callbackPlan.date,
        time: callbackPlan.time,
      });
      if (result.status === 'not_found') {
        await sendMessage(token, callbackChatId, 'Не нашёл активную запись для отмены. Если планы изменились, напиши мне напрямую ❤️');
        return res.status(200).json({ ok: true });
      }
      const booking = result.booking;
      if (!booking.cancellationAdminNotifiedAt) {
        await sendMessage(
          token,
          adminChatId,
          `Отмена договорённости 💔\nОт: ${callbackSender}\nФильм: ${callbackPlan.movie}\nОтменённый план: ${formatDate(callbackPlan.date)}, ${callbackPlan.time}`,
        );
        await markBookingNotification({ userId: callbackUserId, movieId: callbackPlan.movieId, date: callbackPlan.date, time: callbackPlan.time, field: 'cancellationAdminNotifiedAt' });
      }
      await removeInlineKeyboard(token, callbackChatId, callbackMessageId);
      if (!booking.cancellationGuestNotifiedAt) {
        await sendMessage(token, callbackChatId, 'Договорённость отменена. Спасибо, что предупредила ❤️');
        await markBookingNotification({ userId: callbackUserId, movieId: callbackPlan.movieId, date: callbackPlan.date, time: callbackPlan.time, field: 'cancellationGuestNotifiedAt' });
      }
      return res.status(200).json({ ok: true });
    } catch (error) {
      const detail = error instanceof TelegramRequestError ? ` (${error.message})` : '';
      console.error(`Telegram cancellation failed${detail}.`);
      try {
        await sendMessage(token, callbackChatId, 'Отмена сохранена, но уведомление не удалось доставить. Попробуй нажать кнопку ещё раз — я повторю отправку.');
      } catch {}
      return res.status(500).json({ error: 'Cancellation notification delivery failed' });
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
  // Keep /start silent and expose the Mini App directly in this chat's menu.
  // Telegram does not provide a Bot API method to force-open a Web App from /start.
  if (!payload) {
    const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL;
    if (miniAppUrl && /^https:\/\/[a-z0-9.-]+(?:\/.*)?$/i.test(miniAppUrl)) {
      try {
        await setChatMenuButton(token, chatId, miniAppUrl);
      } catch (error) {
        console.error('Could not set the chat Mini App menu button.');
      }
    }
    return res.status(200).json({ ok: true });
  }

  try {
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
      const booking = await createBooking({
        userId: String(chatId),
        movieId: plan.movieId,
        movieTitle: plan.movie,
        date: plan.date,
        time: plan.time,
        guestName: senderName,
        guestUsername: '',
      });
      if (!booking.adminNotifiedAt) {
        await sendMessage(
          token,
          adminChatId,
          `Новый ответ на приглашение 🎬\\nОт: ${senderName}\\nФильм: ${plan.movie}\\nДата и время: ${dateAndTime}`,
        );
        await markBookingNotification({ userId: chatId, movieId: plan.movieId, date: plan.date, time: plan.time, field: 'adminNotifiedAt' });
      }
      if (!booking.guestNotifiedAt) {
        const cancelPayload = `cancel_${MOVIE_CODES[plan.movie]}_${plan.date}_${plan.time.replace(':', '')}_${chatId}`;
        await sendMessage(token, chatId, 'Жду тебя, Газява ❤️\\nЕсли планы изменятся, запись можно отменить кнопкой ниже.', {
          inline_keyboard: [[{ text: 'Отменить запись', callback_data: cancelPayload }]],
        });
        await markBookingNotification({ userId: chatId, movieId: plan.movieId, date: plan.date, time: plan.time, field: 'guestNotifiedAt' });
      }
    } else if (plan.cancelled) {
      const result = await cancelBooking({ userId: chatId, movieId: plan.movieId, date: plan.date, time: plan.time });
      if (result.status === 'not_found') {
        await sendMessage(token, chatId, 'Не нашёл активную запись для отмены. Если планы изменились, напиши мне напрямую ❤️');
      } else {
        const booking = result.booking;
        if (!booking.cancellationAdminNotifiedAt) {
          await sendMessage(
            token,
            adminChatId,
            `Отмена договорённости 💔\\nОт: ${senderName}\\nФильм: ${plan.movie}\\nОтменённый план: ${formatDate(plan.date)}, ${plan.time}`,
          );
          await markBookingNotification({ userId: chatId, movieId: plan.movieId, date: plan.date, time: plan.time, field: 'cancellationAdminNotifiedAt' });
        }
        if (!booking.cancellationGuestNotifiedAt) {
          await sendMessage(token, chatId, 'Договорённость отменена. Спасибо, что предупредила ❤️');
          await markBookingNotification({ userId: chatId, movieId: plan.movieId, date: plan.date, time: plan.time, field: 'cancellationGuestNotifiedAt' });
        }
      }
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
