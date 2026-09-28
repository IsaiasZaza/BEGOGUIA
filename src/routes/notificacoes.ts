import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { getAuthUser, requireAuth } from '../middleware/auth';

export const notificacoesRouter = Router();

notificacoesRouter.use(requireAuth);

notificacoesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await prisma.notificacao.findMany({
      where: { userId: getAuthUser(req).id },
      orderBy: { criadoEm: 'desc' },
    });
    res.json({
      items: items.map((item) => ({
        id: item.id,
        tipo: item.tipo,
        titulo: item.titulo,
        texto: item.texto,
        lida: item.lida,
        criadoEm: item.criadoEm.toISOString(),
        href: item.href,
      })),
    });
  }),
);

notificacoesRouter.patch(
  '/:id/lida',
  asyncHandler(async (req, res) => {
    const aviso = await prisma.notificacao.findUnique({ where: { id: req.params.id } });
    if (!aviso || aviso.userId !== getAuthUser(req).id) {
      throw new AppError(404, 'Aviso não encontrado', 'NOT_FOUND');
    }
    await prisma.notificacao.update({ where: { id: aviso.id }, data: { lida: true } });
    res.status(204).send();
  }),
);
