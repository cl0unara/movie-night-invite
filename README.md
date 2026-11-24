# Киновечер

Отдельная страница-приглашение. Не связана с проектом Sfera.

## Запуск страницы на компьютере

Можно открыть `index.html` напрямую или запустить локальный сервер:

```powershell
python -m http.server 8000
```

Затем открой `http://localhost:8000`.

## Ответы через Telegram-бота

Сайт открывает бота `@priglosgazavy2026_bot` с выбранным ответом. Девушке нужно нажать **Start** в чате с ботом: Telegram не позволяет боту первым начинать переписку. После этого бот отправит имя отправителя, выбранный фильм, дату и время в личный чат владельца и ответит ей «Жду тебя, Газява ❤️». При отказе бот уведомит владельца и поблагодарит её.

Для обработки ответов используется серверная функция Vercel. Токен бота хранится только в переменных окружения Vercel, не добавляй его в файлы сайта или GitHub.

### Настройка

1. Создай проект Vercel из GitHub-репозитория `cl0unara/movie-night-invite`.
2. В **Settings → Environment Variables** добавь:
   - `TELEGRAM_BOT_TOKEN` — токен от BotFather.
   - `TELEGRAM_WEBHOOK_SECRET` — случайная строка из латинских букв, цифр, `_` и `-`.
   - `WEBHOOK_SETUP_SECRET` — отдельная случайная строка для защиты настройки webhook.
3. Переразверни проект после добавления переменных.
4. Один раз зарегистрируй webhook из PowerShell, заменив адрес Production-домена проекта и секрет. Используй постоянный адрес проекта, а не адрес отдельного deployment:

   ```powershell
   $headers = @{ Authorization = "Bearer <WEBHOOK_SETUP_SECRET>" }
   Invoke-RestMethod -Method Post -Uri "https://<адрес-проекта>.vercel.app/api/setup" -Headers $headers
   ```

5. Открой `@priglosgazavy2026_bot` в Telegram и отправь `/start`. Пока `TELEGRAM_ADMIN_CHAT_ID` не задан, бот ответит числовым chat ID.
6. Добавь это значение в Vercel как `TELEGRAM_ADMIN_CHAT_ID` и снова переразверни проект.

Случайные значения для двух секретов можно получить локально командой:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Выполни её дважды и сохрани результаты в соответствующие переменные Vercel. Не публикуй их и не отправляй в чат.

Настройка webhook заменяет прежний webhook этого же бота, если он был настроен. Выполняй её только для этого сайта.

### Напоминание за 30 минут

После принятия приглашения бот ставит напоминание в тот же Telegram-чат за 30 минут до выбранного локального времени. Для доставки используется QStash; активный выбор хранится в Upstash Redis, чтобы устаревшие напоминания пропускались, если ответ изменили.

Чтобы включить напоминания:

1. Создай базу в [Upstash Redis](https://console.upstash.com/redis) и скопируй HTTPS REST URL и REST token.
2. Открой [Upstash QStash](https://console.upstash.com/qstash) и скопируй `QSTASH_TOKEN` из Quickstart.
3. В Vercel → **Settings → Environment Variables** добавь для Production:
   - `UPSTASH_REDIS_REST_URL` — HTTPS REST URL базы Upstash.
   - `UPSTASH_REDIS_REST_TOKEN` — REST token этой базы.
   - `QSTASH_TOKEN` — токен QStash.
   - `REMINDER_CALLBACK_SECRET` — случайная длинная строка для проверки вызовов QStash.
4. Убедись, что в настройках Vercel включены System Environment Variables: обработчик берёт `VERCEL_PROJECT_PRODUCTION_URL` и отправляет callback на `/api/reminders` этого же Production-проекта. Это важно: адрес второго Vercel-проекта в коде не используется.
5. Переразверни Production в Vercel.

Бесплатный QStash ограничивает одно отложенное сообщение семью днями; приложение автоматически продлевает ожидание для более поздних дат. Не добавляй токены и секреты в код или GitHub и не отправляй их в чат.

## GitHub Pages

Статическую страницу можно продолжать публиковать через GitHub Pages. Для автоматической отправки ответов также должен быть развёрнут Vercel-обработчик из того же репозитория.
