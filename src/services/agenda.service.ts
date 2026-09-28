import { agendaSalva } from '../lib/agenda';
import { diaDaSemanaDaData, hojeSaoPaulo } from '../lib/calendar';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { parseAgenda, parseDataConsulta } from '../validators/domain';

async function roteiroDoGuia(guiaId: string, id: string) {
  const roteiro = await prisma.roteiro.findFirst({ where: { id, guiaId } });
  if (!roteiro) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');
  return roteiro;
}

export async function obterAgenda(guiaId: string, id: string) {
  const roteiro = await roteiroDoGuia(guiaId, id);
  return agendaSalva(roteiro);
}

export async function salvarAgenda(guiaId: string, id: string, body: unknown) {
  await roteiroDoGuia(guiaId, id);
  const agenda = parseAgenda(body);
  await prisma.roteiro.update({
    where: { id },
    data: {
      diasSemana: agenda.diasSemana,
      horarios: agenda.horarios,
      datasBloqueadas: agenda.datasBloqueadas,
    },
  });
  return agenda;
}

export async function vagasOcupadas(roteiroId: string, data: string, horario: string) {
  const soma = await prisma.reserva.aggregate({
    where: { roteiroId, data, horario, status: { in: ['PENDENTE', 'CONFIRMADA'] } },
    _sum: { quantidade: true },
  });
  return soma._sum.quantidade ?? 0;
}

export async function disponibilidade(id: string, dataQuery: unknown) {
  const data = parseDataConsulta(dataQuery);
  const roteiro = await prisma.roteiro.findUnique({ where: { id } });
  if (!roteiro || !roteiro.ativo) throw new AppError(404, 'Roteiro não encontrado', 'NOT_FOUND');

  const agenda = agendaSalva(roteiro);
  const fechado =
    data < hojeSaoPaulo() ||
    agenda.datasBloqueadas.includes(data) ||
    !agenda.diasSemana.includes(diaDaSemanaDaData(data));

  if (fechado) return { data, horarios: [] };

  const horarios = [];
  for (const horario of agenda.horarios) {
    const ocupadas = await vagasOcupadas(id, data, horario);
    const vagas = roteiro.capacidade - ocupadas;
    if (vagas > 0) horarios.push({ horario, vagas });
  }

  return { data, horarios };
}
