import type { Prisma, Roteiro, User } from '@prisma/client';
import { asParadas, asStringList } from '../lib/lists';
import { roundMoney } from '../lib/money';

export const AVALIACAO_LABELS = [
  { label: 'Excelente', nota: 5 },
  { label: 'Muito bom', nota: 4 },
  { label: 'Razoável', nota: 3 },
  { label: 'Ruim', nota: 2 },
  { label: 'Horrível', nota: 1 },
] as const;

type GuiaResumo = Pick<User, 'id' | 'nomeCompleto' | 'fotoUrl'>;

export type RoteiroComGuia = Roteiro & {
  guia: GuiaResumo;
  avaliacoes?: { nota: number }[];
};

export function mediaNotas(notas: number[]) {
  if (notas.length === 0) return 0;
  const media = notas.reduce((total, nota) => total + nota, 0) / notas.length;
  return Math.round(media * 10) / 10;
}

export function toGuiaResumo(guia: GuiaResumo, notaMedia: number) {
  return {
    id: guia.id,
    nomeCompleto: guia.nomeCompleto,
    fotoUrl: guia.fotoUrl,
    notaMedia,
  };
}

export function toRoteiroLista(roteiro: RoteiroComGuia, notaGuia: number) {
  const notas = (roteiro.avaliacoes ?? []).map((item) => item.nota);
  return {
    id: roteiro.id,
    titulo: roteiro.titulo,
    descricao: roteiro.descricao,
    categoria: roteiro.categoria,
    local: roteiro.local,
    distancia: roteiro.distancia,
    duracao: roteiro.duracao,
    preco: roundMoney(roteiro.preco),
    imageUrl: roteiro.imageUrl,
    notaMedia: mediaNotas(notas),
    guia: toGuiaResumo(roteiro.guia, notaGuia),
  };
}

export function toRoteiroDetalhe(roteiro: RoteiroComGuia, notaGuia: number) {
  const notas = (roteiro.avaliacoes ?? []).map((item) => item.nota);
  return {
    ...toRoteiroLista(roteiro, notaGuia),
    capacidade: roteiro.capacidade,
    ativo: roteiro.ativo,
    destaque: roteiro.destaque,
    idioma: roteiro.idioma,
    incluso: asStringList(roteiro.incluso),
    politicaCancelamento: asStringList(roteiro.politicaCancelamento),
    paradas: asParadas(roteiro.paradas),
    totalAvaliacoes: notas.length,
  };
}

export function toRoteiroGuiaLista(roteiro: Roteiro) {
  return {
    id: roteiro.id,
    titulo: roteiro.titulo,
    descricao: roteiro.descricao,
    duracao: roteiro.duracao,
    capacidade: roteiro.capacidade,
    preco: roundMoney(roteiro.preco),
    imageUrl: roteiro.imageUrl,
    ativo: roteiro.ativo,
    categoria: roteiro.categoria,
    local: roteiro.local,
  };
}

export const roteiroComRelacoes = {
  guia: { select: { id: true, nomeCompleto: true, fotoUrl: true } },
  avaliacoes: { select: { nota: true } },
} satisfies Prisma.RoteiroInclude;

export function distribuicao(notas: number[]) {
  return AVALIACAO_LABELS.map((item) => ({
    label: item.label,
    quantidade: notas.filter((nota) => nota === item.nota).length,
  }));
}
