import { config } from '../config';
import { mesAtualSaoPaulo, proximaSegundaFeira } from '../lib/calendar';
import { AppError } from '../lib/errors';
import { roundMoney, toCents } from '../lib/money';
import { prisma } from '../lib/prisma';
import { sincronizarDoGuia, sincronizarDoTurista } from './reservas.service';
import { parseSaque } from '../validators/domain';

export async function carteiraTurista(turistaId: string) {
  await sincronizarDoTurista(turistaId);
  const [reservas, user] = await Promise.all([
    prisma.reserva.findMany({
      where: {
        turistaId,
        status: { not: 'AGUARDANDO_PAGAMENTO' },
        pagamento: { status: 'PAGO', estornado: false },
      },
      select: { total: true },
    }),
    prisma.user.findUnique({ where: { id: turistaId }, select: { cashback: true } }),
  ]);
  const centavos = reservas.reduce((total, reserva) => total + toCents(reserva.total), 0);

  return {
    pagamentosRealizados: centavos / 100,
    creditosPromocionais: 0,
    cashback: roundMoney(user?.cashback ?? 0),
    vouchers: 0,
  };
}

export async function carteiraGuia(guiaId: string) {
  await sincronizarDoGuia(guiaId);
  const [reservas, saques] = await Promise.all([
    prisma.reserva.findMany({
      where: { roteiro: { guiaId }, status: { in: ['CONFIRMADA', 'CONCLUIDA'] } },
      select: { status: true, total: true, data: true },
    }),
    prisma.saque.findMany({
      where: { guiaId, status: { in: ['PENDENTE', 'PROCESSANDO', 'CONCLUIDO'] } },
      select: { valor: true },
    }),
  ]);

  const mes = mesAtualSaoPaulo();
  let pendente = 0;
  let liquidoConcluido = 0;
  let ganhosMes = 0;
  let acumulado = 0;
  let taxasMes = 0;

  for (const reserva of reservas) {
    const total = toCents(reserva.total);
    const taxa = Math.round(total * config.taxaPlataforma);
    const liquido = total - taxa;
    if (reserva.status === 'CONFIRMADA') pendente += liquido;
    if (reserva.status === 'CONCLUIDA') {
      liquidoConcluido += liquido;
      acumulado += total;
      if (reserva.data.startsWith(mes)) {
        ganhosMes += total;
        taxasMes += taxa;
      }
    }
  }

  const sacado = saques.reduce((total, saque) => total + toCents(saque.valor), 0);
  const saldoDisponivel = Math.max(0, liquidoConcluido - sacado) / 100;

  return {
    saldoDisponivel,
    saldoPendente: pendente / 100,
    ganhosMes: ganhosMes / 100,
    acumulado: acumulado / 100,
    taxasPlataforma: taxasMes / 100,
    liquido: (ganhosMes - taxasMes) / 100,
    proximoPagamento: saldoDisponivel > 0 ? proximaSegundaFeira() : null,
  };
}

export async function solicitarSaque(guiaId: string, body: unknown) {
  const data = parseSaque(body);
  const carteira = await carteiraGuia(guiaId);
  const valor = roundMoney(data.valor);
  if (toCents(valor) > toCents(carteira.saldoDisponivel)) {
    throw new AppError(400, 'Saldo insuficiente', 'SALDO_INSUFICIENTE');
  }

  const saque = await prisma.saque.create({
    data: { guiaId, valor, metodo: data.metodo, status: 'PENDENTE' },
  });

  return {
    id: saque.id,
    valor: roundMoney(saque.valor),
    metodo: saque.metodo,
    status: saque.status,
    criadoEm: saque.criadoEm.toISOString(),
  };
}

export async function listarSaques(guiaId: string) {
  const saques = await prisma.saque.findMany({
    where: { guiaId },
    orderBy: { criadoEm: 'desc' },
  });
  return {
    items: saques.map((saque) => ({
      id: saque.id,
      criadoEm: saque.criadoEm.toISOString(),
      valor: roundMoney(saque.valor),
      metodo: saque.metodo,
      status: saque.status,
    })),
  };
}
