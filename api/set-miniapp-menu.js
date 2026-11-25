const { createHmac, timingSafeEqual } = require('node:crypto');

function validateInitData(initData, botToken) {
  if (typeof initData !== 'string' || !initData || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => key + '=' + value)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = createHmac('sha256', secret).update(checkString).digest('hex');
  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;
  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { return null; }
  if (!user || !Number.isSafeInteger(user.id)) return null;
  return String(user.id);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  const appUrl = process.env.TELEGRAM_MINI_APP_URL;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !adminId || !appUrl || !webhookSecret) return res.status(503).json({ error: 'Mini App is not configured' });
  const userId = validateInitData(req.headers['x-telegram-init-data'], token);
  if (!userId) return res.status(401).json({ error: 'Open this app from Telegram' });
  if (userId !== adminId) return res.status(403).json({ error: 'Admin access required' });

  try {
    const webhookResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: new URL(appUrl).origin + '/api/telegram',
        secret_token: webhookSecret,
        allowed_updates: ['message', 'callback_query'],
      }),
    });
    const webhookResult = await webhookResponse.json();
    if (!webhookResponse.ok || !webhookResult.ok) {
      console.error('Telegram webhook setup failed.');
      return res.status(502).json({ error: 'Telegram could not configure booking notifications' });
    }
    const menuResponse = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        menu_button: { type: 'web_app', text: 'Miniapp', web_app: { url: appUrl } },
      }),
    });
    const menuResult = await menuResponse.json();
    if (!menuResponse.ok || !menuResult.ok) {
      console.error('Telegram Mini App menu button setup failed.');
      return res.status(502).json({ error: 'Telegram could not set the Mini App menu button' });
    }

    // Confirm Telegram stored the global default button, not just accepted the write.
    const verifyResponse = await fetch(`https://api.telegram.org/bot${token}/getChatMenuButton`);
    const verifyResult = await verifyResponse.json();
    const configuredButton = verifyResult.result;
    const menuVerified = verifyResponse.ok
      && verifyResult.ok
      && configuredButton?.type === 'web_app'
      && configuredButton?.text === 'Miniapp'
      && configuredButton?.web_app?.url === appUrl;
    if (!menuVerified) {
      console.error('Telegram Mini App menu button verification failed.');
      return res.status(502).json({ error: 'Telegram did not confirm the Mini App menu button' });
    }
    return res.status(200).json({ ok: true, webhook: true, menu: true, menuVerified: true });
  } catch {
    console.error('Telegram Mini App menu or webhook setup failed.');
    return res.status(502).json({ error: 'Telegram could not configure the Mini App' });
  }
};
