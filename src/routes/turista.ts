import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { getAuthUser, requireTipo } from '../middleware/auth';
import { carteiraTurista } from '../services/carteira.service';
import { desfavoritar, favoritar, listarFavoritos } from '../services/catalogo.service';
import { listarReservasDoTurista } from '../services/reservas.service';

export const turistaRouter = Router();

turistaRouter.use(requireTipo('TURISTA'));

turistaRouter.get(
  '/favoritos',
  asyncHandler(async (req, res) => {
    res.json(await listarFavoritos(getAuthUser(req).id));
  }),
);

turistaRouter.post(
  '/favoritos',
  asyncHandler(async (req, res) => {
    res.status(201).json(await favoritar(getAuthUser(req).id, req.body));
  }),
);

turistaRouter.delete(
  '/favoritos/:roteiroId',
  asyncHandler(async (req, res) => {
    await desfavoritar(getAuthUser(req).id, req.params.roteiroId);
    res.status(204).send();
  }),
);

turistaRouter.get(
  '/reservas',
  asyncHandler(async (req, res) => {
    res.json(await listarReservasDoTurista(getAuthUser(req).id, req.query.status));
  }),
);

turistaRouter.get(
  '/carteira',
  asyncHandler(async (req, res) => {
    res.json(await carteiraTurista(getAuthUser(req).id));
  }),
);
