const { timingSafeEqual } = require('node:crypto');

function secretsMatch(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getDeploymentHost(req) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const value = process.env.VERCEL_PROJECT_PRODUCTION_URL
    || forwardedHost
    || req.headers.host
    || process.env.VERCEL_URL;
  if (typeof value !== 'string') return null;

  const host = value.split(',')[0].trim().replace(/^https?:\/\//, '').split('/')[0];
  return /^[a-z0-9.-]+$/i.test(host) ? host : null;
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

  const host = getDeploymentHost(req);
  if (!host) return res.status(503).json({ error: 'Could not determine deployment host' });

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `https://${host}/api/telegram`,
        secret_token: webhookSecret,
        allowed_updates: ['message'],
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
