import { Prisma } from '@prisma/client';
import { hojeSaoPaulo } from '../lib/calendar';
import { AppError } from '../lib/errors';
import { criarNotificacao } from '../lib/notificacoes';
import { hashPassword, verifyPassword } from '../lib/password';
import { prisma } from '../lib/prisma';
import { parsePerfil, parseTrocaSenha } from '../validators/domain';
import { devolverCashback } from './cupom.service';

function toPerfil(user: {
  id: string;
  nomeCompleto: string;
  email: string;
  fotoUrl: string | null;
  tipo: string;
  telefone: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
}) {
  return {
    id: user.id,
    nomeCompleto: user.nomeCompleto,
    email: user.email,
    fotoUrl: user.fotoUrl,
    tipo: user.tipo,
    telefone: user.telefone,
    endereco: user.endereco,
    cidade: user.cidade,
    estado: user.estado,
    cep: user.cep,
  };
}

export async function obterPerfil(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'Token ausente, inválido ou expirado', 'UNAUTHORIZED');
  return toPerfil(user);
}

export async function atualizarPerfil(userId: string, body: unknown) {
  const data = parsePerfil(body);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'Token ausente, inválido ou expirado', 'UNAUTHORIZED');

  const emailMudou = data.email !== undefined && data.email !== user.email;
  if (emailMudou && data.email) {
    const outro = await prisma.user.findUnique({ where: { email: data.email } });
    if (outro && outro.id !== user.id) {
      throw new AppError(409, 'E-mail já cadastrado', 'EMAIL_ALREADY_EXISTS', { email: 'E-mail já cadastrado' });
    }
  }

  try {
    const atualizado = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.nomeCompleto !== undefined ? { nomeCompleto: data.nomeCompleto } : {}),
        ...(data.telefone !== undefined ? { telefone: data.telefone } : {}),
        ...(data.endereco !== undefined ? { endereco: data.endereco } : {}),
        ...(data.cidade !== undefined ? { cidade: data.cidade } : {}),
        ...(data.estado !== undefined ? { estado: data.estado } : {}),
        ...(data.cep !== undefined ? { cep: data.cep } : {}),
        ...(emailMudou ? { email: data.email, emailConfirmado: false } : {}),
      },
    });
    return toPerfil(atualizado);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'E-mail já cadastrado', 'EMAIL_ALREADY_EXISTS', { email: 'E-mail já cadastrado' });
    }
    throw error;
  }
}

export async function trocarSenha(userId: string, body: unknown) {
  const data = parseTrocaSenha(body);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'Token ausente, inválido ou expirado', 'UNAUTHORIZED');

  const atualConfere = await verifyPassword(data.senhaAtual, user.senhaHash);
  if (!atualConfere) {
    throw new AppError(400, 'Senha atual incorreta', 'SENHA_ATUAL_INVALIDA');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { senhaHash: await hashPassword(data.novaSenha) },
  });
}

export async function encerrarConta(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'Token ausente, inválido ou expirado', 'UNAUTHORIZED');

  const agora = new Date();
  const hoje = hojeSaoPaulo(agora);

  const canceladas = await prisma.$transaction(async (tx) => {
    const futuras = await tx.reserva.findMany({
      where: {
        turistaId: userId,
        data: { gte: hoje },
        status: { in: ['AGUARDANDO_PAGAMENTO', 'PENDENTE', 'CONFIRMADA'] },
      },
      include: { roteiro: { select: { titulo: true, guiaId: true } } },
    });
    const ids = futuras.map((item) => item.id);
    if (ids.length > 0) {
      await tx.reserva.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELADA' } });
      await tx.pagamento.updateMany({
        where: { reservaId: { in: ids }, status: 'PENDENTE' },
        data: { status: 'EXPIRADO' },
      });
      for (const reserva of futuras) await devolverCashback(reserva.id, tx);
    }

    if (user.tipo === 'GUIA') {
      await tx.roteiro.updateMany({ where: { guiaId: userId }, data: { ativo: false } });
    }

    await tx.user.update({
      where: { id: userId },
      data: { encerradaEm: agora, tokensInvalidosAntes: agora },
    });

    return futuras.map((reserva) => ({
      guiaId: reserva.roteiro.guiaId,
      titulo: reserva.roteiro.titulo,
    }));
  });

  for (const reserva of canceladas) {
    await criarNotificacao({
      userId: reserva.guiaId,
      tipo: 'RESERVA_CANCELADA',
      titulo: 'Reserva cancelada',
      texto: `${reserva.titulo} foi cancelado.`,
      href: '/gestao-agendamentos',
    });
  }
}
