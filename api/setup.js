const { timingSafeEqual } = require('node:crypto');

function secretsMatch(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getDeploymentHost() {
  const configured = process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.TELEGRAM_MINI_APP_URL
    || process.env.VERCEL_URL;
  if (typeof configured !== 'string' || !configured.trim()) return null;

  try {
    const candidate = configured.includes('://') ? configured : 'https://' + configured;
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return /^[a-z0-9.-]+$/i.test(url.hostname) ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const setupSecret = process.env.WEBHOOK_SETUP_SECRET;
  if (!token || !webhookSecret || !setupSecret) {
    return res.status(503).json({ error: 'Webhook setup is not configured' });
  }
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
    return res.status(503).json({ error: 'TELEGRAM_WEBHOOK_SECRET has an invalid format' });
  }

  const authorization = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match || !secretsMatch(setupSecret, match[1])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const host = getDeploymentHost();
  if (!host) return res.status(503).json({ error: 'Could not determine deployment host' });

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `https://${host}/api/telegram`,
        secret_token: webhookSecret,
        allowed_updates: ['message', 'callback_query'],
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      console.error('Telegram webhook setup failed.');
      return res.status(502).json({ error: 'Telegram could not register the webhook' });
    }
    return res.status(200).json({ ok: true, message: 'Telegram webhook configured' });
  } catch {
    console.error('Telegram webhook setup failed.');
    return res.status(502).json({ error: 'Telegram could not register the webhook' });
  }
};
