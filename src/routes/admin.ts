import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { requireTipo } from '../middleware/auth';
import {
  alterarAtivoAdmin,
  alterarDestaque,
  aprovarGuia,
  atualizarSaque,
  criarCupom,
  listarCupons,
  listarDenuncias,
  listarGuias,
  listarRoteirosAdmin,
  listarSaquesAdmin,
  recusarGuia,
} from '../services/admin.service';

export const adminRouter = Router();

adminRouter.use(requireTipo('ADMIN'));

adminRouter.post(
  '/cupons',
  asyncHandler(async (req, res) => {
    res.status(201).json(await criarCupom(req.body));
  }),
);

adminRouter.get(
  '/cupons',
  asyncHandler(async (_req, res) => {
    res.json(await listarCupons());
  }),
);

adminRouter.get(
  '/guias',
  asyncHandler(async (req, res) => {
    res.json(await listarGuias(req.query.status));
  }),
);

adminRouter.post(
  '/guias/:id/aprovar',
  asyncHandler(async (req, res) => {
    res.json(await aprovarGuia(req.params.id));
  }),
);

adminRouter.post(
  '/guias/:id/recusar',
  asyncHandler(async (req, res) => {
    res.json(await recusarGuia(req.params.id));
  }),
);

adminRouter.get(
  '/roteiros',
  asyncHandler(async (_req, res) => {
    res.json(await listarRoteirosAdmin());
  }),
);

adminRouter.patch(
  '/roteiros/:id/destaque',
  asyncHandler(async (req, res) => {
    res.json(await alterarDestaque(req.params.id, req.body));
  }),
);

adminRouter.patch(
  '/roteiros/:id/ativo',
  asyncHandler(async (req, res) => {
    res.json(await alterarAtivoAdmin(req.params.id, req.body));
  }),
);

adminRouter.get(
  '/denuncias',
  asyncHandler(async (_req, res) => {
    res.json(await listarDenuncias());
  }),
);

adminRouter.get(
  '/saques',
  asyncHandler(async (_req, res) => {
    res.json(await listarSaquesAdmin());
  }),
);

adminRouter.patch(
  '/saques/:id',
  asyncHandler(async (req, res) => {
    res.json(await atualizarSaque(req.params.id, req.body));
  }),
);
