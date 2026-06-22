import { Injectable, Logger } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';

/**
 * Абстракция хранилища файлов (§20.3). В dev — локальный диск, в prod — S3-совместимое
 * (AWS S3 / Yandex Object Storage / MinIO). Возвращает публичный URL сохранённого файла.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver = process.env.STORAGE_DRIVER ?? 'local';
  private readonly localDir = process.env.STORAGE_LOCAL_DIR ?? './uploads';
  private s3Client: S3Client | null = null;

  async save(buffer: Buffer, ext = 'jpg'): Promise<string> {
    const key = `receipts/${new Date().toISOString().slice(0, 10)}/${nanoid()}.${ext}`;
    if (this.driver === 's3') {
      return this.saveToS3(buffer, key, ext);
    }
    return this.saveLocal(buffer, key);
  }

  private async saveLocal(buffer: Buffer, key: string): Promise<string> {
    const full = path.join(this.localDir, key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer);
    const base = process.env.PUBLIC_URL ?? 'http://localhost:3000';
    return `${base}/uploads/${key}`;
  }

  private get s3(): S3Client {
    if (!this.s3Client) {
      this.s3Client = new S3Client({
        region: process.env.S3_REGION ?? 'ru-central1',
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: !!process.env.S3_ENDPOINT, // MinIO/Yandex используют path-style
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY ?? '',
          secretAccessKey: process.env.S3_SECRET_KEY ?? '',
        },
      });
    }
    return this.s3Client;
  }

  private async saveToS3(buffer: Buffer, key: string, ext: string): Promise<string> {
    const bucket = process.env.S3_BUCKET ?? 'familyfinance';
    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: this.contentType(ext),
      }),
    );
    const publicBase =
      process.env.S3_PUBLIC_URL ||
      (process.env.S3_ENDPOINT ? `${process.env.S3_ENDPOINT}/${bucket}` : `https://${bucket}.s3.amazonaws.com`);
    return `${publicBase}/${key}`;
  }

  private contentType(ext: string): string {
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }
}
