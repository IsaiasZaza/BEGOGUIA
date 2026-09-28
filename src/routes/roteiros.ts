import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { getAuthUser, requireTipo } from '../middleware/auth';
import { disponibilidade } from '../services/agenda.service';
import { denunciarRoteiro, listarAvaliacoes, listarRoteiros, obterRoteiroPublico } from '../services/catalogo.service';

export const roteirosRouter = Router();

roteirosRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listarRoteiros(req.query as Record<string, unknown>));
  }),
);

roteirosRouter.get(
  '/:id/avaliacoes',
  asyncHandler(async (req, res) => {
    res.json(await listarAvaliacoes(req.params.id));
  }),
);

roteirosRouter.get(
  '/:id/disponibilidade',
  asyncHandler(async (req, res) => {
    res.json(await disponibilidade(req.params.id, req.query.data));
  }),
);

roteirosRouter.post(
  '/:id/denuncias',
  requireTipo('TURISTA', 'GUIA'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await denunciarRoteiro(getAuthUser(req).id, req.params.id, req.body));
  }),
);

roteirosRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await obterRoteiroPublico(req.params.id));
  }),
);
