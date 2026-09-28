import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { getAuthUser, requireAuth, requireTipo } from '../middleware/auth';
import { aplicarCupom, criarReserva, iniciarPagamento, obterPagamento, obterReserva } from '../services/reservas.service';

export const reservasRouter = Router();

reservasRouter.post(
  '/',
  requireTipo('TURISTA'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await criarReserva(getAuthUser(req).id, req.body));
  }),
);

reservasRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await obterReserva(getAuthUser(req).id, req.params.id));
  }),
);

reservasRouter.post(
  '/:id/cupom',
  requireTipo('TURISTA'),
  asyncHandler(async (req, res) => {
    res.json(await aplicarCupom(getAuthUser(req).id, req.params.id, req.body));
  }),
);

reservasRouter.post(
  '/:id/pagamento',
  requireTipo('TURISTA'),
  asyncHandler(async (req, res) => {
    res.json(await iniciarPagamento(getAuthUser(req).id, req.params.id, req.body));
  }),
);

reservasRouter.get(
  '/:id/pagamento',
  requireTipo('TURISTA'),
  asyncHandler(async (req, res) => {
    res.json(await obterPagamento(getAuthUser(req).id, req.params.id));
  }),
);
