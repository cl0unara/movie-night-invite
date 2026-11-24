async function telegramRequest(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  let result;
  try {
    result = await response.json();
  } catch {
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
