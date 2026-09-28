import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, it } from 'node:test';
import request from 'supertest';
import { app } from '../src/app';
import { addDays, diaDaSemanaDaData, hojeSaoPaulo } from '../src/lib/calendar';
import { prisma } from '../src/lib/prisma';
import { seedTestUsers } from '../src/lib/seed';
import { clearAllData } from './db';

if (!process.env.DATABASE_URL?.includes('test.db')) {
  throw new Error('Recusando testes fora do banco de teste');
}

const BIKE = 'a1000000-0000-4000-8000-000000000001';

async function login(email: string) {
  const response = await request(app).post('/auth/login').send({ email, senha: 'Senha@123' });
  assert.equal(response.status, 200);
  return response.body.token as string;
}

function proximoDiaUtil() {
  const hoje = hojeSaoPaulo();
  for (let i = 0; i < 10; i += 1) {
    const data = addDays(hoje, i);
    const dia = diaDaSemanaDaData(data);
    if (dia >= 1 && dia <= 5) return data;
  }
  return addDays(hoje, 1);
}

describe('plataforma', () => {
  before(async () => {
    await clearAllData();
    await seedTestUsers();
  });

  it('entrega a agenda padrão e a disponibilidade do dia útil', async () => {
    const guia = await login('guia@goguia.test');
    const agenda = await request(app).get(`/guia/roteiros/${BIKE}/agenda`).set('Authorization', `Bearer ${guia}`);
    assert.equal(agenda.status, 200);
    assert.deepEqual(agenda.body.diasSemana, [1, 2, 3, 4, 5]);
    assert.deepEqual(agenda.body.horarios, ['09:00']);

    const data = proximoDiaUtil();
    const livre = await request(app).get(`/roteiros/${BIKE}/disponibilidade`).query({ data });
    assert.equal(livre.status, 200);
    assert.equal(livre.body.horarios[0].horario, '09:00');
    assert.equal(livre.body.horarios[0].vagas, 10);

    const domingo = addDays(data, (7 - diaDaSemanaDaData(data)) % 7 || 7);
    const fechado = await request(app).get(`/roteiros/${BIKE}/disponibilidade`).query({ data: domingo });
    assert.deepEqual(fechado.body.horarios, []);

    const invalida = await request(app)
      .put(`/guia/roteiros/${BIKE}/agenda`)
      .set('Authorization', `Bearer ${guia}`)
      .send({ diasSemana: [1], horarios: [], datasBloqueadas: [] });
    assert.equal(invalida.status, 400);
  });

  it('aplica cupom e cashback no PIX e devolve o cashback se expirar', async () => {
    const turista = await login('turista@goguia.test');
    const guia = await login('guia@goguia.test');
    const data = proximoDiaUtil();
    await prisma.user.update({ where: { email: 'turista@goguia.test' }, data: { cashback: 20 } });
    const saldo = await request(app).get('/turista/carteira').set('Authorization', `Bearer ${turista}`);
    assert.equal(saldo.body.cashback, 20);

    const criada = await request(app)
      .post('/reservas')
      .set('Authorization', `Bearer ${turista}`)
      .send({ roteiroId: BIKE, data, horario: '09:00', quantidade: 2 });
    assert.equal(criada.status, 201);
    assert.equal(criada.body.total, 360);

    const cupom = await request(app)
      .post(`/reservas/${criada.body.id}/cupom`)
      .set('Authorization', `Bearer ${turista}`)
      .send({ codigo: 'bemvindo10' });
    assert.equal(cupom.status, 200);
    assert.equal(cupom.body.desconto, 36);
    assert.equal(cupom.body.total, 324);

    process.env.PIX_SIMULADO_PAGO_EM_SEGUNDOS = '99999';
    const pix = await request(app)
      .post(`/reservas/${criada.body.id}/pagamento`)
      .set('Authorization', `Bearer ${turista}`)
      .send({ metodo: 'PIX', usarCashback: true });
    assert.equal(pix.status, 200);
    assert.equal(pix.body.desconto, 36);
    assert.equal(pix.body.cashbackAplicado, 20);
    assert.equal(pix.body.total, 304);

    const carteira = await prisma.user.findUnique({ where: { email: 'turista@goguia.test' } });
    assert.equal(carteira?.cashback, 0);

    await prisma.pagamento.update({
      where: { reservaId: criada.body.id },
      data: { expiraEm: new Date(Date.now() - 1000) },
    });
    const expirado = await request(app)
      .get(`/reservas/${criada.body.id}/pagamento`)
      .set('Authorization', `Bearer ${turista}`);
    assert.equal(expirado.body.status, 'EXPIRADO');
    const devolvido = await prisma.user.findUnique({ where: { email: 'turista@goguia.test' } });
    assert.equal(devolvido?.cashback, 20);

    const avisos = await request(app).get('/notificacoes').set('Authorization', `Bearer ${turista}`);
    assert.equal(avisos.body.items[0].tipo, 'RESERVA_CANCELADA');
    const lida = await request(app)
      .patch(`/notificacoes/${avisos.body.items[0].id}/lida`)
      .set('Authorization', `Bearer ${guia}`);
    assert.equal(lida.status, 404);
  });

  it('mostra o perfil público do guia aprovado e bloqueia roteiro de guia pendente', async () => {
    const guia = await login('guia@goguia.test');
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${guia}`);
    const publico = await request(app).get(`/guias/${me.body.id}`);
    assert.equal(publico.status, 200);
    assert.equal(publico.body.nomeCompleto, 'Pedro Marcos França');
    assert.equal(publico.body.bio, 'Guia de Brasília.');
    assert.equal(publico.body.totalAvaliacoes, 2);
    assert.equal(publico.body.aprovado, true);
    assert.ok(publico.body.roteiros.some((item: { id: string }) => item.id === BIKE));

    const proprio = await request(app).get('/guia/perfil').set('Authorization', `Bearer ${guia}`);
    assert.equal(proprio.body.email, 'guia@goguia.test');

    const novo = await request(app).post('/auth/cadastro').send({
      nomeCompleto: 'Novo Guia',
      email: `guia-${randomUUID()}@goguia.test`,
      senha: 'Senha@123',
      tipo: 'GUIA',
    });
    assert.equal(novo.status, 201);
    const bloqueado = await request(app)
      .post('/guia/roteiros')
      .set('Authorization', `Bearer ${novo.body.token}`)
      .send({
        titulo: 'Passeio novo',
        descricao: 'Ainda sem aprovação.',
        duracao: '1h',
        capacidade: 4,
        preco: 50,
        categoria: 'lazer',
        local: 'Brasília / DF',
      });
    assert.equal(bloqueado.status, 403);
    assert.equal(bloqueado.body.code, 'GUIA_NAO_APROVADO');
    const oculto = await request(app).get(`/guias/${novo.body.user.id}`);
    assert.equal(oculto.status, 404);
  });

  it('administra guia, denúncia, destaque e saque', async () => {
    const admin = await login('admin@goguia.test');
    const turista = await login('turista@goguia.test');
    const guiaToken = await login('guia@goguia.test');
    const guia = await request(app).get('/auth/me').set('Authorization', `Bearer ${guiaToken}`);

    const negado = await request(app).get('/admin/guias').set('Authorization', `Bearer ${turista}`);
    assert.equal(negado.status, 403);

    const pendentes = await request(app).get('/admin/guias').query({ status: 'PENDENTE' }).set('Authorization', `Bearer ${admin}`);
    assert.equal(pendentes.status, 200);
    const novoId = pendentes.body.items[0].id as string;
    const aprovado = await request(app).post(`/admin/guias/${novoId}/aprovar`).set('Authorization', `Bearer ${admin}`);
    assert.equal(aprovado.body.statusAprovacao, 'APROVADO');

    const denuncia = await request(app)
      .post(`/roteiros/${BIKE}/denuncias`)
      .set('Authorization', `Bearer ${turista}`)
      .send({ motivo: 'Descrição não corresponde ao passeio' });
    assert.equal(denuncia.status, 201);

    const lista = await request(app).get('/admin/denuncias').set('Authorization', `Bearer ${admin}`);
    assert.equal(lista.body.items[0].roteiroId, BIKE);
    assert.equal(lista.body.items[0].autor, 'Turista Teste');

    const roteiros = await request(app).get('/admin/roteiros').set('Authorization', `Bearer ${admin}`);
    const bike = roteiros.body.items.find((item: { id: string }) => item.id === BIKE);
    assert.equal(bike.denuncias, 1);

    const destaque = await request(app)
      .patch(`/admin/roteiros/${BIKE}/destaque`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ destaque: false });
    assert.equal(destaque.body.destaque, false);

    const saque = await request(app)
      .post('/guia/saques')
      .set('Authorization', `Bearer ${guiaToken}`)
      .send({ valor: 50, metodo: 'PIX' });
    assert.equal(saque.status, 201);
    const avancado = await request(app)
      .patch(`/admin/saques/${saque.body.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'PROCESSANDO' });
    assert.equal(avancado.body.status, 'PROCESSANDO');
    assert.equal(avancado.body.guia.id, guia.body.id);
    const volta = await request(app)
      .patch(`/admin/saques/${saque.body.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'PENDENTE' });
    assert.equal(volta.status, 409);

    const cupons = await request(app).get('/admin/cupons').set('Authorization', `Bearer ${admin}`);
    assert.equal(cupons.body.items[0].codigo, 'BEMVINDO10');
  });
});
