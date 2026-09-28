import { Prisma } from '@prisma/client';
import { config, isEmailConfirmationRequired } from '../config';
import { AppError } from '../lib/errors';
import { removePhotoByUrl, savePhoto } from '../lib/image';
import { signToken } from '../lib/jwt';
import { sendConfirmationEmail, sendPasswordResetEmail } from '../lib/mailer';
import { hashPassword, verifyPassword } from '../lib/password';
import { prisma } from '../lib/prisma';
import { consumeToken, issueToken } from '../lib/tokens';
import { toPublicUser, type PublicUser } from '../lib/user';
import {
  parseCadastro,
  parseConfirmEmail,
  parseForgotPassword,
  parseLogin,
  parseResetPassword,
} from '../validators/auth';

export type AuthSuccess = {
  token: string;
  expiresIn: number;
  user: PublicUser;
};

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function authSuccess(user: PublicUser, tokenUser: { id: string; email: string; tipo: string }): AuthSuccess {
  return {
    token: signToken(tokenUser),
    expiresIn: config.jwtExpiresInSeconds,
    user,
  };
}

export async function register(rawBody: unknown, file?: Express.Multer.File) {
  const data = parseCadastro(rawBody);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError(409, 'E-mail já cadastrado', 'EMAIL_ALREADY_EXISTS', {
      email: 'E-mail já cadastrado',
    });
  }

  let fotoUrl: string | null = null;
  try {
    if (file) fotoUrl = await savePhoto(file);

    const user = await prisma.user.create({
      data: {
        nomeCompleto: data.nomeCompleto,
        email: data.email,
        senhaHash: await hashPassword(data.senha),
        tipo: data.tipo ?? 'TURISTA',
        statusAprovacao: data.tipo === 'GUIA' ? 'PENDENTE' : null,
        fotoUrl,
        emailConfirmado: false,
      },
    });

    try {
      const token = await issueToken(user.id, 'EMAIL_CONFIRM');
      await sendConfirmationEmail(user.email, token);
    } catch (error) {
      console.error('Falha ao emitir confirmação de e-mail', error);
    }

    const publicUser = toPublicUser(user);
    if (isEmailConfirmationRequired()) {
      return {
        message: 'Enviamos um link para confirmar seu e-mail',
        user: publicUser,
      };
    }

    return authSuccess(publicUser, user);
  } catch (error) {
    await removePhotoByUrl(fotoUrl);
    if (isUniqueConstraint(error)) {
      throw new AppError(409, 'E-mail já cadastrado', 'EMAIL_ALREADY_EXISTS', {
        email: 'E-mail já cadastrado',
      });
    }
    throw error;
  }
}

export async function login(rawBody: unknown): Promise<AuthSuccess> {
  const data = parseLogin(rawBody);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  const valid = await verifyPassword(data.senha, user?.senhaHash ?? null);

  if (!user || !valid || user.encerradaEm) {
    throw new AppError(401, 'Credenciais inválidas', 'INVALID_CREDENTIALS');
  }

  if (isEmailConfirmationRequired() && !user.emailConfirmado) {
    throw new AppError(403, 'Confirme seu e-mail antes de entrar', 'EMAIL_NOT_CONFIRMED');
  }

  return authSuccess(toPublicUser(user), user);
}

export async function forgotPassword(rawBody: unknown) {
  const data = parseForgotPassword(rawBody);
  const user = await prisma.user.findUnique({ where: { email: data.email } });

  if (user && !user.encerradaEm) {
    const token = await issueToken(user.id, 'PASSWORD_RESET');
    await sendPasswordResetEmail(user.email, token);
  }

  return {
    message: 'Se o e-mail existir, enviaremos instruções para redefinir a senha',
  };
}

export async function resetPassword(rawBody: unknown) {
  const data = parseResetPassword(rawBody);
  const record = await consumeToken(data.token, 'PASSWORD_RESET');
  if (!record) {
    throw new AppError(400, 'Token inválido ou expirado', 'INVALID_TOKEN');
  }

  await prisma.user.update({
    where: { id: record.userId },
    data: { senhaHash: await hashPassword(data.novaSenha) },
  });

  return { message: 'Senha alterada com sucesso' };
}

export async function confirmEmail(token: string) {
  const record = await consumeToken(token, 'EMAIL_CONFIRM');
  if (!record) {
    throw new AppError(400, 'Token inválido ou expirado', 'INVALID_TOKEN');
  }

  const user = await prisma.user.update({
    where: { id: record.userId },
    data: { emailConfirmado: true },
  });

  return toPublicUser(user);
}

export async function confirmEmailFromBody(rawBody: unknown) {
  const data = parseConfirmEmail(rawBody);
  return confirmEmail(data.token);
}
