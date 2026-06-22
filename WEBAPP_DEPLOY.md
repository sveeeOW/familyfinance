# Family Finance WebApp / PWA deployment

## Цель

Сделать webapp-версию приложения, чтобы открывать Family Finance на iPhone через Safari и добавлять на экран «Домой», без TestFlight и без iOS-сборки.

## Схема

```text
GitHub → Vercel → apps/mobile как webapp
Backend → Render/Railway/Fly.io
PostgreSQL → Supabase/Neon/Railway
Redis → Upstash/Railway
iPhone → Safari → Add to Home Screen
```

## Backend

Backend должен быть доступен по HTTPS. Пример:

```env
PUBLIC_URL=https://familyfinance-api.onrender.com
CORS_ORIGINS=https://familyfinance.vercel.app
AI_PROVIDER=mock
```

## Mobile / Vercel

Создать проект в Vercel из GitHub-репозитория.

Настройки:

```text
Root Directory: apps/mobile
Framework Preset: Other
Build Command: npm run build:web
Output Directory: dist
Install Command: npm install
```

Environment Variables:

```env
EXPO_PUBLIC_API_URL=https://familyfinance-api.onrender.com
```

## Локальная проверка

```bash
cd apps/mobile
npm install
npm run build:web
npx expo serve
```

Открыть локальную ссылку из терминала и проверить регистрацию/вход.

## iPhone

1. Открыть ссылку Vercel в Safari.
2. Нажать Share.
3. Выбрать Add to Home Screen.
4. Включить Open as Web App, если доступно.
5. Нажать Add.

## Важно

- Не использовать `localhost` в `EXPO_PUBLIC_API_URL` для телефона.
- Для webapp нужен backend в интернете.
- Service Worker пока намеренно не добавлен, чтобы не поймать проблемы с кэшем на раннем этапе.
- Webapp не заменяет полноценное iOS-приложение, но отлично подходит для MVP-тестирования.
