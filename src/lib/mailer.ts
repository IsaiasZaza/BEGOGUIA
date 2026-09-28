import nodemailer from 'nodemailer';
import { config } from '../config';

export type SentEmail = {
  to: string;
  subject: string;
  text: string;
};

export const sentEmails: SentEmail[] = [];

export function clearSentEmails() {
  sentEmails.length = 0;
}

export async function sendMail(to: string, subject: string, text: string) {
  sentEmails.push({ to, subject, text });
  if (sentEmails.length > 100) sentEmails.shift();

  if (config.nodeEnv !== 'production') {
    console.log(`\n[email] Para: ${to}\n[email] Assunto: ${subject}\n${text}\n`);
  }

  if (!process.env.SMTP_HOST) return;

  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM ?? 'GoGuia <noreply@goguia.test>',
      to,
      subject,
      text,
    });
  } catch (error) {
    console.error('[email] falha SMTP', error);
  }
}

export async function sendConfirmationEmail(email: string, token: string) {
  const feLink = `${config.frontendUrl}/confirmacao-email?token=${encodeURIComponent(token)}`;
  const apiLink = `${config.publicUrl}/auth/confirmar-email?token=${encodeURIComponent(token)}`;
  const text = [
    'Confirme seu e-mail no GoGuia.',
    '',
    `Abra este link: ${feLink}`,
    '',
    `Ou confirme direto na API: ${apiLink}`,
    '',
    `O link expira em ${config.emailConfirmTtlHours} horas.`,
  ].join('\n');

  await sendMail(email, 'Confirme seu e-mail — GoGuia', text);
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const feLink = `${config.frontendUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
  const text = [
    'Recebemos um pedido para redefinir a senha da sua conta GoGuia.',
    '',
    `Abra este link: ${feLink}`,
    '',
    `O link expira em ${config.passwordResetTtlHours} ${config.passwordResetTtlHours === 1 ? 'hora' : 'horas'}.`,
    'Se você não pediu a redefinição, ignore este e-mail.',
  ].join('\n');

  await sendMail(email, 'Redefina sua senha — GoGuia', text);
}
