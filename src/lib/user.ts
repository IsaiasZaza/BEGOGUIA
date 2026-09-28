export type PublicUser = {
  id: string;
  nomeCompleto: string;
  email: string;
  fotoUrl: string | null;
  tipo: string;
  emailConfirmado: boolean;
};

export function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    nomeCompleto: user.nomeCompleto,
    email: user.email,
    fotoUrl: user.fotoUrl,
    tipo: user.tipo,
    emailConfirmado: user.emailConfirmado,
  };
}
