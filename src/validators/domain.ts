import { z } from 'zod';
import { isDataValida, isHorarioValido } from '../lib/calendar';
import { AppError } from '../lib/errors';
import { parseParadas, parseStringList } from '../lib/lists';
import { senhaSchema } from './auth';

const categoriaSchema = z.enum(['lazer', 'cultural', 'rural'], {
  errorMap: () => ({ message: 'Categoria deve ser lazer, cultural ou rural' }),
});

const RESERVA_STATUS = [
  'AGUARDANDO_PAGAMENTO',
  'PENDENTE',
  'CONFIRMADA',
  'RECUSADA',
  'CONCLUIDA',
  'CANCELADA',
] as const;

function asRecord(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  return { ...(body as Record<string, unknown>) };
}

function zodError(error: z.ZodError, fallbackField = 'form'): never {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? fallbackField);
    if (!errors[key]) errors[key] = issue.message;
  }
  throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', errors);
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  zodError(result.error);
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return Number(value.trim());
  return value;
}

function optionalText(value: unknown) {
  if (typeof value !== 'string') return value;
  return value.trim();
}

const roteiroBase = {
  titulo: z.string().trim().min(2, 'Título deve ter entre 2 e 160 caracteres').max(160, 'Título deve ter entre 2 e 160 caracteres'),
  descricao: z.string().trim().min(1, 'Descrição é obrigatória').max(5000, 'Descrição muito longa'),
  duracao: z.string().trim().min(1, 'Duração é obrigatória').max(40, 'Duração inválida'),
  capacidade: z.number({ invalid_type_error: 'Capacidade inválida' }).int('Capacidade deve ser um número inteiro').min(1, 'Capacidade mínima é 1'),
  preco: z.number({ invalid_type_error: 'Preço inválido' }).positive('Preço deve ser maior que zero'),
  categoria: categoriaSchema,
  local: z.string().trim().min(1, 'Local é obrigatório').max(120, 'Local muito longo'),
  distancia: z.string().trim().max(40, 'Distância inválida').optional(),
};

const criarRoteiroSchema = z.object(roteiroBase);

const atualizarRoteiroSchema = z.object({
  titulo: roteiroBase.titulo.optional(),
  descricao: roteiroBase.descricao.optional(),
  duracao: roteiroBase.duracao.optional(),
  capacidade: roteiroBase.capacidade.optional(),
  preco: roteiroBase.preco.optional(),
  categoria: categoriaSchema.optional(),
  local: roteiroBase.local.optional(),
  distancia: roteiroBase.distancia,
});

function normalizeRoteiro(body: unknown) {
  const record = asRecord(body);
  for (const key of ['capacidade', 'preco'] as const) {
    record[key] = optionalNumber(record[key]);
  }
  if (typeof record.distancia === 'string') record.distancia = optionalText(record.distancia);
  for (const key of ['titulo', 'descricao', 'duracao', 'local', 'categoria'] as const) {
    if (typeof record[key] === 'string') record[key] = record[key].trim();
  }
  return record;
}

export function parseCriarRoteiro(body: unknown) {
  const record = normalizeRoteiro(body);
  const data = parse(criarRoteiroSchema, record);
  return {
    ...data,
    distancia: data.distancia ?? '',
    incluso: parseStringList(record.incluso, 'incluso') ?? [],
    politicaCancelamento: parseStringList(record.politicaCancelamento, 'politicaCancelamento') ?? [],
    paradas: parseParadas(record.paradas) ?? [],
  };
}

export function parseAtualizarRoteiro(body: unknown) {
  const record = normalizeRoteiro(body);
  const data = parse(atualizarRoteiroSchema, record);
  return {
    ...data,
    incluso: parseStringList(record.incluso, 'incluso'),
    politicaCancelamento: parseStringList(record.politicaCancelamento, 'politicaCancelamento'),
    paradas: parseParadas(record.paradas),
  };
}

export function parseAtivo(body: unknown) {
  const record = asRecord(body);
  const ativo = record.ativo === 'true' || record.ativo === true ? true : record.ativo === 'false' || record.ativo === false ? false : record.ativo;
  return parse(
    z.object({
      ativo: z.boolean({ required_error: 'Informe se o roteiro está ativo', invalid_type_error: 'Informe se o roteiro está ativo' }),
    }),
    { ativo },
  );
}

export function parseCatalogoQuery(query: Record<string, unknown>) {
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  let categoria: 'lazer' | 'cultural' | 'rural' | undefined;
  if (typeof query.categoria === 'string' && query.categoria.trim()) {
    const parsed = categoriaSchema.safeParse(query.categoria.trim());
    if (!parsed.success) {
      throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', {
        categoria: 'Categoria deve ser lazer, cultural ou rural',
      });
    }
    categoria = parsed.data;
  }
  return { q, categoria, destaque: query.destaque === 'true' };
}

const reservaSchema = z.object({
  roteiroId: z.string().uuid('Roteiro inválido'),
  data: z.string().refine(isDataValida, 'Data inválida'),
  horario: z.string().refine(isHorarioValido, 'Horário inválido'),
  quantidade: z.number({ invalid_type_error: 'Quantidade inválida' }).int('Quantidade deve ser um número inteiro').min(1, 'Quantidade mínima é 1'),
});

export function parseCriarReserva(body: unknown) {
  return parse(reservaSchema, asRecord(body));
}

export function parseStatusReserva(value: unknown) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !RESERVA_STATUS.includes(value as (typeof RESERVA_STATUS)[number])) {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { status: 'Status inválido' });
  }
  return value as (typeof RESERVA_STATUS)[number];
}

export function parseQuando(value: unknown) {
  if (value === undefined || value === '' || value === 'proximas') return 'proximas' as const;
  if (value === 'historico') return 'historico' as const;
  throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { quando: 'Use proximas ou historico' });
}

export function parsePagamento(body: unknown) {
  const record = asRecord(body);
  const metodo = typeof record.metodo === 'string' ? record.metodo.trim().toUpperCase() : record.metodo;
  if (metodo !== 'PIX' && metodo !== 'CARTAO') {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { metodo: 'Método deve ser PIX ou CARTAO' });
  }

  let codigoCupom: string | undefined;
  if (typeof record.codigoCupom === 'string' && record.codigoCupom.trim()) {
    codigoCupom = record.codigoCupom.trim().toUpperCase();
    if (/\s/.test(codigoCupom)) throw new AppError(400, 'Cupom inválido', 'CUPOM_INVALIDO');
  }

  return {
    metodo: metodo as 'PIX' | 'CARTAO',
    codigoCupom,
    usarCashback: record.usarCashback === true || record.usarCashback === 'true',
  };
}

const perfilSchema = z.object({
  nomeCompleto: z.string().trim().min(2, 'Nome deve ter entre 2 e 120 caracteres').max(120, 'Nome deve ter entre 2 e 120 caracteres').optional(),
  email: z.string().trim().email('E-mail inválido').max(254, 'E-mail inválido').transform((value) => value.toLowerCase()).optional(),
  telefone: z.string().trim().max(20, 'Telefone inválido').optional(),
  endereco: z.string().trim().max(160, 'Endereço muito longo').optional(),
  cidade: z.string().trim().max(80, 'Cidade inválida').optional(),
  estado: z.string().trim().max(40, 'Estado inválido').optional(),
  cep: z.string().trim().max(16, 'CEP inválido').optional(),
});

export function parsePerfil(body: unknown) {
  const record = asRecord(body);
  if (typeof record.email === 'string') record.email = record.email.trim();
  if (typeof record.nomeCompleto === 'string') record.nomeCompleto = record.nomeCompleto.trim();
  return parse(perfilSchema, record);
}

export function parseTrocaSenha(body: unknown) {
  const record = asRecord(body);
  const senhaAtual = typeof record.senhaAtual === 'string' ? record.senhaAtual : '';
  if (!senhaAtual) {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { senhaAtual: 'Senha atual é obrigatória' });
  }
  const nova = senhaSchema.safeParse(record.novaSenha);
  if (!nova.success) {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', {
      novaSenha: nova.error.issues[0]?.message ?? 'Senha inválida',
    });
  }
  return { senhaAtual, novaSenha: nova.data };
}

export function parseFavorito(body: unknown) {
  return parse(z.object({ roteiroId: z.string().uuid('Roteiro inválido') }), asRecord(body));
}

export function parseConversa(body: unknown) {
  return parse(z.object({ reservaId: z.string().uuid('Reserva inválida') }), asRecord(body));
}

export function parseMensagem(body: unknown) {
  const record = asRecord(body);
  const texto = typeof record.texto === 'string' ? record.texto.trim() : '';
  if (texto.length < 1 || texto.length > 2000) {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', {
      texto: 'Mensagem deve ter entre 1 e 2000 caracteres',
    });
  }
  return { texto };
}

export function parseDepois(value: unknown) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { depois: 'Data inválida' });
  }
  return new Date(value);
}

export function parseSaque(body: unknown) {
  const record = asRecord(body);
  const valor = typeof record.valor === 'string' ? Number(record.valor) : record.valor;
  const metodo = typeof record.metodo === 'string' ? record.metodo.trim().toUpperCase() : record.metodo;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    throw new AppError(400, 'Informe um valor maior que zero', 'SALDO_INSUFICIENTE', { valor: 'Informe um valor maior que zero' });
  }
  if (metodo !== 'PIX' && metodo !== 'CONTA_BANCARIA') {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { metodo: 'Método deve ser PIX ou CONTA_BANCARIA' });
  }
  return { valor, metodo: metodo as 'PIX' | 'CONTA_BANCARIA' };
}

export function parseAgenda(body: unknown) {
  const record = asRecord(body);
  const dias = Array.isArray(record.diasSemana) ? record.diasSemana : null;
  const horarios = Array.isArray(record.horarios) ? record.horarios : null;
  const bloqueadas = Array.isArray(record.datasBloqueadas) ? record.datasBloqueadas : [];
  const errors: Record<string, string> = {};

  if (!dias || dias.some((dia) => typeof dia !== 'number' || !Number.isInteger(dia) || dia < 0 || dia > 6)) {
    errors.diasSemana = 'Dia da semana deve ser um número de 0 a 6';
  }
  if (!horarios || horarios.length === 0 || horarios.some((horario) => typeof horario !== 'string' || !isHorarioValido(horario))) {
    errors.horarios = 'Informe ao menos um horário no formato HH:mm';
  }
  if (bloqueadas.some((data) => typeof data !== 'string' || !isDataValida(data))) {
    errors.datasBloqueadas = 'Data bloqueada inválida';
  }
  if (Object.keys(errors).length > 0) {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', errors);
  }

  return {
    diasSemana: [...new Set(dias as number[])].sort((a, b) => a - b),
    horarios: [...new Set(horarios as string[])].sort(),
    datasBloqueadas: [...new Set(bloqueadas as string[])].sort(),
  };
}

export function parseDataConsulta(value: unknown) {
  if (typeof value !== 'string' || !isDataValida(value)) {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { data: 'Data inválida' });
  }
  return value;
}

export function parseCupomCodigo(body: unknown) {
  const codigo = asRecord(body).codigo;
  if (typeof codigo !== 'string' || !codigo.trim() || /\s/.test(codigo.trim())) {
    throw new AppError(400, 'Cupom inválido', 'CUPOM_INVALIDO');
  }
  return codigo.trim().toUpperCase();
}

export function parseCriarCupom(body: unknown) {
  const record = asRecord(body);
  const codigo = typeof record.codigo === 'string' ? record.codigo.trim().toUpperCase() : '';
  const tipo = typeof record.tipo === 'string' ? record.tipo.trim().toUpperCase() : '';
  const valor = typeof record.valor === 'string' ? Number(record.valor) : record.valor;
  const errors: Record<string, string> = {};

  if (!codigo || /\s/.test(codigo)) errors.codigo = 'Código inválido';
  if (tipo !== 'PERCENTUAL' && tipo !== 'VALOR') errors.tipo = 'Tipo deve ser PERCENTUAL ou VALOR';
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) errors.valor = 'Valor deve ser maior que zero';
  if (tipo === 'PERCENTUAL' && typeof valor === 'number' && valor > 100) errors.valor = 'Percentual máximo é 100';

  let expiraEm: string | null = null;
  if (record.expiraEm !== undefined && record.expiraEm !== null && record.expiraEm !== '') {
    if (typeof record.expiraEm !== 'string' || !isDataValida(record.expiraEm)) errors.expiraEm = 'Data inválida';
    else expiraEm = record.expiraEm;
  }

  if (Object.keys(errors).length > 0) throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', errors);
  return { codigo, tipo: tipo as 'PERCENTUAL' | 'VALOR', valor: valor as number, expiraEm };
}

export function parsePerfilGuia(body: unknown) {
  const record = asRecord(body);
  const data: { bio?: string; idiomas?: string[]; cidade?: string; estado?: string } = {};
  if (record.bio !== undefined) {
    if (typeof record.bio !== 'string' || record.bio.trim().length > 500) {
      throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { bio: 'Bio deve ter no máximo 500 caracteres' });
    }
    data.bio = record.bio.trim();
  }
  if (record.idiomas !== undefined) {
    if (!Array.isArray(record.idiomas) || record.idiomas.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { idiomas: 'Idiomas inválidos' });
    }
    data.idiomas = record.idiomas.map((item) => (item as string).trim());
  }
  if (record.cidade !== undefined) {
    if (typeof record.cidade !== 'string' || record.cidade.trim().length > 80) {
      throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { cidade: 'Cidade inválida' });
    }
    data.cidade = record.cidade.trim();
  }
  if (record.estado !== undefined) {
    if (typeof record.estado !== 'string' || record.estado.trim().length > 40) {
      throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { estado: 'Estado inválido' });
    }
    data.estado = record.estado.trim();
  }
  return data;
}

export function parseMotivoDenuncia(body: unknown) {
  const motivo = typeof asRecord(body).motivo === 'string' ? String(asRecord(body).motivo).trim() : '';
  if (motivo.length < 5 || motivo.length > 500) {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', {
      motivo: 'Motivo deve ter entre 5 e 500 caracteres',
    });
  }
  return motivo;
}

export function parseStatusAprovacao(value: unknown) {
  if (value === undefined || value === '') return undefined;
  if (value !== 'PENDENTE' && value !== 'APROVADO' && value !== 'RECUSADO') {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { status: 'Status inválido' });
  }
  return value;
}

export function parseStatusSaque(body: unknown) {
  const status = asRecord(body).status;
  if (status !== 'PENDENTE' && status !== 'PROCESSANDO' && status !== 'CONCLUIDO') {
    throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { status: 'Status inválido' });
  }
  return status;
}
