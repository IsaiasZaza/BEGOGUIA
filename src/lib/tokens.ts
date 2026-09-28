import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config';
import { prisma } from './prisma';

export type TokenTipo = 'EMAIL_CONFIRM' | 'PASSWORD_RESET';

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

export async function issueToken(userId: string, tipo: TokenTipo) {
  const raw = randomBytes(32).toString('hex');
  const hours = tipo === 'EMAIL_CONFIRM' ? config.emailConfirmTtlHours : config.passwordResetTtlHours;
  const expiraEm = new Date(Date.now() + hours * 60 * 60 * 1000);

  await prisma.authToken.deleteMany({ where: { userId, tipo } });
  await prisma.authToken.create({
    data: {
      userId,
      tipo,
      tokenHash: hashToken(raw),
      expiraEm,
    },
  });

  return raw;
}

export async function consumeToken(raw: string, tipo: TokenTipo) {
  const record = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!record || record.tipo !== tipo) return null;

  const updated = await prisma.authToken.updateMany({
    where: {
      id: record.id,
      tipo,
      usadoEm: null,
      expiraEm: { gt: new Date() },
    },
    data: { usadoEm: new Date() },
  });

  if (updated.count !== 1) return null;
  return record;
}
