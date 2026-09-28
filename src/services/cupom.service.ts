import type { Cupom, Prisma, Reserva } from '@prisma/client';
import { hojeSaoPaulo } from '../lib/calendar';
import { AppError } from '../lib/errors';
import { roundMoney, toCents } from '../lib/money';
import { prisma } from '../lib/prisma';

export function baseDaReserva(reserva: Pick<Reserva, 'precoUnitario' | 'quantidade' | 'extras'>) {
  return roundMoney(reserva.precoUnitario * reserva.quantidade + reserva.extras);
}

export function calcularDesconto(tipo: string, valor: number, base: number) {
  if (tipo === 'PERCENTUAL') return roundMoney((base * valor) / 100);
  return roundMoney(Math.min(valor, base));
}

export async function buscarCupomValido(codigo: string) {
  const normalizado = codigo.trim().toUpperCase();
  if (!normalizado || /\s/.test(normalizado)) {
    throw new AppError(400, 'Cupom inválido', 'CUPOM_INVALIDO');
  }

  const cupom = await prisma.cupom.findUnique({ where: { codigo: normalizado } });
  if (!cupom || !cupom.ativo || (cupom.expiraEm && cupom.expiraEm < hojeSaoPaulo())) {
    throw new AppError(400, 'Cupom inválido', 'CUPOM_INVALIDO');
  }
  return cupom;
}

export async function gravarCupomNaReserva(
  reserva: Pick<Reserva, 'id' | 'precoUnitario' | 'quantidade' | 'extras'>,
  cupom: Pick<Cupom, 'codigo' | 'tipo' | 'valor'>,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const base = baseDaReserva(reserva);
  const desconto = calcularDesconto(cupom.tipo, cupom.valor, base);
  const total = roundMoney(base - desconto);
  return db.reserva.update({
    where: { id: reserva.id },
    data: { cupomCodigo: cupom.codigo, desconto, total },
  });
}

export async function devolverCashback(reservaId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const reserva = await db.reserva.findUnique({ where: { id: reservaId } });
  if (!reserva || reserva.cashbackAplicado <= 0 || reserva.cashbackDevolvido) return;

  await db.user.update({
    where: { id: reserva.turistaId },
    data: { cashback: { increment: reserva.cashbackAplicado } },
  });
  await db.reserva.update({ where: { id: reservaId }, data: { cashbackDevolvido: true } });
}

export async function creditarCashbackConclusao(reservaId: string) {
  await prisma.$transaction(async (tx) => {
    const reserva = await tx.reserva.findUnique({ where: { id: reservaId } });
    if (!reserva || reserva.cashbackCreditado || reserva.status !== 'CONCLUIDA') return;

    const bonus = Math.round(toCents(reserva.total) * 0.05) / 100;
    if (bonus > 0) {
      await tx.user.update({
        where: { id: reserva.turistaId },
        data: { cashback: { increment: bonus } },
      });
    }
    await tx.reserva.update({ where: { id: reservaId }, data: { cashbackCreditado: true } });
  });
}
