import type { User } from '@prisma/client';
import { mediaNotas, roteiroComRelacoes, toRoteiroLista } from '../domain/roteiro-view';
import { AppError } from '../lib/errors';
import { removePhotoByUrl, savePhoto } from '../lib/image';
import { asStringList } from '../lib/lists';
import { prisma } from '../lib/prisma';
import { parsePerfilGuia } from '../validators/domain';

async function perfilDe(user: User, incluirEmail: boolean, somenteAtivos: boolean) {
  const [roteiros, avaliacoes] = await Promise.all([
    prisma.roteiro.findMany({
      where: { guiaId: user.id, ...(somenteAtivos ? { ativo: true } : {}) },
      include: roteiroComRelacoes,
      orderBy: { titulo: 'asc' },
    }),
    prisma.avaliacao.findMany({
      where: { roteiro: { guiaId: user.id } },
      select: { nota: true },
    }),
  ]);
  const notas = avaliacoes.map((item) => item.nota);
  const nota = mediaNotas(notas);

  return {
    id: user.id,
    nomeCompleto: user.nomeCompleto,
    fotoUrl: user.fotoUrl,
    bio: user.bio,
    idiomas: asStringList(user.idiomas),
    cidade: user.cidade,
    estado: user.estado,
    notaMedia: nota,
    totalAvaliacoes: notas.length,
    aprovado: user.statusAprovacao === 'APROVADO',
    ...(incluirEmail ? { email: user.email } : {}),
    roteiros: roteiros.map((roteiro) =>
      somenteAtivos ? toRoteiroLista(roteiro, nota) : { ...toRoteiroLista(roteiro, nota), ativo: roteiro.ativo },
    ),
  };
}

export async function perfilPublico(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.tipo !== 'GUIA' || user.statusAprovacao !== 'APROVADO' || user.encerradaEm) {
    throw new AppError(404, 'Guia não encontrado', 'NOT_FOUND');
  }
  return perfilDe(user, false, true);
}

export async function perfilDoGuia(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.tipo !== 'GUIA') throw new AppError(403, 'Acesso restrito a guias', 'FORBIDDEN');
  return perfilDe(user, true, false);
}

export async function atualizarPerfilGuia(userId: string, body: unknown) {
  const data = parsePerfilGuia(body);
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      ...(data.idiomas !== undefined ? { idiomas: data.idiomas } : {}),
      ...(data.cidade !== undefined ? { cidade: data.cidade } : {}),
      ...(data.estado !== undefined ? { estado: data.estado } : {}),
    },
  });
  return perfilDoGuia(userId);
}

export async function atualizarFotoGuia(userId: string, file: Express.Multer.File) {
  const atual = await prisma.user.findUnique({ where: { id: userId } });
  if (!atual) throw new AppError(401, 'Token ausente, inválido ou expirado', 'UNAUTHORIZED');

  const fotoUrl = await savePhoto(file);
  try {
    await prisma.user.update({ where: { id: userId }, data: { fotoUrl } });
  } catch (error) {
    await removePhotoByUrl(fotoUrl);
    throw error;
  }
  if (atual.fotoUrl) await removePhotoByUrl(atual.fotoUrl);
  return perfilDoGuia(userId);
}
