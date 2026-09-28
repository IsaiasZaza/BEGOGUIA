import { asStringList } from './lists';

export type Agenda = {
  diasSemana: number[];
  horarios: string[];
  datasBloqueadas: string[];
};

export const agendaPadrao: Agenda = {
  diasSemana: [1, 2, 3, 4, 5],
  horarios: ['09:00'],
  datasBloqueadas: [],
};

function numeros(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === 'number');
}

export function agendaSalva(roteiro: {
  diasSemana: unknown;
  horarios: unknown;
  datasBloqueadas: unknown;
}): Agenda {
  if (roteiro.diasSemana == null && roteiro.horarios == null && roteiro.datasBloqueadas == null) {
    return agendaPadrao;
  }

  return {
    diasSemana: numeros(roteiro.diasSemana),
    horarios: asStringList(roteiro.horarios),
    datasBloqueadas: asStringList(roteiro.datasBloqueadas),
  };
}
