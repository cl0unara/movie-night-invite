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
    console.error('Telegram API transport failed.', {
      method,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      causeCode: cause && typeof cause.code === 'string' ? cause.code : undefined,
    });
    throw new Error('Telegram API request failed');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    console.error('Telegram API returned an invalid response.', {
      method,
      status: response.status,
    });
    throw new Error('Telegram returned an invalid response');
  }
  if (!response.ok || !result.ok) {
    console.error('Telegram API request failed.', {
      method,
      status: response.status,
      errorCode: Number.isInteger(result.error_code) ? result.error_code : undefined,
      description: typeof result.description === 'string'
        ? result.description.slice(0, 200)
        : undefined,
    });
    throw new Error('Telegram rejected the request');
  }
}

async function sendMessage(token, chatId, text) {
  await telegramRequest(token, 'sendMessage', { chat_id: chatId, text });
}

module.exports = { sendMessage };
