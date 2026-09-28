import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import request from 'supertest';
import { app } from '../src/app';
import { addDays, diaDaSemanaDaData, hojeSaoPaulo, semanaAtualSaoPaulo } from '../src/lib/calendar';
import { prisma } from '../src/lib/prisma';
import { seedTestUsers } from '../src/lib/seed';
import { clearAllData } from './db';

if (!process.env.DATABASE_URL?.includes('test.db')) {
  throw new Error('Recusando testes fora do banco de teste. Não rode a suíte no Postgres da Neon.');
}

const BIKE = 'a1000000-0000-4000-8000-000000000001';
const RIO = 'a1000000-0000-4000-8000-000000000002';
const CONFIRMADA = 'b1000000-0000-4000-8000-000000000002';
const PENDENTE = 'b1000000-0000-4000-8000-000000000003';

async function login(email: string, senha = 'Senha@123') {
  const response = await request(app).post('/auth/login').send({ email, senha });
  assert.equal(response.status, 200);
  return response.body.token as string;
}

function diaUtil(data: string) {
  const dia = diaDaSemanaDaData(data);
  return dia >= 1 && dia <= 5;
}

function horaSaoPaulo() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

function dataNaSemana() {
  const hoje = hojeSaoPaulo();
  const hora = horaSaoPaulo();
  const { fim } = semanaAtualSaoPaulo();
  const aindaDaParaHoje = (data: string) => data > hoje || (data === hoje && hora < '09:00');
  for (let data = hoje; data <= fim; data = addDays(data, 1)) {
    if (diaUtil(data) && aindaDaParaHoje(data)) return { data, horario: '09:00' };
  }
  for (let i = 1; i <= 8; i += 1) {
    const data = addDays(hoje, i);
    if (diaUtil(data)) return { data, horario: '09:00' };
  }
  return { data: addDays(hoje, 1), horario: '09:00' };
}

describe('domínio', () => {
  before(async () => {
    await clearAllData();
    await seedTestUsers();
  });

  it('lista o catálogo público com busca, categoria e destaque', async () => {
    const lista = await request(app).get('/roteiros');
    assert.equal(lista.status, 200);
    assert.equal(lista.body.items.length, 6);
    assert.equal(lista.body.items[0].titulo, 'Bike Tour do Eixo Monumental - Brasília');
    assert.equal(lista.body.items[0].guia.nomeCompleto, 'Pedro Marcos França');
    assert.equal(lista.body.items[0].notaMedia, 5);
    assert.equal(lista.body.items[1].destaque, undefined);

    const destaque = await request(app).get('/roteiros').query({ destaque: 'true' });
    assert.equal(destaque.body.items.length, 2);

    const rural = await request(app).get('/roteiros').query({ categoria: 'rural' });
    assert.equal(rural.body.items.length, 2);

    const busca = await request(app).get('/roteiros').query({ q: 'angra' });
    assert.equal(busca.body.items.length, 1);
    assert.match(busca.body.items[0].titulo, /Angra/);

    const detalhe = await request(app).get(`/roteiros/${BIKE}`);
    assert.equal(detalhe.status, 200);
    assert.equal(detalhe.body.preco, 180);
    assert.equal(detalhe.body.paradas.length, 3);
    assert.equal(detalhe.body.totalAvaliacoes, 2);

    const avaliacoes = await request(app).get(`/roteiros/${BIKE}/avaliacoes`);
    assert.equal(avaliacoes.status, 200);
    assert.equal(avaliacoes.body.total, 2);
    assert.equal(avaliacoes.body.comentarios[0].autor, 'Marina Alves');
    assert.deepEqual(
      avaliacoes.body.distribuicao.map((item: { label: string }) => item.label),
      ['Excelente', 'Muito bom', 'Razoável', 'Ruim', 'Horrível'],
    );
    assert.equal(avaliacoes.body.distribuicao[0].quantidade, 2);

    const vazio = await request(app).get(`/roteiros/${RIO}/avaliacoes`);
    assert.equal(vazio.body.notaMedia, 0);
    assert.equal(vazio.body.total, 0);
    assert.equal(vazio.body.comentarios.length, 0);
  });

  it('esconde roteiro inativo do público e mantém o dono', async () => {
    const guia = await login('guia@goguia.test');
    const off = await request(app)
      .patch(`/guia/roteiros/${BIKE}/ativo`)
      .set('Authorization', `Bearer ${guia}`)
      .send({ ativo: false });
    assert.equal(off.status, 200);
    assert.equal(off.body.ativo, false);

    const publico = await request(app).get(`/roteiros/${BIKE}`);
    assert.equal(publico.status, 404);

    const dono = await request(app).get(`/guia/roteiros/${BIKE}`).set('Authorization', `Bearer ${guia}`);
    assert.equal(dono.status, 200);
    assert.equal(dono.body.ativo, false);

    const on = await request(app)
      .patch(`/guia/roteiros/${BIKE}/ativo`)
      .set('Authorization', `Bearer ${guia}`)
      .send({ ativo: true });
    assert.equal(on.status, 200);
  });

  it('gerencia favoritos só para turista', async () => {
    const turista = await login('turista@goguia.test');
    const guia = await login('guia@goguia.test');

    const criado = await request(app)
      .post('/turista/favoritos')
      .set('Authorization', `Bearer ${turista}`)
      .send({ roteiroId: RIO });
    assert.equal(criado.status, 201);
    assert.equal(criado.body.roteiroId, RIO);

    const repetido = await request(app)
      .post('/turista/favoritos')
      .set('Authorization', `Bearer ${turista}`)
      .send({ roteiroId: RIO });
    assert.equal(repetido.status, 409);

    const lista = await request(app).get('/turista/favoritos').set('Authorization', `Bearer ${turista}`);
    assert.equal(lista.body.items.length, 1);

    const negado = await request(app).get('/turista/favoritos').set('Authorization', `Bearer ${guia}`);
    assert.equal(negado.status, 403);

    const removido = await request(app)
      .delete(`/turista/favoritos/${RIO}`)
      .set('Authorization', `Bearer ${turista}`);
    assert.equal(removido.status, 204);

    const deNovo = await request(app)
      .delete(`/turista/favoritos/${RIO}`)
      .set('Authorization', `Bearer ${turista}`);
    assert.equal(deNovo.status, 204);
  });

  it('atualiza perfil e senha sem derrubar a sessão', async () => {
    const token = await login('turista@goguia.test');
    const perfil = await request(app).get('/usuario/perfil').set('Authorization', `Bearer ${token}`);
    assert.equal(perfil.status, 200);
    assert.equal(perfil.body.email, 'turista@goguia.test');
    assert.equal(perfil.body.telefone, '');

    const conflito = await request(app)
      .put('/usuario/perfil')
      .set('Authorization', `Bearer ${token}`)
      .send({ nomeCompleto: 'Turista Teste', email: 'guia@goguia.test' });
    assert.equal(conflito.status, 409);

    const atualizado = await request(app).put('/usuario/perfil').set('Authorization', `Bearer ${token}`).send({
      nomeCompleto: 'Maria Silva',
      email: 'maria.perfil@goguia.test',
      telefone: '61999999999',
      endereco: 'SQN 100',
      cidade: 'Brasília',
      estado: 'DF',
      cep: '70000-000',
    });
    assert.equal(atualizado.status, 200);
    assert.equal(atualizado.body.cidade, 'Brasília');

    const usuario = await prisma.user.findUnique({ where: { email: 'maria.perfil@goguia.test' } });
    assert.equal(usuario?.emailConfirmado, false);

    const senhaErrada = await request(app)
      .put('/usuario/senha')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: 'Errada@123', novaSenha: 'NovaSenha@123' });
    assert.equal(senhaErrada.status, 400);
    assert.equal(senhaErrada.body.code, 'SENHA_ATUAL_INVALIDA');

    const ainda = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(ainda.status, 200);

    const senha = await request(app)
      .put('/usuario/senha')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: 'Senha@123', novaSenha: 'NovaSenha@123' });
    assert.equal(senha.status, 204);

    await request(app)
      .put('/usuario/perfil')
      .set('Authorization', `Bearer ${token}`)
      .send({ nomeCompleto: 'Turista Teste', email: 'turista@goguia.test' });
    await request(app)
      .put('/usuario/senha')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: 'NovaSenha@123', novaSenha: 'Senha@123' });
  });

  it('calcula carteira, saque e resumo a partir das reservas seed', async () => {
    const turista = await login('turista@goguia.test');
    const guia = await login('guia@goguia.test');
    const carteiraTurista = await request(app).get('/turista/carteira').set('Authorization', `Bearer ${turista}`);
    assert.equal(carteiraTurista.status, 200);
    assert.equal(carteiraTurista.body.pagamentosRealizados, 900);
    assert.equal(carteiraTurista.body.vouchers, 0);

    const carteira = await request(app).get('/guia/carteira').set('Authorization', `Bearer ${guia}`);
    assert.equal(carteira.body.saldoDisponivel, 324);
    assert.equal(carteira.body.saldoPendente, 324);
    assert.equal(carteira.body.acumulado, 360);
    assert.match(carteira.body.proximoPagamento, /^\d{4}-\d{2}-\d{2}$/);

    const alto = await request(app)
      .post('/guia/saques')
      .set('Authorization', `Bearer ${guia}`)
      .send({ valor: 500, metodo: 'PIX' });
    assert.equal(alto.status, 400);
    assert.equal(alto.body.code, 'SALDO_INSUFICIENTE');

    const saque = await request(app)
      .post('/guia/saques')
      .set('Authorization', `Bearer ${guia}`)
      .send({ valor: 100, metodo: 'PIX' });
    assert.equal(saque.status, 201);
    assert.equal(saque.body.status, 'PENDENTE');

    const lista = await request(app).get('/guia/saques').set('Authorization', `Bearer ${guia}`);
    assert.equal(lista.body.items[0].valor, 100);

    const depois = await request(app).get('/guia/carteira').set('Authorization', `Bearer ${guia}`);
    assert.equal(depois.body.saldoDisponivel, 224);
  });

  it('reserva, simula PIX, aceita, recusa e conversa', async () => {
    const turista = await login('turista@goguia.test');
    const guia = await login('guia@goguia.test');
    const quando = dataNaSemana();

    const passada = await request(app)
      .post('/reservas')
      .set('Authorization', `Bearer ${turista}`)
      .send({ roteiroId: BIKE, data: '2020-01-01', horario: '12:30', quantidade: 1 });
    assert.equal(passada.status, 409);
    assert.equal(passada.body.code, 'DATA_INDISPONIVEL');

    const criada = await request(app).post('/reservas').set('Authorization', `Bearer ${turista}`).send({
      roteiroId: BIKE,
      data: quando.data,
      horario: quando.horario,
      quantidade: 5,
    });
    assert.equal(criada.status, 201);
    assert.equal(criada.body.status, 'AGUARDANDO_PAGAMENTO');
    assert.equal(criada.body.total, 900);
    assert.equal(criada.body.extras, 0);

    const cartao = await request(app)
      .post(`/reservas/${criada.body.id}/pagamento`)
      .set('Authorization', `Bearer ${turista}`)
      .send({ metodo: 'CARTAO' });
    assert.equal(cartao.status, 501);
    assert.equal(cartao.body.code, 'CARTAO_INDISPONIVEL');

    process.env.PIX_SIMULADO_PAGO_EM_SEGUNDOS = '99999';
    const pix = await request(app)
      .post(`/reservas/${criada.body.id}/pagamento`)
      .set('Authorization', `Bearer ${turista}`)
      .send({ metodo: 'PIX' });
    assert.equal(pix.status, 200);
    assert.equal(pix.body.status, 'PENDENTE');
    assert.match(pix.body.qrCode, /^data:image\/png;base64,/);
    assert.match(pix.body.copiaECola, /^00020126/);

    process.env.PIX_SIMULADO_PAGO_EM_SEGUNDOS = '0';
    const pago = await request(app)
      .get(`/reservas/${criada.body.id}/pagamento`)
      .set('Authorization', `Bearer ${turista}`);
    assert.equal(pago.body.status, 'PAGO');

    const detalhe = await request(app).get(`/reservas/${criada.body.id}`).set('Authorization', `Bearer ${turista}`);
    assert.equal(detalhe.body.status, 'PENDENTE');
    assert.ok(detalhe.body.roteiro.incluso.length > 0);

    const alheio = await request(app).get(`/reservas/${criada.body.id}`).set('Authorization', `Bearer ${await login('carlos.lima@goguia.test')}`);
    assert.equal(alheio.status, 403);

    const aceita = await request(app)
      .post(`/guia/reservas/${criada.body.id}/aceitar`)
      .set('Authorization', `Bearer ${guia}`);
    assert.equal(aceita.status, 200);
    assert.equal(aceita.body.status, 'CONFIRMADA');

    const recusa = await request(app)
      .post(`/guia/reservas/${PENDENTE}/recusar`)
      .set('Authorization', `Bearer ${guia}`);
    assert.equal(recusa.status, 200);
    assert.equal(recusa.body.status, 'RECUSADA');
    const estorno = await prisma.pagamento.findUnique({ where: { reservaId: PENDENTE } });
    assert.equal(estorno?.estornado, true);

    const proximas = await request(app).get('/guia/reservas').set('Authorization', `Bearer ${guia}`);
    assert.ok(proximas.body.items.some((item: { id: string }) => item.id === criada.body.id));
    assert.equal(proximas.body.items.some((item: { id: string }) => item.id === PENDENTE), false);

    const resumo = await request(app).get('/guia/resumo-semana').set('Authorization', `Bearer ${guia}`);
    const semana = semanaAtualSaoPaulo();
    if (quando.data >= semana.inicio && quando.data <= semana.fim) {
      assert.ok(resumo.body.totalReservas >= 1);
      assert.ok(resumo.body.faturamentoPrevisto >= 900);
    }

    const minhas = await request(app)
      .get('/turista/reservas')
      .query({ status: 'CONFIRMADA' })
      .set('Authorization', `Bearer ${turista}`);
    assert.ok(minhas.body.items.some((item: { id: string; roteiro: string }) => item.id === CONFIRMADA || item.roteiro.length > 0));

    const aberta = await request(app)
      .post('/conversas')
      .set('Authorization', `Bearer ${turista}`)
      .send({ reservaId: CONFIRMADA });
    assert.equal(aberta.status, 201);
    assert.equal(aberta.body.outroUsuario.online, false);
    assert.equal(aberta.body.ultimaMensagem, null);

    const deNovo = await request(app)
      .post('/conversas')
      .set('Authorization', `Bearer ${turista}`)
      .send({ reservaId: CONFIRMADA });
    assert.equal(deNovo.status, 200);

    const mensagem = await request(app)
      .post(`/conversas/${aberta.body.id}/mensagens`)
      .set('Authorization', `Bearer ${turista}`)
      .send({ texto: '  Te espero na Torre de TV  ' });
    assert.equal(mensagem.status, 201);
    assert.equal(mensagem.body.texto, 'Te espero na Torre de TV');
    assert.equal(mensagem.body.minha, true);

    const guiaVe = await request(app)
      .get(`/conversas/${aberta.body.id}/mensagens`)
      .set('Authorization', `Bearer ${guia}`);
    assert.equal(guiaVe.body.items[0].minha, false);

    const lista = await request(app).get('/conversas').set('Authorization', `Bearer ${guia}`);
    assert.equal(lista.body.items[0].ultimaMensagem.texto, 'Te espero na Torre de TV');
    assert.equal(lista.body.items[0].ultimaMensagem.minha, false);

    const fora = await login('carlos.lima@goguia.test');
    const bloqueada = await request(app).get(`/conversas/${aberta.body.id}/mensagens`).set('Authorization', `Bearer ${fora}`);
    assert.equal(bloqueada.status, 404);

    const guiaCria = await request(app)
      .post('/guia/roteiros')
      .set('Authorization', `Bearer ${guia}`)
      .send({
        titulo: 'Catedral da Fé',
        descricao: 'Visita guiada.',
        duracao: '1h',
        capacidade: 5,
        preco: 300,
        categoria: 'cultural',
        local: 'Brasília / DF',
        incluso: ['Guia credenciado'],
        paradas: [{ nome: 'Catedral', lat: -15.7984, lng: -47.8756 }],
      });
    assert.equal(guiaCria.status, 201);
    assert.equal(guiaCria.body.ativo, true);
    assert.equal(guiaCria.body.guia.nomeCompleto, 'Pedro Marcos França');
  });

  it('expira o PIX e encerra a conta', async () => {
    const turista = await login('turista@goguia.test');
    const quando = dataNaSemana();
    const criada = await request(app).post('/reservas').set('Authorization', `Bearer ${turista}`).send({
      roteiroId: RIO,
      data: quando.data,
      horario: '09:00',
      quantidade: 1,
    });
    assert.equal(criada.status, 201);

    process.env.PIX_SIMULADO_PAGO_EM_SEGUNDOS = '99999';
    const pix = await request(app)
      .post(`/reservas/${criada.body.id}/pagamento`)
      .set('Authorization', `Bearer ${turista}`)
      .send({ metodo: 'PIX' });
    assert.equal(pix.status, 200);

    await prisma.pagamento.update({
      where: { reservaId: criada.body.id },
      data: { expiraEm: new Date(Date.now() - 1000) },
    });

    const expirado = await request(app)
      .get(`/reservas/${criada.body.id}/pagamento`)
      .set('Authorization', `Bearer ${turista}`);
    assert.equal(expirado.body.status, 'EXPIRADO');

    const reserva = await prisma.reserva.findUnique({ where: { id: criada.body.id } });
    assert.equal(reserva?.status, 'CANCELADA');

    const encerrada = await request(app).delete('/usuario/conta').set('Authorization', `Bearer ${turista}`);
    assert.equal(encerrada.status, 204);

    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${turista}`);
    assert.equal(me.status, 401);

    const loginDepois = await request(app)
      .post('/auth/login')
      .send({ email: 'turista@goguia.test', senha: 'Senha@123' });
    assert.equal(loginDepois.status, 401);
  });
});
