import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { parseAtivo, parseCriarCupom, parseStatusAprovacao, parseStatusSaque } from '../validators/domain';

function cupomPublico(cupom: { id: string; codigo: string; tipo: string; valor: number; ativo: boolean; expiraEm: string | null }) {
  return {
    id: cupom.id,
    codigo: cupom.codigo,
    tipo: cupom.tipo,
    valor: cupom.valor,
    ativo: cupom.ativo,
    expiraEm: cupom.expiraEm,
  };
}

export async function criarCupom(body: unknown) {
  const data = parseCriarCupom(body);
  try {
    const cupom = await prisma.cupom.create({ data });
    return cupomPublico(cupom);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'Cupom já existe', 'CUPOM_EXISTE');
    }
    throw error;
  }
}

export async function listarCupons() {
  const cupons = await prisma.cupom.findMany({ orderBy: { criadoEm: 'desc' } });
  return { items: cupons.map(cupomPublico) };
}

export async function listarGuias(status: unknown) {
  const filtro = parseStatusAprovacao(status);
  const guias = await prisma.user.findMany({
    where: { tipo: 'GUIA', ...(filtro ? { statusAprovacao: filtro } : {}) },
    orderBy: { criadoEm: 'desc' },
  });
  return {
    items: guias.map((guia) => ({
      id: guia.id,
      nomeCompleto: guia.nomeCompleto,
      email: guia.email,
      fotoUrl: guia.fotoUrl,
      cidade: guia.cidade,
      criadoEm: guia.criadoEm.toISOString(),
      statusAprovacao: guia.statusAprovacao,
    })),
  };
}

async function guiaOu404(id: string) {
  const guia = await prisma.user.findFirst({ where: { id, tipo: 'GUIA' } });
  if (!guia) throw new AppError(404, 'Guia não encontrado', 'NOT_FOUND');
  return guia;
}

export async function aprovarGuia(id: string) {
  await guiaOu404(id);
  await prisma.user.update({ where: { id }, data: { statusAprovacao: 'APROVADO' } });
  return { id, statusAprovacao: 'APROVADO' as const };
}

export async function recusarGuia(id: string) {
  await guiaOu404(id);
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { statusAprovacao: 'RECUSADO' } }),
    prisma.roteiro.updateMany({ where: { guiaId: id }, data: { ativo: false } }),
  ]);
  return { id, statusAprovacao: 'RECUSADO' as const };
}

export async function listarRoteirosAdmin() {
  const roteiros = await prisma.roteiro.findMany({
    include: {
      guia: { select: { id: true, nomeCompleto: true } },
      _count: { select: { denuncias: true } },
    },
    orderBy: { criadoEm: 'desc' },
  });
  return {
    items: roteiros.map((roteiro) => ({
      id: roteiro.id,
      titulo: roteiro.titulo,
      ativo: roteiro.ativo,
      destaque: roteiro.destaque,
      denuncias: roteiro._count.denuncias,
      guia: roteiro.guia,
    })),
  };
}

export async function alterarDestaque(id: string, body: unknown) {
  const roteiro = await prisma.roteiro.findUnique({ where: { id }, select: { id: true } });
  if (!roteiro) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');
  const { ativo: destaque } = parseAtivo({ ativo: (body as { destaque?: unknown })?.destaque });
  await prisma.roteiro.update({ where: { id }, data: { destaque } });
  return { id, destaque };
}

export async function alterarAtivoAdmin(id: string, body: unknown) {
  const roteiro = await prisma.roteiro.findUnique({ where: { id }, select: { id: true } });
  if (!roteiro) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');
  const { ativo } = parseAtivo(body);
  await prisma.roteiro.update({ where: { id }, data: { ativo } });
  return { id, ativo };
}

export async function listarDenuncias() {
  const denuncias = await prisma.denuncia.findMany({
    include: {
      roteiro: { select: { titulo: true } },
      autor: { select: { nomeCompleto: true } },
    },
    orderBy: { criadoEm: 'desc' },
  });
  return {
    items: denuncias.map((denuncia) => ({
      id: denuncia.id,
      roteiroId: denuncia.roteiroId,
      roteiro: denuncia.roteiro.titulo,
      motivo: denuncia.motivo,
      autor: denuncia.autor.nomeCompleto,
      criadoEm: denuncia.criadoEm.toISOString(),
    })),
  };
}

function saquePublico(saque: {
  id: string;
  valor: number;
  metodo: string;
  status: string;
  criadoEm: Date;
  guia: { id: string; nomeCompleto: string };
}) {
  return {
    id: saque.id,
    valor: saque.valor,
    metodo: saque.metodo,
    status: saque.status,
    criadoEm: saque.criadoEm.toISOString(),
    guia: saque.guia,
  };
}

export async function listarSaquesAdmin() {
  const saques = await prisma.saque.findMany({
    include: { guia: { select: { id: true, nomeCompleto: true } } },
    orderBy: { criadoEm: 'desc' },
  });
  return { items: saques.map(saquePublico) };
}

const proximoStatus: Record<string, string> = {
  PENDENTE: 'PROCESSANDO',
  PROCESSANDO: 'CONCLUIDO',
};

export async function atualizarSaque(id: string, body: unknown) {
  const status = parseStatusSaque(body);
  const saque = await prisma.saque.findUnique({
    where: { id },
    include: { guia: { select: { id: true, nomeCompleto: true } } },
  });
  if (!saque) throw new AppError(404, 'Saque não encontrado', 'NOT_FOUND');
  if (proximoStatus[saque.status] !== status) {
    throw new AppError(409, 'Status do saque não permite essa mudança', 'STATUS_INVALIDO');
  }
  const atualizado = await prisma.saque.update({
    where: { id },
    data: { status },
    include: { guia: { select: { id: true, nomeCompleto: true } } },
  });
  return saquePublico(atualizado);
}
