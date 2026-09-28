import { addDays, hojeSaoPaulo } from './calendar';
import { prisma } from './prisma';

const incluso = ['Guia credenciado', 'Material informativo digital'];
const politica = [
  'Cancelamentos com até 24h de antecedência: reembolso total',
  'Cancelamentos com menos de 24h: não há reembolso',
];

const roteiros = [
  {
    id: 'a1000000-0000-4000-8000-000000000001',
    guiaEmail: 'guia@goguia.test',
    titulo: 'Bike Tour do Eixo Monumental - Brasília',
    descricao:
      'Pedale pelo Eixo Monumental com paradas na Esplanada dos Ministérios, no Congresso Nacional e na Catedral de Brasília.',
    categoria: 'cultural',
    local: 'Brasília / DF',
    distancia: '15 Km',
    duracao: '3 h',
    preco: 180,
    capacidade: 10,
    destaque: true,
    pontoEncontro: 'Torre de TV, Eixo Monumental',
    imageUrl: 'https://images.unsplash.com/photo-1571068316344-75bc76f77890?auto=format&fit=crop&w=1200&q=80',
    paradas: [
      { nome: 'Partida', lat: -15.7975, lng: -47.8825 },
      { nome: 'Congresso Nacional', lat: -15.7997, lng: -47.8645 },
      { nome: 'Catedral de Brasília', lat: -15.7984, lng: -47.8756 },
    ],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000002',
    guiaEmail: 'carlos.lima@goguia.test',
    titulo: 'Um Dia no Rio - City Tour Completo',
    descricao: 'Um dia inteiro pelos cartões-postais do Rio: Cristo Redentor, Pão de Açúcar, centro histórico e orla.',
    categoria: 'lazer',
    local: 'Rio de Janeiro / RJ',
    distancia: '45 Km',
    duracao: '8 h',
    preco: 300,
    capacidade: 20,
    destaque: true,
    pontoEncontro: 'Praça Mauá, Centro',
    imageUrl: 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?auto=format&fit=crop&w=1200&q=80',
    paradas: [{ nome: 'Cristo Redentor', lat: -22.9519, lng: -43.2105 }],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000003',
    guiaEmail: 'mariana.reis@goguia.test',
    titulo: 'Excursão de Dia Inteiro a Angra dos Reis e Ilha Grande',
    descricao: 'Saída para Angra dos Reis com tempo de praia e travessia até Ilha Grande.',
    categoria: 'lazer',
    local: 'Angra dos Reis / RJ',
    distancia: '120 Km',
    duracao: '10 h',
    preco: 250,
    capacidade: 25,
    destaque: false,
    pontoEncontro: 'Marina de Angra dos Reis',
    imageUrl: 'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?auto=format&fit=crop&w=1200&q=80',
    paradas: [{ nome: 'Ilha Grande', lat: -23.1436, lng: -44.1703 }],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000004',
    guiaEmail: 'fernanda.souza@goguia.test',
    titulo: 'Passeio a Pé pela Avenida Paulista',
    descricao: 'Caminhada guiada pela Avenida Paulista, com MASP, centros culturais e a história da avenida.',
    categoria: 'cultural',
    local: 'São Paulo / SP',
    distancia: '4 Km',
    duracao: '2 h',
    preco: 90,
    capacidade: 15,
    destaque: false,
    pontoEncontro: 'MASP, Avenida Paulista',
    imageUrl: 'https://images.unsplash.com/photo-1544989164-31dc3c645987?auto=format&fit=crop&w=1200&q=80',
    paradas: [{ nome: 'MASP', lat: -23.5614, lng: -46.6558 }],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000005',
    guiaEmail: 'ricardo.silveira@goguia.test',
    titulo: 'Centro Hípico Lago Sul - Brasília',
    descricao: 'Aula e passeio a cavalo no Lago Sul, com equipamento e acompanhamento do guia.',
    categoria: 'rural',
    local: 'Brasília / DF',
    distancia: '8 Km',
    duracao: '2 h',
    preco: 150,
    capacidade: 8,
    destaque: false,
    pontoEncontro: 'Centro Hípico Lago Sul',
    imageUrl: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=1200&q=80',
    paradas: [{ nome: 'Lago Sul', lat: -15.84, lng: -47.87 }],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000006',
    guiaEmail: 'antonio.bezerra@goguia.test',
    titulo: 'Fazenda Azul',
    descricao: 'Visita à Fazenda Azul em Planaltina, com trilha, lavoura e almoço no campo.',
    categoria: 'rural',
    local: 'Planaltina / DF',
    distancia: '12 Km',
    duracao: '5 h',
    preco: 120,
    capacidade: 12,
    destaque: false,
    pontoEncontro: 'Entrada da Fazenda Azul',
    imageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
    paradas: [{ nome: 'Fazenda Azul', lat: -15.62, lng: -47.65 }],
  },
];

const qrCode =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export async function seedCatalog() {
  const usuarios = await prisma.user.findMany({
    where: { email: { in: roteiros.map((roteiro) => roteiro.guiaEmail).concat('turista@goguia.test') } },
  });
  const porEmail = new Map(usuarios.map((usuario) => [usuario.email, usuario]));

  for (const roteiro of roteiros) {
    const guia = porEmail.get(roteiro.guiaEmail);
    if (!guia) continue;
    await prisma.roteiro.upsert({
      where: { id: roteiro.id },
      update: {
        guiaId: guia.id,
        titulo: roteiro.titulo,
        descricao: roteiro.descricao,
        categoria: roteiro.categoria,
        local: roteiro.local,
        distancia: roteiro.distancia,
        duracao: roteiro.duracao,
        preco: roteiro.preco,
        capacidade: roteiro.capacidade,
        imageUrl: roteiro.imageUrl,
        ativo: true,
        destaque: roteiro.destaque,
        idioma: 'português',
        pontoEncontro: roteiro.pontoEncontro,
        incluso,
        politicaCancelamento: politica,
        paradas: roteiro.paradas,
      },
      create: {
        id: roteiro.id,
        guiaId: guia.id,
        titulo: roteiro.titulo,
        descricao: roteiro.descricao,
        categoria: roteiro.categoria,
        local: roteiro.local,
        distancia: roteiro.distancia,
        duracao: roteiro.duracao,
        preco: roteiro.preco,
        capacidade: roteiro.capacidade,
        imageUrl: roteiro.imageUrl,
        ativo: true,
        destaque: roteiro.destaque,
        idioma: 'português',
        pontoEncontro: roteiro.pontoEncontro,
        incluso,
        politicaCancelamento: politica,
        paradas: roteiro.paradas,
      },
    });
  }

  const avaliacoes = [
    {
      id: 'c1000000-0000-4000-8000-000000000001',
      autor: 'Anthony C',
      texto: 'Excursão fantástica.',
      nota: 5,
      criadoEm: new Date('2026-03-01T12:00:00.000Z'),
    },
    {
      id: 'c1000000-0000-4000-8000-000000000002',
      autor: 'Marina Alves',
      texto: 'Passeio bem organizado e o guia conhece cada parada.',
      nota: 5,
      criadoEm: new Date('2026-03-02T15:30:00.000Z'),
    },
  ];

  for (const avaliacao of avaliacoes) {
    await prisma.avaliacao.upsert({
      where: { id: avaliacao.id },
      update: { ...avaliacao, roteiroId: roteiros[0].id },
      create: { ...avaliacao, roteiroId: roteiros[0].id },
    });
  }

  const turista = porEmail.get('turista@goguia.test');
  if (!turista) return;

  const hoje = hojeSaoPaulo();
  const primeiroDia = `${hoje.slice(0, 8)}01`;
  const dataConcluida = primeiroDia < hoje ? primeiroDia : addDays(hoje, -20);
  const demos = [
    {
      id: 'b1000000-0000-4000-8000-000000000001',
      data: dataConcluida,
      horario: '09:00',
      quantidade: 2,
      status: 'CONCLUIDA',
    },
    {
      id: 'b1000000-0000-4000-8000-000000000002',
      data: addDays(hoje, 14),
      horario: '14:00',
      quantidade: 2,
      status: 'CONFIRMADA',
    },
    {
      id: 'b1000000-0000-4000-8000-000000000003',
      data: addDays(hoje, 21),
      horario: '16:30',
      quantidade: 1,
      status: 'PENDENTE',
    },
  ];

  for (const demo of demos) {
    const total = 180 * demo.quantidade;
    await prisma.reserva.upsert({
      where: { id: demo.id },
      update: {
        turistaId: turista.id,
        roteiroId: roteiros[0].id,
        data: demo.data,
        horario: demo.horario,
        quantidade: demo.quantidade,
        precoUnitario: 180,
        extras: 0,
        total,
        status: demo.status,
      },
      create: {
        id: demo.id,
        turistaId: turista.id,
        roteiroId: roteiros[0].id,
        data: demo.data,
        horario: demo.horario,
        quantidade: demo.quantidade,
        precoUnitario: 180,
        extras: 0,
        total,
        status: demo.status,
      },
    });

    await prisma.pagamento.upsert({
      where: { reservaId: demo.id },
      update: {
        metodo: 'PIX',
        status: 'PAGO',
        estornado: false,
        qrCode,
        copiaECola: `00020126GOGUIAPIXSIMULADO${demo.id.replace(/-/g, '')}6304FAKE`,
        expiraEm: new Date('2026-01-01T00:00:00.000Z'),
        pagoEm: new Date('2026-01-01T00:05:00.000Z'),
      },
      create: {
        reservaId: demo.id,
        metodo: 'PIX',
        status: 'PAGO',
        estornado: false,
        qrCode,
        copiaECola: `00020126GOGUIAPIXSIMULADO${demo.id.replace(/-/g, '')}6304FAKE`,
        expiraEm: new Date('2026-01-01T00:00:00.000Z'),
        pagoEm: new Date('2026-01-01T00:05:00.000Z'),
      },
    });
  }
}
