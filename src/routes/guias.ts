import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { perfilPublico } from '../services/guia-perfil.service';

export const guiasRouter = Router();

guiasRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await perfilPublico(req.params.id));
  }),
);
