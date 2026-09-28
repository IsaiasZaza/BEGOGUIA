import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { config, pixSimuladoPagoEmSegundos } from '../config';
import { agendaSalva } from '../lib/agenda';
import { diaDaSemanaDaData, hojeSaoPaulo, instanteSaoPaulo, semanaAtualSaoPaulo } from '../lib/calendar';
import { AppError } from '../lib/errors';
import { asStringList } from '../lib/lists';
import { roundMoney, toCents } from '../lib/money';
import { criarNotificacao } from '../lib/notificacoes';
import { prisma } from '../lib/prisma';
import {
  buscarCupomValido,
  creditarCashbackConclusao,
  devolverCashback,
  gravarCupomNaReserva,
} from './cupom.service';
import {
  parseCriarReserva,
  parseCupomCodigo,
  parsePagamento,
  parseQuando,
  parseStatusReserva,
} from '../validators/domain';

const reservaInclude = {
  roteiro: {
    include: { guia: { select: { id: true, nomeCompleto: true } } },
  },
} as const;

const guiaReservaInclude = {
  turista: { select: { id: true, nomeCompleto: true, fotoUrl: true } },
  roteiro: true,
} as const;

type ReservaCarregada = NonNullable<Awaited<ReturnType<typeof buscarReserva>>>;

async function buscarReserva(id: string) {
  return prisma.reserva.findUnique({ where: { id }, include: reservaInclude });
}

function toReserva(reserva: ReservaCarregada, completo: boolean) {
  return {
    id: reserva.id,
    status: reserva.status,
    data: reserva.data,
    horario: reserva.horario,
    quantidade: reserva.quantidade,
    precoUnitario: roundMoney(reserva.precoUnitario),
    extras: roundMoney(reserva.extras),
    total: roundMoney(reserva.total),
    roteiro: {
      id: reserva.roteiro.id,
      titulo: reserva.roteiro.titulo,
      descricao: reserva.roteiro.descricao,
      imageUrl: reserva.roteiro.imageUrl,
      local: reserva.roteiro.local,
      ...(completo
        ? {
            incluso: asStringList(reserva.roteiro.incluso),
            politicaCancelamento: asStringList(reserva.roteiro.politicaCancelamento),
          }
        : {}),
    },
    guia: {
      id: reserva.roteiro.guia.id,
      nomeCompleto: reserva.roteiro.guia.nomeCompleto,
    },
  };
}

export async function sincronizarPagamento(reservaId: string) {
  const pagamento = await prisma.pagamento.findUnique({ where: { reservaId } });
  if (!pagamento || pagamento.status !== 'PENDENTE') return pagamento;

  const agora = Date.now();
  const liberarEm = pagamento.criadoEm.getTime() + pixSimuladoPagoEmSegundos() * 1000;
  const expirou = agora >= pagamento.expiraEm.getTime();

  if (!expirou && agora < liberarEm) return pagamento;

  await prisma.$transaction(async (tx) => {
    if (expirou) {
      const updated = await tx.pagamento.updateMany({
        where: { id: pagamento.id, status: 'PENDENTE' },
        data: { status: 'EXPIRADO' },
      });
    if (updated.count === 1) {
      await tx.reserva.updateMany({
        where: { id: reservaId, status: 'AGUARDANDO_PAGAMENTO' },
        data: { status: 'CANCELADA' },
      });
      await devolverCashback(reservaId, tx);
    }
    return;
  }

    const updated = await tx.pagamento.updateMany({
      where: { id: pagamento.id, status: 'PENDENTE' },
      data: { status: 'PAGO', pagoEm: new Date() },
    });
    if (updated.count === 1) {
      await tx.reserva.updateMany({
        where: { id: reservaId, status: 'AGUARDANDO_PAGAMENTO' },
        data: { status: 'PENDENTE' },
      });
    }
  });

  const atualizado = await prisma.pagamento.findUnique({ where: { id: pagamento.id } });
  if (atualizado?.status === 'PAGO' && pagamento.status === 'PENDENTE') {
    const reserva = await prisma.reserva.findUnique({
      where: { id: reservaId },
      include: { roteiro: { select: { titulo: true, guiaId: true } }, turista: { select: { id: true } } },
    });
    if (reserva) {
      await criarNotificacao({
        userId: reserva.turistaId,
        tipo: 'PAGAMENTO_PAGO',
        titulo: 'Pagamento confirmado',
        texto: `${reserva.roteiro.titulo} foi pago.`,
        href: '/carteira',
      });
      await criarNotificacao({
        userId: reserva.roteiro.guiaId,
        tipo: 'PAGAMENTO_PAGO',
        titulo: 'Nova reserva',
        texto: `${reserva.roteiro.titulo} aguarda sua confirmação.`,
        href: '/gestao-agendamentos',
      });
    }
  }
  if (atualizado?.status === 'EXPIRADO' && pagamento.status === 'PENDENTE') {
    const reserva = await prisma.reserva.findUnique({
      where: { id: reservaId },
      include: { roteiro: { select: { titulo: true, guiaId: true } } },
    });
    if (reserva) {
      await criarNotificacao({
        userId: reserva.turistaId,
        tipo: 'RESERVA_CANCELADA',
        titulo: 'Reserva cancelada',
        texto: `${reserva.roteiro.titulo} foi cancelado.`,
        href: '/carteira',
      });
      await criarNotificacao({
        userId: reserva.roteiro.guiaId,
        tipo: 'RESERVA_CANCELADA',
        titulo: 'Reserva cancelada',
        texto: `${reserva.roteiro.titulo} foi cancelado.`,
        href: '/gestao-agendamentos',
      });
    }
  }
  return atualizado;
}

export async function sincronizarConclusao(reserva: { id: string; status: string; data: string; horario: string }) {
  if (reserva.status !== 'CONFIRMADA') return reserva.status;
  const inicio = Date.parse(instanteSaoPaulo(reserva.data, reserva.horario));
  if (Number.isNaN(inicio) || Date.now() < inicio) return reserva.status;

  const atualizada = await prisma.reserva.updateMany({
    where: { id: reserva.id, status: 'CONFIRMADA' },
    data: { status: 'CONCLUIDA' },
  });
  if (atualizada.count === 1) await creditarCashbackConclusao(reserva.id);
  return 'CONCLUIDA';
}

async function sincronizarLista(reservas: { id: string; status: string; data: string; horario: string }[]) {
  for (const reserva of reservas) {
    if (reserva.status === 'AGUARDANDO_PAGAMENTO') await sincronizarPagamento(reserva.id);
    else await sincronizarConclusao(reserva);
  }
}

export async function sincronizarDoTurista(turistaId: string) {
  const reservas = await prisma.reserva.findMany({
    where: { turistaId, status: { in: ['AGUARDANDO_PAGAMENTO', 'CONFIRMADA'] } },
    select: { id: true, status: true, data: true, horario: true },
  });
  await sincronizarLista(reservas);
}

export async function sincronizarDoGuia(guiaId: string) {
  const reservas = await prisma.reserva.findMany({
    where: { roteiro: { guiaId }, status: { in: ['AGUARDANDO_PAGAMENTO', 'CONFIRMADA'] } },
    select: { id: true, status: true, data: true, horario: true },
  });
  await sincronizarLista(reservas);
}

async function carregarReserva(id: string) {
  await sincronizarPagamento(id);
  const reserva = await buscarReserva(id);
  if (!reserva) return null;
  const status = await sincronizarConclusao(reserva);
  if (status === reserva.status) return reserva;
  return buscarReserva(id);
}

export async function criarReserva(turistaId: string, body: unknown) {
  const data = parseCriarReserva(body);
  const roteiro = await prisma.roteiro.findUnique({
    where: { id: data.roteiroId },
    include: { guia: { select: { id: true, nomeCompleto: true } } },
  });
  if (!roteiro) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');
  if (!roteiro.ativo) throw new AppError(409, 'Roteiro indisponível', 'ROTEIRO_INATIVO');
  if (data.quantidade > roteiro.capacidade) {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', {
      quantidade: `Quantidade máxima é ${roteiro.capacidade}`,
    });
  }

  const agenda = agendaSalva(roteiro);
  const dataFechada =
    data.data < hojeSaoPaulo() ||
    agenda.datasBloqueadas.includes(data.data) ||
    !agenda.diasSemana.includes(diaDaSemanaDaData(data.data));
  if (dataFechada) throw new AppError(409, 'Data indisponível', 'DATA_INDISPONIVEL');
  if (!agenda.horarios.includes(data.horario)) throw new AppError(409, 'Horário esgotado', 'HORARIO_ESGOTADO');

  const precoUnitario = roundMoney(roteiro.preco);
  const reserva = await prisma.$transaction(async (tx) => {
    const ocupadas = await tx.reserva.aggregate({
      where: {
        roteiroId: roteiro.id,
        data: data.data,
        horario: data.horario,
        status: { in: ['PENDENTE', 'CONFIRMADA'] },
      },
      _sum: { quantidade: true },
    });
    const vagas = roteiro.capacidade - (ocupadas._sum.quantidade ?? 0);
    if (data.quantidade > vagas) throw new AppError(409, 'Horário esgotado', 'HORARIO_ESGOTADO');

    return tx.reserva.create({
    data: {
      turistaId,
      roteiroId: roteiro.id,
      data: data.data,
      horario: data.horario,
      quantidade: data.quantidade,
      precoUnitario,
      extras: 0,
      total: roundMoney(precoUnitario * data.quantidade),
      status: 'AGUARDANDO_PAGAMENTO',
    },
    include: reservaInclude,
    });
  });

  return toReserva(reserva, false);
}

export async function obterReserva(userId: string, id: string) {
  const reserva = await carregarReserva(id);
  if (!reserva) throw new AppError(404, 'Reserva não encontrada', 'NOT_FOUND');
  if (reserva.turistaId !== userId && reserva.roteiro.guiaId !== userId) {
    throw new AppError(403, 'Acesso negado', 'FORBIDDEN');
  }
  return toReserva(reserva, true);
}

export async function listarReservasDoTurista(turistaId: string, status: unknown) {
  const filtro = parseStatusReserva(status);
  await sincronizarDoTurista(turistaId);
  const reservas = await prisma.reserva.findMany({
    where: { turistaId, ...(filtro ? { status: filtro } : {}) },
    include: { roteiro: { select: { titulo: true } } },
    orderBy: [{ data: 'asc' }, { horario: 'asc' }],
  });

  return {
    items: reservas.map((reserva) => ({
      id: reserva.id,
      roteiro: reserva.roteiro.titulo,
      data: reserva.data,
      horario: reserva.horario,
      quantidade: reserva.quantidade,
      status: reserva.status,
      total: roundMoney(reserva.total),
    })),
  };
}

function toPagamento(
  pagamento: { metodo: string; status: string; qrCode: string; copiaECola: string; expiraEm: Date },
  reserva: { desconto: number; cashbackAplicado: number; total: number },
) {
  return {
    metodo: pagamento.metodo,
    status: pagamento.status,
    qrCode: pagamento.qrCode,
    copiaECola: pagamento.copiaECola,
    expiraEm: pagamento.expiraEm.toISOString(),
    desconto: roundMoney(reserva.desconto),
    cashbackAplicado: roundMoney(reserva.cashbackAplicado),
    total: roundMoney(reserva.total),
  };
}

async function reservaDoTurista(turistaId: string, id: string) {
  const reserva = await prisma.reserva.findUnique({ where: { id } });
  if (!reserva) throw new AppError(404, 'Reserva não encontrada', 'NOT_FOUND');
  if (reserva.turistaId !== turistaId) throw new AppError(403, 'Acesso negado', 'FORBIDDEN');
  return reserva;
}

export async function aplicarCupom(turistaId: string, id: string, body: unknown) {
  const codigo = parseCupomCodigo(body);
  const reserva = await reservaDoTurista(turistaId, id);
  if (reserva.status !== 'AGUARDANDO_PAGAMENTO') {
    throw new AppError(409, 'Reserva não está aguardando pagamento', 'STATUS_INVALIDO');
  }
  const cupom = await buscarCupomValido(codigo);
  const atualizada = await gravarCupomNaReserva(reserva, cupom);
  return {
    codigo: cupom.codigo,
    tipo: cupom.tipo,
    valor: cupom.valor,
    desconto: roundMoney(atualizada.desconto),
    total: roundMoney(atualizada.total),
  };
}

export async function iniciarPagamento(turistaId: string, id: string, body: unknown) {
  const data = parsePagamento(body);
  const reservaInicial = await reservaDoTurista(turistaId, id);
  if (data.metodo === 'CARTAO') {
    throw new AppError(501, 'Cartão indisponível no momento', 'CARTAO_INDISPONIVEL');
  }

  const existente = await prisma.pagamento.findUnique({ where: { reservaId: id } });
  if (reservaInicial.status !== 'AGUARDANDO_PAGAMENTO' || existente) {
    throw new AppError(409, 'Reserva não está aguardando pagamento', 'STATUS_INVALIDO');
  }

  if (data.codigoCupom) await buscarCupomValido(data.codigoCupom);

  const copiaECola = `00020126${randomBytes(32).toString('hex')}5204000053039865802BR6304FAKE`;
  const qrCode = await QRCode.toDataURL(copiaECola, { margin: 1, width: 280 });

  const resultado = await prisma.$transaction(async (tx) => {
    let reserva = await tx.reserva.findUniqueOrThrow({ where: { id } });
    if (data.codigoCupom) {
      const cupom = await tx.cupom.findUnique({ where: { codigo: data.codigoCupom } });
      if (!cupom) throw new AppError(400, 'Cupom inválido', 'CUPOM_INVALIDO');
      reserva = await gravarCupomNaReserva(reserva, cupom, tx);
    }

    let cashbackAplicado = 0;
    if (data.usarCashback) {
      const turista = await tx.user.findUniqueOrThrow({ where: { id: turistaId } });
      const aplicadoCentavos = Math.min(toCents(turista.cashback), toCents(reserva.total));
      cashbackAplicado = aplicadoCentavos / 100;
      if (cashbackAplicado > 0) {
        reserva = await tx.reserva.update({
          where: { id },
          data: {
            cashbackAplicado,
            cashbackDevolvido: false,
            total: roundMoney(reserva.total - cashbackAplicado),
          },
        });
        await tx.user.update({
          where: { id: turistaId },
          data: { cashback: roundMoney(turista.cashback - cashbackAplicado) },
        });
      }
    }

    const pagamento = await tx.pagamento.create({
      data: {
        reservaId: id,
        metodo: 'PIX',
        status: 'PENDENTE',
        qrCode,
        copiaECola,
        expiraEm: new Date(Date.now() + config.pixTtlMinutos * 60 * 1000),
      },
    });
    return { pagamento, reserva };
  });

  return toPagamento(resultado.pagamento, resultado.reserva);
}

export async function obterPagamento(turistaId: string, id: string) {
  await reservaDoTurista(turistaId, id);
  const pagamento = await sincronizarPagamento(id);
  if (!pagamento) throw new AppError(404, 'Pagamento não encontrado', 'NOT_FOUND');
  const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id } });
  return toPagamento(pagamento, reserva);
}

async function reservaDoGuia(guiaId: string, id: string) {
  await sincronizarPagamento(id);
  const reserva = await prisma.reserva.findFirst({
    where: { id, roteiro: { guiaId } },
    include: guiaReservaInclude,
  });
  if (!reserva) throw new AppError(404, 'Reserva não encontrada', 'NOT_FOUND');
  const status = await sincronizarConclusao(reserva);
  if (status === reserva.status) return reserva;
  const atualizada = await prisma.reserva.findFirst({
    where: { id, roteiro: { guiaId } },
    include: guiaReservaInclude,
  });
  if (!atualizada) throw new AppError(404, 'Reserva não encontrada', 'NOT_FOUND');
  return atualizada;
}

function toGuiaReserva(
  reserva: {
    id: string;
    data: string;
    horario: string;
    quantidade: number;
    extras: number;
    total: number;
    status: string;
    turista: { id: string; nomeCompleto: string; fotoUrl: string | null };
    roteiro: {
      id: string;
      titulo: string;
      local: string;
      pontoEncontro: string;
      duracao: string;
      capacidade: number;
      idioma: string;
      descricao: string;
      incluso: unknown;
      politicaCancelamento: unknown;
    };
  },
  detalhe: boolean,
) {
  const base = {
    id: reserva.id,
    quando: instanteSaoPaulo(reserva.data, reserva.horario),
    data: reserva.data,
    horario: reserva.horario,
    roteiro: reserva.roteiro.titulo,
    roteiroId: reserva.roteiro.id,
    cliente: reserva.turista,
    quantidade: reserva.quantidade,
    extras: roundMoney(reserva.extras),
    total: roundMoney(reserva.total),
    status: reserva.status,
  };
  if (!detalhe) return base;
  return {
    ...base,
    local: reserva.roteiro.local,
    endereco: reserva.roteiro.pontoEncontro || reserva.roteiro.local,
    duracao: reserva.roteiro.duracao,
    capacidade: reserva.roteiro.capacidade,
    idioma: reserva.roteiro.idioma,
    descricao: reserva.roteiro.descricao,
    incluso: asStringList(reserva.roteiro.incluso),
    politicaCancelamento: asStringList(reserva.roteiro.politicaCancelamento),
  };
}

export async function listarReservasDoGuia(guiaId: string, quando: unknown) {
  const filtro = parseQuando(quando);
  await sincronizarDoGuia(guiaId);
  const hoje = hojeSaoPaulo();
  const reservas = await prisma.reserva.findMany({
    where: {
      roteiro: { guiaId },
      ...(filtro === 'proximas'
        ? { status: { in: ['PENDENTE', 'CONFIRMADA'] }, data: { gte: hoje } }
        : {
            OR: [{ status: { in: ['CONCLUIDA', 'CANCELADA', 'RECUSADA'] } }, { data: { lt: hoje } }],
          }),
    },
    include: guiaReservaInclude,
    orderBy: filtro === 'proximas' ? [{ data: 'asc' }, { horario: 'asc' }] : [{ data: 'desc' }, { horario: 'desc' }],
  });

  return { items: reservas.map((reserva) => toGuiaReserva(reserva, false)) };
}

export async function obterReservaDoGuia(guiaId: string, id: string) {
  const reserva = await reservaDoGuia(guiaId, id);
  return toGuiaReserva(reserva, true);
}

export async function aceitarReserva(guiaId: string, id: string) {
  const reserva = await reservaDoGuia(guiaId, id);
  if (reserva.status !== 'PENDENTE') {
    throw new AppError(409, 'Reserva não pode ser aceita neste status', 'STATUS_INVALIDO');
  }
  await prisma.reserva.update({ where: { id }, data: { status: 'CONFIRMADA' } });
  await criarNotificacao({
    userId: reserva.turistaId,
    tipo: 'RESERVA_CONFIRMADA',
    titulo: 'Reserva confirmada',
    texto: `${reserva.roteiro.titulo} foi confirmado.`,
    href: '/carteira',
  });
  return { id, status: 'CONFIRMADA' as const };
}

export async function recusarReserva(guiaId: string, id: string) {
  const reserva = await reservaDoGuia(guiaId, id);
  if (reserva.status !== 'PENDENTE') {
    throw new AppError(409, 'Reserva não pode ser recusada neste status', 'STATUS_INVALIDO');
  }
  await prisma.$transaction(async (tx) => {
    await tx.reserva.update({ where: { id }, data: { status: 'RECUSADA' } });
    await tx.pagamento.updateMany({ where: { reservaId: id }, data: { estornado: true } });
    await devolverCashback(id, tx);
  });
  await criarNotificacao({
    userId: reserva.turistaId,
    tipo: 'RESERVA_RECUSADA',
    titulo: 'Reserva recusada',
    texto: `${reserva.roteiro.titulo} foi recusado.`,
    href: '/carteira',
  });
  return { id, status: 'RECUSADA' as const };
}

export async function resumoSemana(guiaId: string) {
  await sincronizarDoGuia(guiaId);
  const { inicio, fim } = semanaAtualSaoPaulo();
  const reservas = await prisma.reserva.findMany({
    where: {
      roteiro: { guiaId },
      status: { in: ['PENDENTE', 'CONFIRMADA'] },
      data: { gte: inicio, lte: fim },
    },
    select: { total: true },
  });
  const faturamento = reservas.reduce((total, reserva) => total + toCents(reserva.total), 0);
  return { totalReservas: reservas.length, faturamentoPrevisto: faturamento / 100 };
}
