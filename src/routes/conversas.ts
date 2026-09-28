import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { getAuthUser, requireAuth } from '../middleware/auth';
import { abrirConversa, enviarMensagem, listarConversas, listarMensagens } from '../services/conversas.service';

export const conversasRouter = Router();

conversasRouter.use(requireAuth);

conversasRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const resultado = await abrirConversa(getAuthUser(req).id, req.body);
    res.status(resultado.status).json(resultado.conversa);
  }),
);

conversasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listarConversas(getAuthUser(req).id));
  }),
);

conversasRouter.get(
  '/:id/mensagens',
  asyncHandler(async (req, res) => {
    res.json(await listarMensagens(getAuthUser(req).id, req.params.id, req.query.depois));
  }),
);

conversasRouter.post(
  '/:id/mensagens',
  asyncHandler(async (req, res) => {
    res.status(201).json(await enviarMensagem(getAuthUser(req).id, req.params.id, req.body));
  }),
);
