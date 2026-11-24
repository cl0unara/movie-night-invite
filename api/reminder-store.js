const DATA_KEY = 'movie-night:reminders:data';
const MAX_QSTASH_DELAY_SECONDS = 6 * 24 * 60 * 60;
function getReminderCallbackUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (typeof host !== 'string' || !/^[a-z0-9.-]+$/i.test(host)) {
    throw new Error('VERCEL_PROJECT_PRODUCTION_URL is not configured');
  }
  return `https://${host}/api/reminders`;
}

function isConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL
    && process.env.UPSTASH_REDIS_REST_TOKEN
    && process.env.QSTASH_TOKEN
    && process.env.REMINDER_CALLBACK_SECRET
    && typeof process.env.VERCEL_PROJECT_PRODUCTION_URL === 'string'
    && /^[a-z0-9.-]+$/i.test(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  );
}

async function redisCommand(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Reminder storage is not configured');

  const response = await fetch(url.replace(/\/+$/, ''), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Reminder storage returned an invalid response');
  }
  if (!response.ok || result.error) {
    throw new Error('Reminder storage command failed');
  }
  return result.result;
}

async function scheduleDelivery(chatId, meetingAt, notBefore) {
  const token = process.env.QSTASH_TOKEN;
  const callbackSecret = process.env.REMINDER_CALLBACK_SECRET;
  if (!token || !callbackSecret) throw new Error('Reminder delivery is not configured');

  const response = await fetch(`https://qstash.upstash.io/v2/publish/${getReminderCallbackUrl()}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'upstash-not-before': String(notBefore),
      'upstash-forward-authorization': `Bearer ${callbackSecret}`,
      'upstash-forward-content-type': 'application/json',
    },
    body: JSON.stringify({ chatId: String(chatId), meetingAt }),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Reminder scheduler returned an invalid response');
  }
  if (!response.ok || !result.messageId) {
    throw new Error('Reminder scheduler rejected the request');
  }
}

async function scheduleReminder(chatId, plan) {
  const reminderAt = Math.floor(plan.meetingAt / 1000) - 30 * 60;
  const now = Math.floor(Date.now() / 1000);
  if (reminderAt <= now) {
    await cancelReminder(chatId);
    return false;
  }

  const data = JSON.stringify({
    chatId: String(chatId),
    movie: plan.movie,
    date: plan.date,
    time: plan.time,
    meetingAt: plan.meetingAt,
  });
  await redisCommand(['HSET', DATA_KEY, String(chatId), data]);
  await scheduleDelivery(
    chatId,
    plan.meetingAt,
    Math.min(reminderAt, now + MAX_QSTASH_DELAY_SECONDS),
  );
  return true;
}

async function cancelReminder(chatId) {
  await redisCommand(['HDEL', DATA_KEY, String(chatId)]);
}

async function getReminder(chatId) {
  const value = await redisCommand(['HGET', DATA_KEY, String(chatId)]);
  return value ? JSON.parse(value) : null;
}

async function removeReminderIfUnchanged(chatId, meetingAt) {
  const script = [
    "local value = redis.call('HGET', KEYS[1], ARGV[1])",
    'if value and tonumber(cjson.decode(value).meetingAt) == tonumber(ARGV[2]) then',
    "  return redis.call('HDEL', KEYS[1], ARGV[1])",
    'end',
    'return 0',
  ].join('; ');
  await redisCommand(['EVAL', script, 1, DATA_KEY, String(chatId), String(meetingAt)]);
}

module.exports = {
  cancelReminder,
  getReminder,
  isConfigured,
  removeReminderIfUnchanged,
  scheduleDelivery,
  scheduleReminder,
};
