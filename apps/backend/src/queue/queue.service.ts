import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConnectionOptions, Queue, Worker } from 'bullmq';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Парсит REDIS_URL в опции подключения BullMQ (без отдельного экземпляра ioredis). */
function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) || 0 : 0,
    maxRetriesPerRequest: null,
  };
}

export interface ReceiptJob {
  userId: string;
  portfolioId: string;
  imageBase64: string;
  mimeType: string;
}

const QUEUE_NAME = 'receipt-recognition';

/**
 * Очередь распознавания чеков (§20.2). Тяжёлый AI-вызов выносится из HTTP-запроса:
 * при заданном REDIS_URL задачи кладутся в BullMQ и обрабатываются воркером, после чего
 * пользователю приходит уведомление. Без REDIS_URL — обработка инлайн (для dev/MVP).
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private queue: Queue<ReceiptJob> | null = null;
  private worker: Worker<ReceiptJob> | null = null;

  constructor(
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
  ) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const connection = parseRedisUrl(redisUrl);
      this.queue = new Queue<ReceiptJob>(QUEUE_NAME, { connection });
      this.worker = new Worker<ReceiptJob>(QUEUE_NAME, async (job) => this.process(job.data), {
        connection,
      });
      this.worker.on('failed', (job, err) =>
        this.logger.error(`Задача ${job?.id} провалена: ${err.message}`),
      );
      this.logger.log('Очередь распознавания чеков подключена (BullMQ/Redis)');
    } else {
      this.logger.warn('REDIS_URL не задан — распознавание выполняется инлайн (без очереди)');
    }
  }

  /** Поставить чек в очередь. Без Redis обрабатывает сразу и возвращает logId. */
  async enqueueReceipt(job: ReceiptJob): Promise<{ queued: boolean; logId?: string }> {
    if (this.queue) {
      await this.queue.add('recognize', job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      });
      return { queued: true };
    }
    const logId = await this.process(job);
    return { queued: false, logId };
  }

  /** Логика обработки одной задачи: распознать чек и уведомить пользователя. */
  private async process(job: ReceiptJob): Promise<string> {
    const draft = await this.ai.recognizeImage({
      buffer: Buffer.from(job.imageBase64, 'base64'),
      mimeType: job.mimeType,
      userId: job.userId,
      portfolioId: job.portfolioId,
    });

    const p = draft.parsed;
    const text = p.amount
      ? `Распознан расход ${new Intl.NumberFormat('ru-RU').format(p.amount)} ${p.currency}, категория «${draft.resolvedCategoryName}». Подтвердите в приложении.`
      : 'Не удалось распознать сумму на чеке. Откройте раздел «Требует уточнения».';
    await this.notifications.notifyUser(job.userId, 'Чек обработан', text, {
      type: 'receipt',
      logId: draft.logId,
    });

    return draft.logId;
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
