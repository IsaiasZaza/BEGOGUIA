import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { AppError } from './errors';

type ImageKind = 'jpg' | 'png' | 'webp';

const mimeToKind: Record<string, ImageKind> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function detectImageType(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export function publicFileUrl(filename: string) {
  return `${config.publicUrl}/uploads/${filename}`;
}

export async function savePhoto(file: Express.Multer.File) {
  const expected = mimeToKind[file.mimetype];
  const detected = detectImageType(file.buffer);
  if (!expected || detected !== expected) {
    throw new AppError(415, 'Formato de imagem não suportado', 'UNSUPPORTED_MEDIA_TYPE');
  }

  const filename = `${randomUUID()}.${expected}`;
  await fs.writeFile(path.join(config.uploadDir, filename), file.buffer);
  return publicFileUrl(filename);
}

export async function removePhotoByUrl(fotoUrl: string | null) {
  if (!fotoUrl) return;

  try {
    const filename = new URL(fotoUrl).pathname.split('/').pop();
    if (!filename || !/^[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(filename)) return;
    await fs.unlink(path.join(config.uploadDir, filename));
  } catch {
    // arquivo já removido ou URL inválida
  }
}
