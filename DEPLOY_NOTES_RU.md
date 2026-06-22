# FamilyFinance — заметки по загрузке и деплою

Этот архив содержит полный исходный код проекта без `node_modules`, `.git`, `dist`, `.vercel` и локальных загрузок.

## Как загрузить в GitHub

1. Распакуйте архив.
2. Загрузите содержимое папки `familyfinance_full_project` в корень репозитория `sveeeOW/familyfinance` с заменой файлов.
3. Важно: загружать нужно именно содержимое папки, а не папку целиком внутрь репозитория.

Правильная структура в GitHub должна быть такой:

```text
apps/backend
apps/mobile
docs
docker-compose.yml
package.json
package-lock.json
```

## Backend в Vercel

Создайте отдельный Vercel-проект для backend.

Настройки:

```text
Application Preset: NestJS
Root Directory: apps/backend
Install Command: npm install --prefix=../..
Build Command: cd ../.. && npm run build -w @familyfinance/backend
Output Directory: пусто / N/A
```

Если этот вариант не сработает, альтернативная Build Command:

```bash
../../node_modules/.bin/prisma generate && ../../node_modules/.bin/nest build
```

Минимальные Environment Variables для backend:

```env
NODE_ENV=production
AI_PROVIDER=mock
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
REDIS_URL=redis://default:PASSWORD@HOST:6379
JWT_ACCESS_SECRET=replace_with_long_random_string
JWT_REFRESH_SECRET=replace_with_another_long_random_string
PUBLIC_URL=https://your-backend-url.vercel.app
CORS_ORIGINS=https://your-webapp-url.vercel.app
TELEGRAM_BOT_TOKEN=
ANTHROPIC_API_KEY=
```

## Webapp в Vercel

Создайте второй Vercel-проект для webapp.

Настройки:

```text
Application Preset: Other
Root Directory: apps/mobile
Install Command: npm install --prefix=../..
Build Command: npm run build:web
Output Directory: dist
```

Environment Variable:

```env
EXPO_PUBLIC_API_URL=https://your-backend-url.vercel.app
```

После деплоя откройте webapp-ссылку на iPhone через Safari и добавьте на экран «Домой».
