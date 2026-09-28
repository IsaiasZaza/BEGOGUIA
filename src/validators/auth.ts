import { ZodError, z } from 'zod';
import { AppError } from '../lib/errors';

export const senhaSchema = z
  .string({
    required_error: 'Senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra e 1 número',
    invalid_type_error: 'Senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra e 1 número',
  })
  .superRefine((value, ctx) => {
    if (value.length < 8 || !/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra e 1 número',
      });
    }
  });

const cadastroSchema = z.object({
  nomeCompleto: z
    .string({ required_error: 'Nome é obrigatório', invalid_type_error: 'Nome é obrigatório' })
    .trim()
    .min(2, 'Nome deve ter entre 2 e 120 caracteres')
    .max(120, 'Nome deve ter entre 2 e 120 caracteres'),
  email: z
    .string({ required_error: 'E-mail é obrigatório', invalid_type_error: 'E-mail inválido' })
    .trim()
    .email('E-mail inválido')
    .max(254, 'E-mail inválido')
    .transform((value) => value.toLowerCase()),
  senha: senhaSchema,
  tipo: z
    .enum(['TURISTA', 'GUIA'], {
      errorMap: () => ({ message: 'Tipo deve ser TURISTA ou GUIA' }),
    })
    .optional(),
});

const loginSchema = z.object({
  email: z
    .string({ required_error: 'E-mail é obrigatório', invalid_type_error: 'E-mail inválido' })
    .trim()
    .min(1, 'E-mail é obrigatório')
    .email('E-mail inválido')
    .transform((value) => value.toLowerCase()),
  senha: z
    .string({ required_error: 'Senha é obrigatória', invalid_type_error: 'Senha é obrigatória' })
    .min(1, 'Senha é obrigatória'),
});

const emailSchema = z.object({
  email: z
    .string({ required_error: 'E-mail é obrigatório', invalid_type_error: 'E-mail inválido' })
    .trim()
    .min(1, 'E-mail é obrigatório')
    .email('E-mail inválido')
    .transform((value) => value.toLowerCase()),
});

const resetSchema = z.object({
  token: z.string({ required_error: 'Token inválido ou expirado', invalid_type_error: 'Token inválido ou expirado' }).min(1, 'Token inválido ou expirado'),
  novaSenha: senhaSchema,
});

const confirmSchema = z.object({
  token: z.string({ required_error: 'Token inválido ou expirado', invalid_type_error: 'Token inválido ou expirado' }).min(1, 'Token inválido ou expirado'),
});

function zodErrors(error: ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

function asRecord(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  return { ...(body as Record<string, unknown>) };
}

function preprocessCadastro(body: unknown) {
  const record = asRecord(body);
  if (typeof record.nomeCompleto === 'string') record.nomeCompleto = record.nomeCompleto.trim();
  if (typeof record.email === 'string') record.email = record.email.trim();
  if (typeof record.tipo === 'string') {
    const tipo = record.tipo.trim();
    if (tipo === '') delete record.tipo;
    else record.tipo = tipo;
  }
  return record;
}

function parse<T>(schema: z.ZodType<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', zodErrors(result.error));
  }
  return result.data;
}

export function parseCadastro(body: unknown) {
  return parse(cadastroSchema, preprocessCadastro(body));
}

export function parseLogin(body: unknown) {
  const record = asRecord(body);
  if (typeof record.email === 'string') record.email = record.email.trim();
  return parse(loginSchema, record);
}

export function parseForgotPassword(body: unknown) {
  const record = asRecord(body);
  if (typeof record.email === 'string') record.email = record.email.trim();
  return parse(emailSchema, record);
}

export function parseResetPassword(body: unknown) {
  const result = resetSchema.safeParse(asRecord(body));
  if (result.success) return result.data;

  const errors = zodErrors(result.error);
  if (errors.novaSenha) {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', errors);
  }
  throw new AppError(400, 'Token inválido ou expirado', 'INVALID_TOKEN');
}

export function parseConfirmEmail(body: unknown) {
  const result = confirmSchema.safeParse(asRecord(body));
  if (!result.success) {
    throw new AppError(400, 'Token inválido ou expirado', 'INVALID_TOKEN');
  }
  return result.data;
}
