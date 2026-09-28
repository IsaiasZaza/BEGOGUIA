import { prisma } from './prisma';

export type TipoNotificacao =
  | 'PAGAMENTO_PAGO'
  | 'RESERVA_CONFIRMADA'
  | 'RESERVA_RECUSADA'
  | 'RESERVA_CANCELADA'
  | 'MENSAGEM';

export async function criarNotificacao(input: {
  userId: string;
  tipo: TipoNotificacao;
  titulo: string;
  texto: string;
  href: string | null;
}) {
  await prisma.notificacao.create({ data: input });
}
