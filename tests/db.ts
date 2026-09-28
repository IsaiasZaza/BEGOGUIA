import { prisma } from '../src/lib/prisma';

export async function clearAllData() {
  await prisma.notificacao.deleteMany();
  await prisma.denuncia.deleteMany();
  await prisma.cupom.deleteMany();
  await prisma.mensagem.deleteMany();
  await prisma.conversa.deleteMany();
  await prisma.pagamento.deleteMany();
  await prisma.saque.deleteMany();
  await prisma.reserva.deleteMany();
  await prisma.favorito.deleteMany();
  await prisma.avaliacao.deleteMany();
  await prisma.roteiro.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.user.deleteMany();
}
