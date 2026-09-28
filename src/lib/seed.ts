import { hashPassword } from './password';
import { prisma } from './prisma';
import { seedCatalog } from './seed-catalog';

const testUsers = [
  { email: 'turista@goguia.test', nomeCompleto: 'Turista Teste', tipo: 'TURISTA' },
  { email: 'guia@goguia.test', nomeCompleto: 'Pedro Marcos França', tipo: 'GUIA' },
  { email: 'carlos.lima@goguia.test', nomeCompleto: 'Carlos Alberto Lima', tipo: 'GUIA' },
  { email: 'mariana.reis@goguia.test', nomeCompleto: 'Mariana Costa Reis', tipo: 'GUIA' },
  { email: 'fernanda.souza@goguia.test', nomeCompleto: 'Fernanda Souza', tipo: 'GUIA' },
  { email: 'ricardo.silveira@goguia.test', nomeCompleto: 'Ricardo Silveira', tipo: 'GUIA' },
  { email: 'antonio.bezerra@goguia.test', nomeCompleto: 'Antônio Bezerra', tipo: 'GUIA' },
  { email: 'admin@goguia.test', nomeCompleto: 'Admin GoGuia', tipo: 'ADMIN' },
];

export async function seedTestUsers() {
  const senhaHash = await hashPassword('Senha@123');

  for (const user of testUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        nomeCompleto: user.nomeCompleto,
        tipo: user.tipo,
        senhaHash,
        emailConfirmado: true,
        encerradaEm: null,
        tokensInvalidosAntes: null,
        statusAprovacao: user.tipo === 'GUIA' ? 'APROVADO' : null,
      },
      create: {
        ...user,
        senhaHash,
        emailConfirmado: true,
        statusAprovacao: user.tipo === 'GUIA' ? 'APROVADO' : null,
      },
    });
  }

  await prisma.user.update({
    where: { email: 'guia@goguia.test' },
    data: {
      bio: 'Guia de Brasília.',
      idiomas: ['português'],
      cidade: 'Brasília',
      estado: 'DF',
    },
  });

  await prisma.cupom.upsert({
    where: { codigo: 'BEMVINDO10' },
    update: { tipo: 'PERCENTUAL', valor: 10, ativo: true, expiraEm: null },
    create: { codigo: 'BEMVINDO10', tipo: 'PERCENTUAL', valor: 10, ativo: true },
  });

  await seedCatalog();
}
