import type { NextFunction, Request, Response } from 'express';
import type { User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { AppError, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    if (!match) {
      next(unauthorized());
      return;
    }

    const payload = verifyAccessToken(match[1]);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.encerradaEm) {
      next(unauthorized());
      return;
    }

    if (user.tokensInvalidosAntes && payload.iat * 1000 <= user.tokensInvalidosAntes.getTime()) {
      next(unauthorized());
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AppError || error instanceof jwt.JsonWebTokenError) {
      next(error instanceof AppError ? error : unauthorized());
      return;
    }
    next(error);
  }
}

const mensagemPapel: Record<string, string> = {
  TURISTA: 'Acesso restrito a turistas',
  GUIA: 'Acesso restrito a guias',
  ADMIN: 'Acesso restrito a administradores',
};

export function requireTipo(...tipos: Array<'TURISTA' | 'GUIA' | 'ADMIN'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    requireAuth(req, res, (error) => {
      if (error) {
        next(error);
        return;
      }
      if (!req.user || !tipos.includes(req.user.tipo as 'TURISTA' | 'GUIA' | 'ADMIN')) {
        next(new AppError(403, tipos.length === 1 ? mensagemPapel[tipos[0]] : 'Acesso negado', 'FORBIDDEN'));
        return;
      }
      next();
    });
  };
}

export function getAuthUser(req: Request): User {
  if (!req.user) throw unauthorized();
  return req.user;
}
