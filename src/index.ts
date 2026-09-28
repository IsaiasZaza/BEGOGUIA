import { app } from './app';
import { assertSecureConfig, config, shouldSeedOnBoot } from './config';
import { prisma } from './lib/prisma';
import { seedTestUsers } from './lib/seed';

async function main() {
  assertSecureConfig();

  try {
    await prisma.$connect();
  } catch (error) {
    console.error('Não foi possível conectar ao banco. Rode: npx prisma db push');
    throw error;
  }

  if (shouldSeedOnBoot()) {
    await seedTestUsers();
    console.log('Usuários de teste (senha Senha@123):');
    console.log('- turista@goguia.test (TURISTA)');
    console.log('- guia@goguia.test (GUIA, Pedro Marcos França)');
    console.log('- admin@goguia.test (ADMIN)');
  }

  app.listen(config.port, () => {
    console.log(`GoGuia API ouvindo em ${config.publicUrl}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
