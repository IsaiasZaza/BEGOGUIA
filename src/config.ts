import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

function intEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function trimSlash(url: string) {
  return url.replace(/\/$/, '');
}

const defaultOrigins = [
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000',
];

export const config = {
  port: intEnv('PORT', 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me',
  jwtExpiresInSeconds: intEnv('JWT_EXPIRES_IN', 86400),
  bcryptRounds: intEnv('BCRYPT_ROUNDS', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? defaultOrigins.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  publicUrl: trimSlash(process.env.API_PUBLIC_URL ?? 'http://localhost:3001'),
  frontendUrl: trimSlash(process.env.FRONTEND_URL ?? 'http://localhost:8080'),
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads'),
  maxPhotoBytes: intEnv('MAX_PHOTO_BYTES', 5 * 1024 * 1024),
  emailConfirmTtlHours: intEnv('EMAIL_CONFIRM_TTL_HOURS', 24),
  passwordResetTtlHours: intEnv('PASSWORD_RESET_TTL_HOURS', 1),
  pixTtlMinutos: intEnv('PIX_TTL_MINUTOS', 30),
  taxaPlataforma: 0.1,
};

export function isEmailConfirmationRequired() {
  return process.env.REQUIRE_EMAIL_CONFIRMATION === 'true';
}

export function pixSimuladoPagoEmSegundos() {
  const raw = process.env.PIX_SIMULADO_PAGO_EM_SEGUNDOS;
  if (raw === undefined || raw.trim() === '') return config.nodeEnv === 'production' ? 300 : 5;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 5;
}

export function shouldSeedOnBoot() {
  if (process.env.SEED_ON_BOOT === 'true') return true;
  if (process.env.SEED_ON_BOOT === 'false') return false;
  return config.nodeEnv !== 'production';
}

export function assertSecureConfig() {
  const insecure = !process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-only-change-me';
  if (config.nodeEnv === 'production' && insecure) {
    throw new Error('Defina JWT_SECRET em produção');
  }
}

fs.mkdirSync(config.uploadDir, { recursive: true });
