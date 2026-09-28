import { prisma } from './lib/prisma';
import { seedTestUsers } from './lib/seed';

seedTestUsers()
  .then(async () => {
    console.log('Usuários de teste prontos:');
    console.log('- turista@goguia.test / Senha@123 (TURISTA)');
    console.log('- guia@goguia.test / Senha@123 (GUIA)');
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
