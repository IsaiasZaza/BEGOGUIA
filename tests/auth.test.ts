import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../src/app';
import { sentEmails, clearSentEmails } from '../src/lib/mailer';
import { prisma } from '../src/lib/prisma';
import { seedTestUsers } from '../src/lib/seed';
import { clearAllData } from './db';

if (!process.env.DATABASE_URL?.includes('test.db')) {
  throw new Error('Recusando testes fora do banco de teste');
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function uniqueEmail() {
  return `user-${randomUUID()}@goguia.test`;
}

function tokenFromEmail(email: string) {
  const message = [...sentEmails].reverse().find((item) => item.to === email);
  assert.ok(message, `e-mail não enviado para ${email}`);
  const match = message.text.match(/token=([a-f0-9]+)/);
  assert.ok(match, 'token ausente no e-mail');
  return match[1];
}

describe('auth', () => {
  before(async () => {
    await clearAllData();
    clearSentEmails();
  });

  it('cadastra com JSON, devolve token e autentica /auth/me', async () => {
    const email = uniqueEmail();
    const created = await request(app).post('/auth/cadastro').send({
      nomeCompleto: '  Maria Silva  ',
      email: email.toUpperCase(),
      senha: 'Senha@123',
    });

    assert.equal(created.status, 201);
    assert.equal(typeof created.body.token, 'string');
    assert.equal(created.body.expiresIn, 86400);
    assert.equal(created.body.user.email, email);
    assert.equal(created.body.user.nomeCompleto, 'Maria Silva');
    assert.equal(created.body.user.tipo, 'TURISTA');
    assert.equal(created.body.user.fotoUrl, null);
    assert.equal(created.body.user.emailConfirmado, false);
    assert.equal(JSON.stringify(created.body).includes('senhaHash'), false);

    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${created.body.token}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.id, created.body.user.id);
    assert.equal(me.body.email, email);
  });

  it('cadastra guia com foto e serve o arquivo', async () => {
    const email = uniqueEmail();
    const created = await request(app)
      .post('/auth/cadastro')
      .field('nomeCompleto', 'João Guia')
      .field('email', email)
      .field('senha', 'Senha@123')
      .field('tipo', 'GUIA')
      .attach('foto', PNG, { filename: 'foto.png', contentType: 'image/png' });

    assert.equal(created.status, 201);
    assert.equal(created.body.user.tipo, 'GUIA');
    assert.match(created.body.user.fotoUrl, /^http:\/\/localhost:3001\/uploads\/.+\.png$/);

    const pathname = new URL(created.body.user.fotoUrl).pathname;
    const image = await request(app).get(pathname);
    assert.equal(image.status, 200);
    assert.match(image.headers['content-type'], /image\/png/);
  });

  it('rejeita cadastro inválido, e-mail duplicado e upload ruim', async () => {
    const invalid = await request(app).post('/auth/cadastro').send({
      nomeCompleto: 'M',
      email: 'nao-e-email',
      senha: 'curta',
      tipo: 'ADMIN',
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'VALIDATION_ERROR');
    assert.ok(invalid.body.errors.nomeCompleto);
    assert.ok(invalid.body.errors.email);
    assert.ok(invalid.body.errors.senha);
    assert.ok(invalid.body.errors.tipo);

    const email = uniqueEmail();
    const first = await request(app).post('/auth/cadastro').send({
      nomeCompleto: 'Maria Silva',
      email,
      senha: 'Senha@123',
    });
    assert.equal(first.status, 201);

    const duplicate = await request(app).post('/auth/cadastro').send({
      nomeCompleto: 'Maria Silva',
      email: email.toUpperCase(),
      senha: 'Senha@123',
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, 'E-mail já cadastrado');
    assert.equal(duplicate.body.code, 'EMAIL_ALREADY_EXISTS');

    const tooBig = await request(app)
      .post('/auth/cadastro')
      .field('nomeCompleto', 'Maria Silva')
      .field('email', uniqueEmail())
      .field('senha', 'Senha@123')
      .attach('foto', Buffer.alloc(3000, 1), { filename: 'grande.png', contentType: 'image/png' });
    assert.equal(tooBig.status, 413);
    assert.equal(tooBig.body.message, 'Arquivo excede o limite');

    const fakePng = await request(app)
      .post('/auth/cadastro')
      .field('nomeCompleto', 'Maria Silva')
      .field('email', uniqueEmail())
      .field('senha', 'Senha@123')
      .attach('foto', Buffer.from('nao-e-imagem'), { filename: 'foto.png', contentType: 'image/png' });
    assert.equal(fakePng.status, 415);

    const textFile = await request(app)
      .post('/auth/cadastro')
      .field('nomeCompleto', 'Maria Silva')
      .field('email', uniqueEmail())
      .field('senha', 'Senha@123')
      .attach('foto', Buffer.from('oi'), { filename: 'foto.txt', contentType: 'text/plain' });
    assert.equal(textFile.status, 415);
    assert.equal(textFile.body.message, 'Formato de imagem não suportado');
  });

  it('faz login sem revelar se o e-mail existe e guarda a senha com hash', async () => {
    const email = uniqueEmail();
    await request(app).post('/auth/cadastro').send({
      nomeCompleto: 'Maria Silva',
      email,
      senha: 'Senha@123',
    });

    const ok = await request(app).post('/auth/login').send({ email: `  ${email.toUpperCase()}  `, senha: 'Senha@123' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.email, email);
    assert.equal(ok.body.user.emailConfirmado, false);

    const missing = await request(app).post('/auth/login').send({
      email: 'naoexiste@goguia.test',
      senha: 'Senha@123',
    });
    const wrong = await request(app).post('/auth/login').send({ email, senha: 'SenhaErrada1' });
    assert.equal(missing.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(missing.body.message, 'Credenciais inválidas');
    assert.equal(wrong.body.message, missing.body.message);

    const bad = await request(app).post('/auth/login').send({ email: '', senha: '' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.message, 'Dados inválidos');

    const stored = await prisma.user.findUnique({ where: { email } });
    assert.ok(stored);
    assert.match(stored.senhaHash, /^\$2[aby]\$/);
    assert.notEqual(stored.senhaHash, 'Senha@123');
  });

  it('rejeita sessão ausente, malformada ou expirada e aceita logout', async () => {
    const email = uniqueEmail();
    const created = await request(app).post('/auth/cadastro').send({
      nomeCompleto: 'Maria Silva',
      email,
      senha: 'Senha@123',
    });

    const noHeader = await request(app).get('/auth/me');
    const basic = await request(app).get('/auth/me').set('Authorization', 'Basic abc');
    const garbage = await request(app).get('/auth/me').set('Authorization', 'Bearer nao-e-jwt');
    assert.equal(noHeader.status, 401);
    assert.equal(basic.status, 401);
    assert.equal(garbage.status, 401);

    const expired = jwt.sign(
      { email, tipo: 'TURISTA', exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_SECRET ?? 'test-secret',
      { subject: created.body.user.id, algorithm: 'HS256' },
    );
    const expiredRes = await request(app).get('/auth/me').set('Authorization', `Bearer ${expired}`);
    assert.equal(expiredRes.status, 401);

    const logout = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${created.body.token}`);
    assert.equal(logout.status, 204);

    const logoutMissing = await request(app).post('/auth/logout');
    assert.equal(logoutMissing.status, 401);
  });

  it('confirma e-mail por POST e por redirect HTML', async () => {
    const email = uniqueEmail();
    await request(app).post('/auth/cadastro').send({
      nomeCompleto: 'Maria Silva',
      email,
      senha: 'Senha@123',
    });

    const token = tokenFromEmail(email);
    const confirmed = await request(app).post('/auth/confirmar-email').send({ token });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.message, 'E-mail confirmado');
    assert.equal(confirmed.body.user.emailConfirmado, true);

    const reused = await request(app).post('/auth/confirmar-email').send({ token });
    assert.equal(reused.status, 400);
    assert.equal(reused.body.message, 'Token inválido ou expirado');

    const other = uniqueEmail();
    await request(app).post('/auth/cadastro').send({
      nomeCompleto: 'Ana Silva',
      email: other,
      senha: 'Senha@123',
    });
    const html = await request(app)
      .get('/auth/confirmar-email')
      .query({ token: tokenFromEmail(other) })
      .set('Accept', 'text/html');
    assert.equal(html.status, 302);
    assert.match(html.headers.location ?? '', /\/confirmacao-email\?status=success$/);

    const htmlError = await request(app)
      .get('/auth/confirmar-email')
      .query({ token: 'token-invalido' })
      .set('Accept', 'text/html');
    assert.equal(htmlError.status, 302);
    assert.match(htmlError.headers.location ?? '', /status=error$/);
  });

  it('redefine a senha sem revelar e-mails inexistentes', async () => {
    const email = uniqueEmail();
    await request(app).post('/auth/cadastro').send({
      nomeCompleto: 'Maria Silva',
      email,
      senha: 'Senha@123',
    });

    const unknown = await request(app).post('/auth/esqueci-senha').send({ email: 'ausente@goguia.test' });
    const known = await request(app).post('/auth/esqueci-senha').send({ email: email.toUpperCase() });
    assert.equal(unknown.status, 200);
    assert.equal(known.status, 200);
    assert.equal(unknown.body.message, known.body.message);

    const invalidEmail = await request(app).post('/auth/esqueci-senha').send({ email: 'ruim' });
    assert.equal(invalidEmail.status, 400);

    const token = tokenFromEmail(email);
    const weak = await request(app).post('/auth/redefinir-senha').send({ token, novaSenha: 'fraca' });
    assert.equal(weak.status, 400);
    assert.ok(weak.body.errors.novaSenha);

    const reset = await request(app)
      .post('/auth/redefinir-senha')
      .send({ token, novaSenha: 'NovaSenha@123' });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.message, 'Senha alterada com sucesso');

    const oldPassword = await request(app).post('/auth/login').send({ email, senha: 'Senha@123' });
    const newPassword = await request(app).post('/auth/login').send({ email, senha: 'NovaSenha@123' });
    assert.equal(oldPassword.status, 401);
    assert.equal(newPassword.status, 200);

    const burned = await request(app)
      .post('/auth/redefinir-senha')
      .send({ token, novaSenha: 'OutraSenha@123' });
    assert.equal(burned.status, 400);
  });

  it('bloqueia login sem confirmação quando a flag está ligada', async () => {
    const email = uniqueEmail();
    process.env.REQUIRE_EMAIL_CONFIRMATION = 'true';
    try {
      const created = await request(app).post('/auth/cadastro').send({
        nomeCompleto: 'Maria Silva',
        email,
        senha: 'Senha@123',
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.token, undefined);
      assert.match(created.body.message, /confirmar/i);

      const blocked = await request(app).post('/auth/login').send({ email, senha: 'Senha@123' });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.message, 'Confirme seu e-mail antes de entrar');

      const confirmed = await request(app)
        .post('/auth/confirmar-email')
        .send({ token: tokenFromEmail(email) });
      assert.equal(confirmed.status, 200);

      const allowed = await request(app).post('/auth/login').send({ email, senha: 'Senha@123' });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.body.user.emailConfirmado, true);
    } finally {
      process.env.REQUIRE_EMAIL_CONFIRMATION = 'false';
    }
  });

  it('autentica os usuários de teste documentados', async () => {
    await seedTestUsers();

    const turista = await request(app)
      .post('/auth/login')
      .send({ email: 'turista@goguia.test', senha: 'Senha@123' });
    const guia = await request(app).post('/auth/login').send({ email: 'guia@goguia.test', senha: 'Senha@123' });

    assert.equal(turista.status, 200);
    assert.equal(turista.body.user.tipo, 'TURISTA');
    assert.equal(turista.body.user.emailConfirmado, true);
    assert.equal(guia.status, 200);
    assert.equal(guia.body.user.tipo, 'GUIA');
  });

  it('libera CORS para o frontend e responde health', async () => {
    const health = await request(app).get('/health').set('Origin', 'http://localhost:8080');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');
    assert.equal(health.headers['access-control-allow-origin'], 'http://localhost:8080');
    assert.equal(health.headers['access-control-allow-credentials'], 'true');

    const blocked = await request(app).get('/health').set('Origin', 'http://evil.example');
    assert.equal(blocked.headers['access-control-allow-origin'], undefined);

    const missing = await request(app).get('/nao-existe');
    assert.equal(missing.status, 404);
  });
});
