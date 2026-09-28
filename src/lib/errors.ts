export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public errors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function unauthorized(message = 'Token ausente, inválido ou expirado') {
  return new AppError(401, message, 'UNAUTHORIZED');
}
