class TelegramRequestError extends Error {}

async function telegramRequest(token, method, body) {
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const cause = error && typeof error === 'object' && error.cause
      && typeof error.cause === 'object'
      ? error.cause
      : null;
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const causeCode = cause && typeof cause.code === 'string' ? `, ${cause.code}` : '';
    throw new TelegramRequestError(`transport failure (${errorName}${causeCode})`);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new TelegramRequestError(`invalid response (HTTP ${response.status})`);
  }
  if (!response.ok || !result.ok) {
    const errorCode = Number.isInteger(result.error_code) ? `, code ${result.error_code}` : '';
    const description = typeof result.description === 'string'
      ? result.description.replace(/[\r\n\t]+/g, ' ').slice(0, 200)
      : 'API rejected request';
    throw new TelegramRequestError(`HTTP ${response.status}${errorCode}: ${description}`);
  }
}

async function sendMessage(token, chatId, text) {
  await telegramRequest(token, 'sendMessage', { chat_id: chatId, text });
}

module.exports = { sendMessage, TelegramRequestError };
