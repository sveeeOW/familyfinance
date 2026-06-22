# Backend formatting fix for Family Finance

Этот архив восстанавливает нормальное форматирование backend-файлов, которые в GitHub схлопнулись в длинные строки и из-за `//`-комментариев ломают Prisma/TypeScript.

## Что заменяется

- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/seed.ts`
- `apps/backend/src/**/*.ts`
- `apps/backend/scripts/**/*.ts`
- `apps/backend/package.json`

В `apps/backend/package.json` дополнительно добавлены:

```json
"prebuild": "prisma generate",
"build:vercel": "prisma generate && nest build"
```

Это нужно, чтобы Prisma Client генерировался перед `nest build`, в том числе на Vercel.

## Как применить

Распаковать архив в корень репозитория `familyfinance` с заменой файлов.

После этого выполнить:

```bash
cd familyfinance
npm install
cd apps/backend
npx prisma format
npm run prisma:generate
npm run build
```

Если локально всё прошло успешно:

```bash
git add apps/backend
git commit -m "Fix backend formatting and Prisma generation"
git push
```

## Vercel backend settings

Root Directory:

```text
apps/backend
```

Install Command:

```text
npm install --prefix=../..
```

Build Command:

```text
npm run build
```

или напрямую:

```text
npm run build:vercel
```

Так как в `prebuild` уже стоит `prisma generate`, обычный `npm run build` тоже должен работать.
