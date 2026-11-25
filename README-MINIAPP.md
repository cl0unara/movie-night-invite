# Telegram Mini App

- App URL: `https://movie-night-invite-vercel.vercel.app/miniapp.html`
- State API: `/api/miniapp-state`
- Access is authenticated using Telegram Web App initData; the admin ID is checked server-side.
- Shared state is stored in the project's private Vercel Blob store.
- Required environment variables: `TELEGRAM_BOT_TOKEN`, `BLOB_READ_WRITE_TOKEN`.
- Configure the bot's Web App button with the production URL only after the Mini App has been deployed and verified.
