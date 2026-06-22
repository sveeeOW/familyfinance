# Family Finance / Семейный финансовый портфель

Многопользовательское приложение для учёта личных и совместных финансов семьи или группы.
Доходы, расходы, кредиты, обязательные платежи, инвестиции, прогнозы и аналитика — с быстрым
добавлением расходов через **Telegram-бота** (распознавание скриншотов чеков и банковских
уведомлений через AI) или вручную в мобильном приложении.

> Это MVP-реализация по ТЗ. Архитектура заложена с расчётом на будущие банковские интеграции,
> расширенную аналитику, платные тарифы и web-версию.

## Состав репозитория (монорепо)

```
familyfinance/
├── apps/
│   ├── backend/   — NestJS + Prisma + PostgreSQL: REST API, Telegram-бот, AI-распознавание
│   └── mobile/    — React Native (Expo) + TypeScript: мобильное приложение iOS/Android
├── docker-compose.yml — Postgres + Redis + backend одной командой
└── README.md
```

## Технологический стек

| Слой            | Технологии                                                            |
|-----------------|-----------------------------------------------------------------------|
| Backend         | Node.js, **NestJS**, TypeScript, **Prisma ORM**, **PostgreSQL**, Redis (BullMQ) |
| Авторизация     | JWT access + refresh токены, bcrypt-хеш паролей                        |
| Telegram-бот    | Telegraf (long-poll в dev / webhook в prod), модуль внутри backend     |
| AI / OCR        | **Vision-LLM (Claude `claude-sonnet-4-6`)** — распознавание чека одним вызовом + rule-based фолбэк |
| Хранилище файлов| S3-совместимое (скриншоты чеков); локальный диск в dev                 |
| Mobile          | React Native + **Expo**, TypeScript, Zustand, React Navigation         |

### Почему vision-LLM вместо классического OCR

ТЗ описывает пайплайн «OCR → AI-категоризация». Мы реализуем его одним шагом: скриншот
отправляется в мультимодальную модель, которая сразу возвращает структурированный JSON
(сумма, дата, продавец, назначение, категория, `confidence`, вопрос на уточнение). Для
русских банковских уведомлений и чеков это точнее, чем Tesseract + регэкспы, и убирает один
источник ошибок. Всё спрятано за интерфейсом `ReceiptParser` (`apps/backend/src/ai`), так что
провайдера (Claude / GPT-4o / Tesseract+LLM / собственная модель) можно поменять одной строкой.

## Быстрый старт (Docker)

```bash
cp apps/backend/.env.example apps/backend/.env   # заполните ANTHROPIC_API_KEY и TELEGRAM_BOT_TOKEN
docker compose up -d                              # Postgres + Redis + backend
# применить миграции и засеять системные категории:
docker compose exec backend npm run prisma:deploy
docker compose exec backend npm run seed
```

API поднимется на `http://localhost:3000`, Swagger-доки — `http://localhost:3000/docs`.

## Локальный запуск backend без Docker

```bash
cd apps/backend
npm install
cp .env.example .env          # пропишите DATABASE_URL, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN
npm run prisma:generate
npm run prisma:migrate         # создаст схему в вашей Postgres
npm run seed                   # системные категории
npm run start:dev              # API + Telegram-бот (long polling)
```

## Мобильное приложение

```bash
cd apps/mobile
npm install
cp .env.example .env           # EXPO_PUBLIC_API_URL=http://<ваш-ip>:3000
npm start                      # Expo: запуск на iOS/Android/симуляторе
```

## Карта реализованного (по разделам ТЗ)

- **§5 Авторизация** — register/login/logout/refresh/forgot/reset, JWT+refresh, удаление аккаунта.
- **§6 Портфели** — создание, типы, invite-ссылки, роли и 4 уровня прав доступа.
- **§7 Доходы** — типы, ежемесячная зарплата, периодичность, прогноз дохода.
- **§8–9 Расходы и категории** — обязательные/переменные/разовые, split-логика, системные категории, правила автокатегоризации.
- **§10–11 Telegram-бот + AI** — привязка аккаунта, текст и скриншот, confidence, статусы, обучение на правках, защита от дублей (§28).
- **§12 Кредиты** — график платежей, напоминания.
- **§13 Инвестиции и дивиденды** — ручной ввод, прогноз.
- **§16 Бюджеты и лимиты**, **§17 Прогнозирование**, **§22 Split**, **§23 Аналитика**.

Подробный статус — в [docs/STATUS.md](docs/STATUS.md).

## Лицензия

Частный проект. Все права защищены владельцем репозитория.
