import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { getAuthUser, requireTipo } from '../middleware/auth';
import { optionalFotoUpload, requiredFotoUpload } from '../middleware/upload';
import { obterAgenda, salvarAgenda } from '../services/agenda.service';
import { atualizarFotoGuia, atualizarPerfilGuia, perfilDoGuia } from '../services/guia-perfil.service';
import { carteiraGuia, listarSaques, solicitarSaque } from '../services/carteira.service';
import {
  alterarAtivo,
  atualizarRoteiro,
  criarRoteiro,
  listarRoteirosDoGuia,
  obterRoteiroDoGuia,
} from '../services/catalogo.service';
import {
  aceitarReserva,
  listarReservasDoGuia,
  obterReservaDoGuia,
  recusarReserva,
  resumoSemana,
} from '../services/reservas.service';

export const guiaRouter = Router();

guiaRouter.use(requireTipo('GUIA'));

guiaRouter.get(
  '/perfil',
  asyncHandler(async (req, res) => {
    res.json(await perfilDoGuia(getAuthUser(req).id));
  }),
);

guiaRouter.put(
  '/perfil',
  asyncHandler(async (req, res) => {
    res.json(await atualizarPerfilGuia(getAuthUser(req).id, req.body));
  }),
);

guiaRouter.post(
  '/perfil/foto',
  requiredFotoUpload,
  asyncHandler(async (req, res) => {
    res.json(await atualizarFotoGuia(getAuthUser(req).id, req.file as Express.Multer.File));
  }),
);

guiaRouter.get(
  '/roteiros/:id/agenda',
  asyncHandler(async (req, res) => {
    res.json(await obterAgenda(getAuthUser(req).id, req.params.id));
  }),
);

guiaRouter.put(
  '/roteiros/:id/agenda',
  asyncHandler(async (req, res) => {
    res.json(await salvarAgenda(getAuthUser(req).id, req.params.id, req.body));
  }),
);

guiaRouter.get(
  '/roteiros',
  asyncHandler(async (req, res) => {
    res.json(await listarRoteirosDoGuia(getAuthUser(req).id, req.query.q));
  }),
);

guiaRouter.post(
  '/roteiros',
  optionalFotoUpload,
  asyncHandler(async (req, res) => {
    res.status(201).json(await criarRoteiro(getAuthUser(req).id, req.body, req.file));
  }),
);

guiaRouter.get(
  '/roteiros/:id',
  asyncHandler(async (req, res) => {
    res.json(await obterRoteiroDoGuia(getAuthUser(req).id, req.params.id));
  }),
);

guiaRouter.put(
  '/roteiros/:id',
  optionalFotoUpload,
  asyncHandler(async (req, res) => {
    res.json(await atualizarRoteiro(getAuthUser(req).id, req.params.id, req.body, req.file));
  }),
);

guiaRouter.patch(
  '/roteiros/:id/ativo',
  asyncHandler(async (req, res) => {
    res.json(await alterarAtivo(getAuthUser(req).id, req.params.id, req.body));
  }),
);

guiaRouter.get(
  '/reservas',
  asyncHandler(async (req, res) => {
    res.json(await listarReservasDoGuia(getAuthUser(req).id, req.query.quando));
  }),
);

guiaRouter.get(
  '/resumo-semana',
  asyncHandler(async (req, res) => {
    res.json(await resumoSemana(getAuthUser(req).id));
  }),
);

guiaRouter.get(
  '/reservas/:id',
  asyncHandler(async (req, res) => {
    res.json(await obterReservaDoGuia(getAuthUser(req).id, req.params.id));
  }),
);

guiaRouter.post(
  '/reservas/:id/aceitar',
  asyncHandler(async (req, res) => {
    res.json(await aceitarReserva(getAuthUser(req).id, req.params.id));
  }),
);

guiaRouter.post(
  '/reservas/:id/recusar',
  asyncHandler(async (req, res) => {
    res.json(await recusarReserva(getAuthUser(req).id, req.params.id));
  }),
);

guiaRouter.get(
  '/carteira',
  asyncHandler(async (req, res) => {
    res.json(await carteiraGuia(getAuthUser(req).id));
  }),
);

guiaRouter.post(
  '/saques',
  asyncHandler(async (req, res) => {
    res.status(201).json(await solicitarSaque(getAuthUser(req).id, req.body));
  }),
);

guiaRouter.get(
  '/saques',
  asyncHandler(async (req, res) => {
    res.json(await listarSaques(getAuthUser(req).id));
  }),
);
