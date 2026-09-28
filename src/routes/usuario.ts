import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { getAuthUser, requireAuth } from '../middleware/auth';
import { atualizarPerfil, encerrarConta, obterPerfil, trocarSenha } from '../services/perfil.service';

export const usuarioRouter = Router();

usuarioRouter.use(requireAuth);

usuarioRouter.get(
  '/perfil',
  asyncHandler(async (req, res) => {
    res.json(await obterPerfil(getAuthUser(req).id));
  }),
);

usuarioRouter.put(
  '/perfil',
  asyncHandler(async (req, res) => {
    res.json(await atualizarPerfil(getAuthUser(req).id, req.body));
  }),
);

usuarioRouter.put(
  '/senha',
  asyncHandler(async (req, res) => {
    await trocarSenha(getAuthUser(req).id, req.body);
    res.status(204).send();
  }),
);

usuarioRouter.delete(
  '/conta',
  asyncHandler(async (req, res) => {
    await encerrarConta(getAuthUser(req).id);
    res.status(204).send();
  }),
);
