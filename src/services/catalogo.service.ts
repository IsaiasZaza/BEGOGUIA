import { Prisma } from '@prisma/client';
import {
  distribuicao,
  mediaNotas,
  roteiroComRelacoes,
  toRoteiroDetalhe,
  toRoteiroGuiaLista,
  toRoteiroLista,
  type RoteiroComGuia,
} from '../domain/roteiro-view';
import { AppError } from '../lib/errors';
import { roundMoney } from '../lib/money';
import { removePhotoByUrl, savePhoto } from '../lib/image';
import { prisma } from '../lib/prisma';
import { parseAtualizarRoteiro, parseAtivo, parseCatalogoQuery, parseCriarRoteiro, parseFavorito, parseMotivoDenuncia } from '../validators/domain';

async function notasDosGuias(guiaIds: string[]) {
  const notas = new Map<string, number[]>();
  if (guiaIds.length === 0) return notas;

  const avaliacoes = await prisma.avaliacao.findMany({
    where: { roteiro: { guiaId: { in: guiaIds } } },
    select: { nota: true, roteiro: { select: { guiaId: true } } },
  });

  for (const avaliacao of avaliacoes) {
    const lista = notas.get(avaliacao.roteiro.guiaId) ?? [];
    lista.push(avaliacao.nota);
    notas.set(avaliacao.roteiro.guiaId, lista);
  }

  return notas;
}

function notaDoGuia(notas: Map<string, number[]>, guiaId: string) {
  return mediaNotas(notas.get(guiaId) ?? []);
}

async function apresentar(roteiros: RoteiroComGuia[], detalhe: boolean) {
  const notas = await notasDosGuias([...new Set(roteiros.map((roteiro) => roteiro.guiaId))]);
  return roteiros.map((roteiro) =>
    detalhe ? toRoteiroDetalhe(roteiro, notaDoGuia(notas, roteiro.guiaId)) : toRoteiroLista(roteiro, notaDoGuia(notas, roteiro.guiaId)),
  );
}

export async function listarRoteiros(query: Record<string, unknown>) {
  const filtro = parseCatalogoQuery(query);
  const roteiros = await prisma.roteiro.findMany({
    where: {
      ativo: true,
      ...(filtro.categoria ? { categoria: filtro.categoria } : {}),
      ...(filtro.destaque ? { destaque: true } : {}),
    },
    include: roteiroComRelacoes,
  });

  const needle = filtro.q.toLocaleLowerCase('pt-BR');
  const filtrados = needle
    ? roteiros.filter((roteiro) => {
        const titulo = roteiro.titulo.toLocaleLowerCase('pt-BR');
        const local = roteiro.local.toLocaleLowerCase('pt-BR');
        return titulo.includes(needle) || local.includes(needle);
      })
    : roteiros;

  filtrados.sort((a, b) => {
    if (a.destaque !== b.destaque) return a.destaque ? -1 : 1;
    return mediaNotas(b.avaliacoes.map((item) => item.nota)) - mediaNotas(a.avaliacoes.map((item) => item.nota));
  });

  return { items: await apresentar(filtrados, false) };
}

export async function obterRoteiroPublico(id: string) {
  const roteiro = await prisma.roteiro.findUnique({ where: { id }, include: roteiroComRelacoes });
  if (!roteiro || !roteiro.ativo) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');
  const [item] = await apresentar([roteiro], true);
  return item;
}

export async function listarAvaliacoes(id: string) {
  const roteiro = await prisma.roteiro.findUnique({ where: { id }, select: { id: true, ativo: true } });
  if (!roteiro || !roteiro.ativo) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');

  const comentarios = await prisma.avaliacao.findMany({
    where: { roteiroId: id },
    orderBy: { criadoEm: 'desc' },
  });
  const notas = comentarios.map((item) => item.nota);

  return {
    notaMedia: mediaNotas(notas),
    total: notas.length,
    distribuicao: distribuicao(notas),
    comentarios: comentarios.map((item) => ({
      id: item.id,
      autor: item.autor,
      texto: item.texto,
      nota: item.nota,
      criadoEm: item.criadoEm.toISOString(),
    })),
  };
}

export async function listarFavoritos(turistaId: string) {
  const favoritos = await prisma.favorito.findMany({
    where: { turistaId, roteiro: { ativo: true } },
    include: { roteiro: { select: { id: true, titulo: true, descricao: true, imageUrl: true } } },
    orderBy: { criadoEm: 'desc' },
  });

  return {
    items: favoritos.map((favorito) => ({
      roteiroId: favorito.roteiro.id,
      titulo: favorito.roteiro.titulo,
      descricao: favorito.roteiro.descricao,
      imageUrl: favorito.roteiro.imageUrl,
    })),
  };
}

export async function favoritar(turistaId: string, body: unknown) {
  const { roteiroId } = parseFavorito(body);
  const roteiro = await prisma.roteiro.findUnique({ where: { id: roteiroId } });
  if (!roteiro || !roteiro.ativo) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');

  const jaExiste = await prisma.favorito.findUnique({
    where: { turistaId_roteiroId: { turistaId, roteiroId } },
  });
  if (jaExiste) throw new AppError(409, 'Roteiro já está nos favoritos', 'FAVORITO_EXISTE');

  try {
    await prisma.favorito.create({ data: { turistaId, roteiroId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'Roteiro já está nos favoritos', 'FAVORITO_EXISTE');
    }
    throw error;
  }

  return {
    roteiroId: roteiro.id,
    titulo: roteiro.titulo,
    descricao: roteiro.descricao,
    imageUrl: roteiro.imageUrl,
  };
}

export async function desfavoritar(turistaId: string, roteiroId: string) {
  await prisma.favorito.deleteMany({ where: { turistaId, roteiroId } });
}

export async function listarRoteirosDoGuia(guiaId: string, q: unknown) {
  const busca = typeof q === 'string' ? q.trim().toLocaleLowerCase('pt-BR') : '';
  const roteiros = await prisma.roteiro.findMany({
    where: { guiaId },
    orderBy: { titulo: 'asc' },
  });
  const items = roteiros
    .filter((roteiro) => !busca || roteiro.titulo.toLocaleLowerCase('pt-BR').includes(busca))
    .map(toRoteiroGuiaLista);
  return { items };
}

export async function obterRoteiroDoGuia(guiaId: string, id: string) {
  const roteiro = await prisma.roteiro.findFirst({ where: { id, guiaId }, include: roteiroComRelacoes });
  if (!roteiro) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');
  const [item] = await apresentar([roteiro], true);
  return item;
}

export async function criarRoteiro(guiaId: string, body: unknown, file?: Express.Multer.File) {
  const guia = await prisma.user.findUnique({ where: { id: guiaId }, select: { statusAprovacao: true } });
  if (guia?.statusAprovacao !== 'APROVADO') {
    throw new AppError(403, 'Guia ainda não foi aprovado', 'GUIA_NAO_APROVADO');
  }

  const data = parseCriarRoteiro(body);
  let imageUrl: string | null = null;
  try {
    if (file) imageUrl = await savePhoto(file);
    const roteiro = await prisma.roteiro.create({
      data: {
        guiaId,
        titulo: data.titulo,
        descricao: data.descricao,
        categoria: data.categoria,
        local: data.local,
        distancia: data.distancia,
        duracao: data.duracao,
        preco: roundMoney(data.preco),
        capacidade: data.capacidade,
        imageUrl,
        ativo: true,
        incluso: data.incluso,
        politicaCancelamento: data.politicaCancelamento,
        paradas: data.paradas,
      },
      include: roteiroComRelacoes,
    });
    const [item] = await apresentar([roteiro], true);
    return item;
  } catch (error) {
    await removePhotoByUrl(imageUrl);
    throw error;
  }
}

export async function atualizarRoteiro(guiaId: string, id: string, body: unknown, file?: Express.Multer.File) {
  const atual = await prisma.roteiro.findFirst({ where: { id, guiaId } });
  if (!atual) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');

  const data = parseAtualizarRoteiro(body);
  let imageUrl: string | null = null;
  try {
    if (file) imageUrl = await savePhoto(file);
    const roteiro = await prisma.roteiro.update({
      where: { id },
      data: {
        ...(data.titulo !== undefined ? { titulo: data.titulo } : {}),
        ...(data.descricao !== undefined ? { descricao: data.descricao } : {}),
        ...(data.duracao !== undefined ? { duracao: data.duracao } : {}),
        ...(data.capacidade !== undefined ? { capacidade: data.capacidade } : {}),
        ...(data.preco !== undefined ? { preco: roundMoney(data.preco) } : {}),
        ...(data.categoria !== undefined ? { categoria: data.categoria } : {}),
        ...(data.local !== undefined ? { local: data.local } : {}),
        ...(data.distancia !== undefined ? { distancia: data.distancia } : {}),
        ...(data.incluso !== undefined ? { incluso: data.incluso } : {}),
        ...(data.politicaCancelamento !== undefined ? { politicaCancelamento: data.politicaCancelamento } : {}),
        ...(data.paradas !== undefined ? { paradas: data.paradas } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      },
      include: roteiroComRelacoes,
    });
    if (imageUrl && atual.imageUrl && atual.imageUrl !== imageUrl) await removePhotoByUrl(atual.imageUrl);
    const [item] = await apresentar([roteiro], true);
    return item;
  } catch (error) {
    await removePhotoByUrl(imageUrl);
    throw error;
  }
}

export async function denunciarRoteiro(autorId: string, roteiroId: string, body: unknown) {
  const roteiro = await prisma.roteiro.findUnique({ where: { id: roteiroId }, select: { id: true } });
  if (!roteiro) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');
  const motivo = parseMotivoDenuncia(body);
  const denuncia = await prisma.denuncia.create({ data: { roteiroId, autorId, motivo } });
  return { id: denuncia.id };
}

export async function alterarAtivo(guiaId: string, id: string, body: unknown) {
  const atual = await prisma.roteiro.findFirst({ where: { id, guiaId }, select: { id: true } });
  if (!atual) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');
  const { ativo } = parseAtivo(body);
  await prisma.roteiro.update({ where: { id }, data: { ativo } });
  return { id, ativo };
}
