import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../lib/errors';

function statusOf(err: unknown) {
  if (typeof err !== 'object' || !err) return undefined;
  if ('status' in err && typeof err.status === 'number') return err.status;
  if ('statusCode' in err && typeof err.statusCode === 'number') return err.statusCode;
  return undefined;
}

function isJsonParseError(err: unknown) {
  if (err instanceof SyntaxError && 'body' in err) return true;
  return typeof err === 'object' && !!err && 'type' in err && err.type === 'entity.parse.failed';
}

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: 'Arquivo excede o limite', code: 'FILE_TOO_LARGE' });
      return;
    }
    res.status(400).json({ message: 'Falha no upload', code: 'UPLOAD_ERROR' });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.errors ? { errors: err.errors } : {}),
    });
    return;
  }

  const status = statusOf(err);
  if (status === 404) {
    res.status(404).json({ message: 'Rota não encontrada', code: 'NOT_FOUND' });
    return;
  }

  if (isJsonParseError(err)) {
    res.status(400).json({ message: 'Dados inválidos', code: 'VALIDATION_ERROR' });
    return;
  }

  console.error(err);
  res.status(500).json({ message: 'Erro interno', code: 'INTERNAL_ERROR' });
}
