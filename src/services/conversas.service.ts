import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';
import { criarNotificacao } from '../lib/notificacoes';
import { prisma } from '../lib/prisma';
import { parseConversa, parseDepois, parseMensagem } from '../validators/domain';

const conversaInclude = {
  reserva: { include: { roteiro: { select: { id: true, titulo: true, imageUrl: true, guiaId: true } } } },
  turista: { select: { id: true, nomeCompleto: true, fotoUrl: true } },
  guia: { select: { id: true, nomeCompleto: true, fotoUrl: true } },
  mensagens: { orderBy: { criadoEm: 'desc' as const }, take: 1 },
};

type ConversaCarregada = Prisma.ConversaGetPayload<{ include: typeof conversaInclude }>;

function toConversa(conversa: ConversaCarregada, userId: string) {
  const outro = userId === conversa.turistaId ? conversa.guia : conversa.turista;
  const ultima = conversa.mensagens[0];
  return {
    id: conversa.id,
    reservaId: conversa.reservaId,
    roteiro: {
      id: conversa.reserva.roteiro.id,
      titulo: conversa.reserva.roteiro.titulo,
      imageUrl: conversa.reserva.roteiro.imageUrl,
    },
    outroUsuario: {
      id: outro.id,
      nomeCompleto: outro.nomeCompleto,
      fotoUrl: outro.fotoUrl,
      online: false,
    },
    ultimaMensagem: ultima
      ? { texto: ultima.texto, criadoEm: ultima.criadoEm.toISOString(), minha: ultima.remetenteId === userId }
      : null,
    atualizadoEm: conversa.atualizadoEm.toISOString(),
  };
}

async function carregar(id: string) {
  return prisma.conversa.findUnique({ where: { id }, include: conversaInclude });
}

export async function abrirConversa(userId: string, body: unknown) {
  const { reservaId } = parseConversa(body);
  const reserva = await prisma.reserva.findUnique({
    where: { id: reservaId },
    include: { roteiro: { select: { guiaId: true } } },
  });
  if (!reserva) throw new AppError(404, 'Reserva não encontrada', 'NOT_FOUND');
  if (reserva.turistaId !== userId && reserva.roteiro.guiaId !== userId) {
    throw new AppError(403, 'Acesso negado', 'FORBIDDEN');
  }

  const existente = await prisma.conversa.findUnique({ where: { reservaId }, include: conversaInclude });
  if (existente) return { status: 200 as const, conversa: toConversa(existente, userId) };

  try {
    const criada = await prisma.conversa.create({
      data: { reservaId, turistaId: reserva.turistaId, guiaId: reserva.roteiro.guiaId },
      include: conversaInclude,
    });
    return { status: 201 as const, conversa: toConversa(criada, userId) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const conversa = await prisma.conversa.findUnique({ where: { reservaId }, include: conversaInclude });
      if (conversa) return { status: 200 as const, conversa: toConversa(conversa, userId) };
    }
    throw error;
  }
}

export async function listarConversas(userId: string) {
  const conversas = await prisma.conversa.findMany({
    where: { OR: [{ turistaId: userId }, { guiaId: userId }] },
    include: conversaInclude,
    orderBy: { atualizadoEm: 'desc' },
  });
  return { items: conversas.map((conversa) => toConversa(conversa, userId)) };
}

async function conversaDoUsuario(userId: string, id: string) {
  const conversa = await carregar(id);
  if (!conversa || (conversa.turistaId !== userId && conversa.guiaId !== userId)) {
    throw new AppError(404, 'Conversa não encontrada', 'NOT_FOUND');
  }
  return conversa;
}

export async function listarMensagens(userId: string, id: string, depois: unknown) {
  await conversaDoUsuario(userId, id);
  const desde = parseDepois(depois);
  const mensagens = await prisma.mensagem.findMany({
    where: { conversaId: id, ...(desde ? { criadoEm: { gt: desde } } : {}) },
    orderBy: { criadoEm: 'asc' },
  });
  return {
    items: mensagens.map((mensagem) => ({
      id: mensagem.id,
      texto: mensagem.texto,
      criadoEm: mensagem.criadoEm.toISOString(),
      remetenteId: mensagem.remetenteId,
      minha: mensagem.remetenteId === userId,
    })),
  };
}

export async function enviarMensagem(userId: string, id: string, body: unknown) {
  await conversaDoUsuario(userId, id);
  const { texto } = parseMensagem(body);
  const conversa = await prisma.conversa.findUnique({
    where: { id },
    select: { turistaId: true, guiaId: true },
  });
  const mensagem = await prisma.$transaction(async (tx) => {
    const criada = await tx.mensagem.create({ data: { conversaId: id, remetenteId: userId, texto } });
    await tx.conversa.update({ where: { id }, data: { atualizadoEm: new Date() } });
    return criada;
  });

  if (conversa) {
    const destinatarioId = conversa.turistaId === userId ? conversa.guiaId : conversa.turistaId;
    await criarNotificacao({
      userId: destinatarioId,
      tipo: 'MENSAGEM',
      titulo: 'Nova mensagem',
      texto,
      href: `/chat?id=${id}`,
    });
  }

  return {
    id: mensagem.id,
    texto: mensagem.texto,
    criadoEm: mensagem.criadoEm.toISOString(),
    remetenteId: mensagem.remetenteId,
    minha: true,
  };
}
