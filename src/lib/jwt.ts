import jwt, { type JwtPayload } from 'jsonwebtoken';
import { config } from '../config';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  tipo: string;
  iat: number;
  exp: number;
};

type TokenUser = {
  id: string;
  email: string;
  tipo: string;
};

export function signToken(user: TokenUser) {
  return jwt.sign({ email: user.email, tipo: user.tipo }, config.jwtSecret, {
    subject: user.id,
    expiresIn: config.jwtExpiresInSeconds,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded.sub) {
    throw new Error('Token inválido');
  }

  const claims = decoded as JwtPayload & { email?: unknown; tipo?: unknown };
  if (typeof claims.email !== 'string' || typeof claims.tipo !== 'string') {
    throw new Error('Token inválido');
  }

  return {
    sub: decoded.sub,
    email: claims.email,
    tipo: claims.tipo,
    iat: Number(decoded.iat ?? 0),
    exp: Number(decoded.exp ?? 0),
  };
}
