const { timingSafeEqual } = require('node:crypto');
const { sendMessage } = require('./telegram-client');
const {
  getReminder,
  isConfigured,
  removeReminderIfUnchanged,
  scheduleDelivery,
} = require('./reminder-store');

const MAX_QSTASH_DELAY_SECONDS = 6 * 24 * 60 * 60;

function secretsMatch(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
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

function formatReminder(reminder) {
  const night = ['00:00', '01:00', '02:00'].includes(reminder.time) ? 'Ночь на ' : '';
  return `Напоминание 🍿\nТы выбрала «${reminder.movie}» на ${night}${formatDate(reminder.date)}, ${reminder.time}.\nЧерез полчаса — смотреть!`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const callbackSecret = process.env.REMINDER_CALLBACK_SECRET;
  const authorization = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!callbackSecret || !match || !secretsMatch(callbackSecret, match[1])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!token || !isConfigured()) {
    return res.status(503).json({ error: 'Reminder service is not configured' });
  }

  const body = req.body;
  const chatId = body && body.chatId;
  const meetingAt = body && body.meetingAt;
  if (
    (typeof chatId !== 'string' && typeof chatId !== 'number')
    || !Number.isSafeInteger(meetingAt)
  ) {
    return res.status(400).json({ error: 'Invalid reminder payload' });
  }

  try {
    const reminder = await getReminder(chatId);
    if (!reminder || reminder.meetingAt !== meetingAt) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const reminderAt = Math.floor(meetingAt / 1000) - 30 * 60;
    const now = Math.floor(Date.now() / 1000);
    if (reminderAt > now) {
      await scheduleDelivery(
        chatId,
        meetingAt,
        Math.min(reminderAt, now + MAX_QSTASH_DELAY_SECONDS),
      );
      return res.status(200).json({ ok: true, rescheduled: true });
    }

    await sendMessage(token, chatId, formatReminder(reminder));
    await removeReminderIfUnchanged(chatId, meetingAt);
    return res.status(200).json({ ok: true, sent: true });
  } catch (error) {
    console.error('Reminder delivery failed.', error.message);
    return res.status(502).json({ error: 'Reminder delivery failed' });
  }
};
