import { Router } from 'express';
import { config } from '../config';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { toPublicUser } from '../lib/user';
import { getAuthUser, requireAuth } from '../middleware/auth';
import { cadastroUpload } from '../middleware/upload';
import {
  confirmEmail,
  confirmEmailFromBody,
  forgotPassword,
  login,
  register,
  resetPassword,
} from '../services/auth.service';

export const authRouter = Router();

authRouter.post(
  '/cadastro',
  cadastroUpload,
  asyncHandler(async (req, res) => {
    const result = await register(req.body, req.file);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    res.json(await login(req.body));
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(toPublicUser(getAuthUser(req)));
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.status(204).send();
  }),
);

authRouter.post(
  '/esqueci-senha',
  asyncHandler(async (req, res) => {
    res.json(await forgotPassword(req.body));
  }),
);

authRouter.post(
  '/redefinir-senha',
  asyncHandler(async (req, res) => {
    res.json(await resetPassword(req.body));
  }),
);

authRouter.post(
  '/confirmar-email',
  asyncHandler(async (req, res) => {
    const user = await confirmEmailFromBody(req.body);
    res.json({ message: 'E-mail confirmado', user });
  }),
);

authRouter.get(
  '/confirmar-email',
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const wantsHtml = (req.headers.accept ?? '').includes('text/html');

    try {
      const user = await confirmEmail(token);
      if (wantsHtml) {
        res.redirect(`${config.frontendUrl}/confirmacao-email?status=success`);
        return;
      }
      res.json({ message: 'E-mail confirmado', user });
    } catch (error) {
      if (wantsHtml && error instanceof AppError) {
        res.redirect(`${config.frontendUrl}/confirmacao-email?status=error`);
        return;
      }
      throw error;
    }
  }),
);
