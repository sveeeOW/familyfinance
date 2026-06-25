import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });
  const logger = new Logger('Bootstrap');

  // Импорт чеков/скринов приходит base64 внутри JSON. Лимит нужен выше дефолтного express.
  app.use(json({ limit: '8mb' }));
  app.use(urlencoded({ extended: true, limit: '8mb' }));

  // Раздаём локально сохранённые скриншоты чеков (STORAGE_DRIVER=local).
  const uploadsDir = process.env.STORAGE_LOCAL_DIR ?? './uploads';
  app.useStaticAssets(join(process.cwd(), uploadsDir), { prefix: '/uploads/' });

  const corsOrigins = (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim());
  app.enableCors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Family Finance API')
    .setDescription('REST API учёта семейных финансов (MVP)')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`Family Finance API запущен на http://localhost:${port} (docs: /docs)`);
}

bootstrap();
