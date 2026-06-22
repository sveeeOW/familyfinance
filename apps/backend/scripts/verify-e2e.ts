/* eslint-disable no-console */
/**
 * End-to-end проверка backend без Docker:
 *  1. поднимает встроенный PostgreSQL (embedded-postgres),
 *  2. применяет схему (prisma db push) и сидит категории,
 *  3. запускает реальное Nest-приложение,
 *  4. прогоняет основной пользовательский сценарий (§31) через HTTP,
 *  5. печатает отчёт и гасит всё.
 *
 * Запуск: npm run verify:e2e
 */
import { execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

const PORT = 3999;
const PG_PORT = 54329;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}`, extra ?? '');
  }
}

async function http(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function main() {
  // embedded-postgres — ESM-only пакет; грузим динамически, минуя CommonJS-резолвер ts-node.
  const importEsm = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
  const { default: EmbeddedPostgres } = await importEsm('embedded-postgres');

  const dataDir = path.join(os.tmpdir(), `ff-pg-${Date.now()}`);
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PG_PORT,
    persistent: false,
  });

  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/familyfinance?schema=public`;
  process.env.DATABASE_URL = databaseUrl;
  process.env.AI_PROVIDER = 'mock';
  process.env.TELEGRAM_BOT_TOKEN = '';
  process.env.JWT_ACCESS_SECRET = 'test-access';
  process.env.JWT_REFRESH_SECRET = 'test-refresh';
  process.env.PORT = String(PORT);

  console.log('▶ Запуск встроенного PostgreSQL…');
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('familyfinance');

  console.log('▶ prisma db push…');
  execSync('npx prisma db push --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  console.log('▶ Сидирование категорий…');
  execSync('npx ts-node prisma/seed.ts', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  console.log('▶ Старт Nest-приложения…');
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(PORT);

  try {
    console.log('\n=== Сценарий «Семейный бюджет» (§31) ===');

    // 1. Регистрация Евгения (§5.1) + авто-создание личного портфеля
    const reg = await http('POST', '/auth/register', {
      name: 'Евгений',
      email: `evg_${Date.now()}@example.com`,
      password: 'StrongPass123',
    });
    check('Регистрация возвращает токены', !!reg.json?.accessToken, reg.json);
    const t1 = reg.json.accessToken;

    // 2. Профиль
    const me = await http('GET', '/users/me', undefined, t1);
    check('GET /users/me возвращает имя', me.json?.name === 'Евгений', me.json);

    // 3. Личный портфель создан автоматически
    let portfolios = (await http('GET', '/portfolios', undefined, t1)).json;
    check('Автоматически создан личный портфель', Array.isArray(portfolios) && portfolios.length === 1, portfolios);

    // 4. Системные категории доступны (§9.1)
    const personalId = portfolios[0].id;
    const cats = (await http('GET', `/categories?portfolioId=${personalId}`, undefined, t1)).json;
    check('24 системные категории засеяны', Array.isArray(cats) && cats.length >= 24, cats?.length);
    const productsCat = cats.find((c: any) => c.name === 'Продукты');

    // 5. Создание совместного портфеля (§6.1)
    const fam = (await http('POST', '/portfolios', { name: 'Семейный бюджет', type: 'SHARED' }, t1)).json;
    check('Создан совместный портфель', fam?.type === 'SHARED', fam);

    // 6. Зарплата (§7.2)
    const income = await http(
      'POST',
      '/incomes',
      { portfolioId: fam.id, type: 'SALARY', amount: 225000, date: '2026-06-05', paymentDay: 5 },
      t1,
    );
    check('Добавлена зарплата 225000', Number(income.json?.amount) === 225000, income.json);

    // 7. Обязательный платёж (§8.2)
    const recurring = await http(
      'POST',
      '/recurring-payments',
      { portfolioId: fam.id, title: 'Оплата квартиры', amount: 75000, paymentDay: 1 },
      t1,
    );
    check('Добавлен обязательный платёж', recurring.status === 201, recurring.json);

    // 8. Кредит (§12.1)
    const credit = await http(
      'POST',
      '/credits',
      { portfolioId: fam.id, title: 'Ипотека', initialAmount: 5000000, remainingAmount: 4200000, monthlyPayment: 55000, paymentDay: 10 },
      t1,
    );
    check('Добавлен кредит с графиком', !!credit.json?.schedule?.monthsLeft, credit.json?.schedule);

    // 9. Ручной расход (§8.3)
    const exp1 = await http(
      'POST',
      '/expenses',
      { portfolioId: fam.id, amount: 8000, categoryId: productsCat.id, merchant: 'Перекрёсток', scope: 'SHARED' },
      t1,
    );
    check('Добавлен ручной расход', Number(exp1.json?.amount) === 8000, exp1.json);

    // 10. AI-распознавание текста (§10.6) в mock-режиме
    const recog = await http(
      'POST',
      '/ai/recognize-expense',
      { portfolioId: fam.id, text: 'Потратил 2500 на продукты в Перекрёстке' },
      t1,
    );
    check('AI распознал сумму 2500', recog.json?.parsed?.amount === 2500, recog.json?.parsed);
    check('AI предложил категорию Продукты', recog.json?.resolvedCategoryName === 'Продукты', recog.json?.resolvedCategoryName);

    // 11. Подтверждение распознанного расхода (§10.4)
    const confirm = await http('POST', '/ai/confirm-expense', { logId: recog.json.logId }, t1);
    check('Распознанный расход подтверждён и создан', !!confirm.json?.expenseId, confirm.json);

    // 12. Приглашение второго участника (§6.2)
    const invite = await http('POST', `/portfolios/${fam.id}/invite`, {}, t1);
    check('Сгенерирована invite-ссылка', !!invite.json?.token, invite.json);

    // 13. Регистрация Анны и приём приглашения (§6.2)
    const reg2 = await http('POST', '/auth/register', {
      name: 'Анна',
      email: `anna_${Date.now()}@example.com`,
      password: 'StrongPass123',
    });
    const t2 = reg2.json.accessToken;
    const accept = await http('POST', `/invites/${invite.json.token}/accept`, {}, t2);
    check('Анна приняла приглашение', accept.json?.success === true, accept.json);

    const members = (await http('GET', `/portfolios/${fam.id}/members`, undefined, t1)).json;
    check('В портфеле 2 участника', Array.isArray(members) && members.length === 2, members?.length);

    // 14. Расход с распределением поровну (§22.1) между 2 участниками
    const split = await http(
      'POST',
      '/expenses',
      { portfolioId: fam.id, amount: 10000, scope: 'SHARED', splitType: 'EQUAL', merchant: 'Лента' },
      t1,
    );
    const shares = split.json?.shares ?? [];
    const halves = shares.length === 2 && shares.every((s: any) => Number(s.amount) === 5000);
    check('Расход 10000 разделён поровну (5000/5000)', halves, shares);

    // 15. Анна видит только доступные ей портфели (§27, §30.8)
    const annaPortfolios = (await http('GET', '/portfolios', undefined, t2)).json;
    const annaSeesFamily = annaPortfolios.some((p: any) => p.id === fam.id);
    const annaSeesPersonal = annaPortfolios.some((p: any) => p.id === personalId);
    check('Анна видит совместный портфель', annaSeesFamily, annaPortfolios?.map((p: any) => p.name));
    check('Анна НЕ видит личный портфель Евгения', !annaSeesPersonal, annaPortfolios?.map((p: any) => p.name));

    // 16. Анна не может удалить портфель (нет прав manage) (§4.3)
    const annaDelete = await http('DELETE', `/portfolios/${fam.id}`, undefined, t2);
    check('Участнику запрещено удалять портфель (403)', annaDelete.status === 403, annaDelete.status);

    // 17. Аналитика (§23)
    const summary = (await http('GET', `/analytics/summary?portfolioId=${fam.id}`, undefined, t1)).json;
    // 8000 + 2500 + 10000 = 20500
    check('Аналитика: суммарный расход 20500', summary?.totalExpense === 20500, summary?.totalExpense);
    check('Аналитика: доход 225000', summary?.totalIncome === 225000, summary?.totalIncome);
    check('Аналитика: разбивка по категориям не пуста', (summary?.byCategory?.length ?? 0) > 0, summary?.byCategory);

    // 18. Прогноз остатка (§17.1)
    const forecast = (await http('GET', `/analytics/forecast?portfolioId=${fam.id}`, undefined, t1)).json;
    check('Прогноз остатка рассчитан', typeof forecast?.endOfMonthBalance === 'number', forecast);

    // 19. Telegram link-code (§10.2)
    const link = await http('POST', '/telegram/link-code', {}, t1);
    check('Сгенерирован код привязки Telegram', !!link.json?.code, link.json);

    // 20. Защита от дублей (§28): повтор того же расхода помечается как возможный дубль
    const dupRecog = await http(
      'POST',
      '/ai/recognize-expense',
      { portfolioId: fam.id, text: 'Потратил 2500 на продукты в Перекрёстке' },
      t1,
    );
    check('Повторный расход определён как возможный дубль', !!dupRecog.json?.duplicateOf, dupRecog.json?.duplicateOf);

    // 21. Регистрация push-токена устройства (§15)
    const device = await http(
      'POST',
      '/notifications/device-token',
      { token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', platform: 'ios' },
      t1,
    );
    check('Push-токен устройства зарегистрирован', device.json?.success === true, device.json);

    // 22. Асинхронное распознавание чека (§20.2) — инлайн-режим без Redis → 202 + logId
    const png1x1 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const asyncRecog = await http(
      'POST',
      '/ai/recognize-async',
      { portfolioId: fam.id, imageBase64: png1x1, mimeType: 'image/png' },
      t1,
    );
    check(
      'Async-распознавание принято (202) и обработано инлайн',
      asyncRecog.status === 202 && !!asyncRecog.json?.logId,
      asyncRecog,
    );
  } finally {
    console.log('\n▶ Остановка приложения и БД…');
    await app.close();
    await pg.stop();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  console.log(`\n=== Итог: ${passed} прошло, ${failed} провалено ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Фатальная ошибка проверки:', e);
  process.exit(1);
});
