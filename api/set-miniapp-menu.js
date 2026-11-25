const { validateTelegramInitData } = require('./telegram-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  const appUrl = process.env.TELEGRAM_MINI_APP_URL;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !adminId || !appUrl || !webhookSecret) return res.status(503).json({ error: 'Mini App is not configured' });
  const userId = validateTelegramInitData(req.headers['x-telegram-init-data'], token)?.id || null;
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
    return res.status(200).json({ ok: true, webhook: true, menu: true });
  } catch {
    console.error('Telegram Mini App menu or webhook setup failed.');
    return res.status(502).json({ error: 'Telegram could not configure the Mini App' });
  }
};
