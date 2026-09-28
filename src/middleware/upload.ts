import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { config } from '../config';
import { AppError } from '../lib/errors';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxPhotoBytes, files: 1 },
  fileFilter(_req, file, callback) {
    if (!allowed.has(file.mimetype)) {
      callback(new AppError(415, 'Formato de imagem não suportado', 'UNSUPPORTED_MEDIA_TYPE'));
      return;
    }
    callback(null, true);
  },
});

export function optionalFotoUpload(req: Request, res: Response, next: NextFunction) {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('multipart/form-data')) {
    next();
    return;
  }
  upload.single('foto')(req, res, next);
}

export function requiredFotoUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('foto')(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    if (!req.file) {
      next(new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { foto: 'Envie uma foto' }));
      return;
    }
    next();
  });
}

export const cadastroUpload = optionalFotoUpload;
