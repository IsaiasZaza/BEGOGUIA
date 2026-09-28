# GoGuia — Rotas novas

Contrato de agenda, cupom, perfil do guia, avisos e administração. A autenticação não muda.

**Base:** `http://localhost:3001`  
**Header:** `Authorization: Bearer <jwt>`  
**CORS:** `http://localhost:8080`

`401` limpa a sessão no frontend. `403` é papel errado e não encerra a sessão.

Erro:

```json
{ "message": "...", "code": "OPCIONAL", "errors": { "campo": "..." } }
```

Dinheiro em reais (`number`). Data `YYYY-MM-DD`. Horário `HH:mm`. Instant ISO-8601.

Papéis: `TURISTA`, `GUIA`, `ADMIN`. Rotas `/admin/*` exigem `ADMIN`. Rotas `/guia/*` exigem `GUIA`. Rotas `/turista/*` exigem `TURISTA`.

Usuários de teste (senha `Senha@123`):

| E-mail | Papel |
|--------|--------|
| `turista@goguia.test` | TURISTA |
| `guia@goguia.test` | GUIA `APROVADO` (Pedro Marcos França, dono do Bike Tour) |
| `admin@goguia.test` | ADMIN |

Guia que se cadastra agora nasce com `statusAprovacao = PENDENTE`. O seed `guia@` permanece aprovado.

## 1. Agenda e vagas

O guia define em quais dias e horários o roteiro acontece. O turista só reserva um horário com vaga. `capacidade` do roteiro é o teto de pessoas naquele horário.

`diasSemana`: `0` domingo … `6` sábado.

### `GET /guia/roteiros/:id/agenda`

Auth `GUIA`, dono do roteiro. `404` se o roteiro não for dele.

`200`:

```json
{
  "diasSemana": [1, 2, 3, 4, 5],
  "horarios": ["09:00", "14:00"],
  "datasBloqueadas": ["2026-12-25"]
}
```

Roteiro sem agenda salva devolve o padrão: dias `1` a `5`, horário `["09:00"]`, `datasBloqueadas` vazio.

### `PUT /guia/roteiros/:id/agenda`

Auth `GUIA` dono. Body no mesmo formato. `200` devolve a agenda salva.

`400` se `horarios` não estiver em `HH:mm`, se `diasSemana` tiver número fora de 0–6, ou se a lista de horários vier vazia.

### `GET /roteiros/:id/disponibilidade?data=YYYY-MM-DD`

Público. `200`:

```json
{
  "data": "2026-12-17",
  "horarios": [
    { "horario": "09:00", "vagas": 8 }
  ]
}
```

- Dia da semana fora de `diasSemana`, data em `datasBloqueadas` ou data passada: `horarios: []`.
- `vagas` = `capacidade` menos a soma de `quantidade` das reservas daquele roteiro, data e horário com status `PENDENTE` ou `CONFIRMADA`.
- Horário com `vagas` 0 sai da lista.
- `404` se o roteiro não existe ou está inativo.

`17/12/2026` é quinta. No Bike Tour sem agenda salva, a disponibilidade desse dia é `09:00` com 10 vagas.

### `POST /reservas`

O body passa a ser validado de verdade: `data`, `horario`, `quantidade`.

`409`:

| code | Quando |
|------|--------|
| `DATA_INDISPONIVEL` | dia bloqueado, fora da semana ou data passada |
| `HORARIO_ESGOTADO` | horário inexistente na agenda ou `quantidade` maior que as vagas |
| `ROTEIRO_INATIVO` | roteiro inativo |

`quantidade` continua entre 1 e a capacidade (`400` se passar da capacidade). O frontend mostra a `message`.

## 2. Cupom e cashback

`GET /turista/carteira` devolve `cashback` (saldo real), `creditosPromocionais` e `vouchers`. Os dois últimos continuam `0`. O frontend só gasta `cashback`.

Quando uma reserva do turista vai para `CONCLUIDA`, soma `5%` do `total` pago (já com desconto) em `cashback`. Não soma de novo se a reserva já estava concluída. As reservas seed que já nascem `CONCLUIDA` não creditam cashback.

### `POST /admin/cupons`

Auth `ADMIN`. `201`:

```json
{
  "id": "uuid",
  "codigo": "BEMVINDO10",
  "tipo": "PERCENTUAL",
  "valor": 10,
  "ativo": true,
  "expiraEm": null
}
```

Body: `codigo` (único, sem espaço; o backend grava em maiúsculas), `tipo` `PERCENTUAL` ou `VALOR`, `valor` > 0. Percentual máximo 100. `expiraEm` opcional (`YYYY-MM-DD`). `409` se o código já existe.

Seed: cupom `BEMVINDO10`, percentual `10`, ativo, sem expiração.

### `GET /admin/cupons`

Auth `ADMIN`. `200` `{ "items": [ ... ] }`, mais recente primeiro.

### `POST /reservas/:id/cupom`

Auth `TURISTA` dono da reserva. Só com a reserva em `AGUARDANDO_PAGAMENTO`.

```json
{ "codigo": "BEMVINDO10" }
```

`200`:

```json
{
  "codigo": "BEMVINDO10",
  "tipo": "PERCENTUAL",
  "valor": 10,
  "desconto": 36,
  "total": 324
}
```

`desconto` é o valor em reais tirado do total base da reserva (`precoUnitario * quantidade + extras`). `total` é o que resta. Aplicar de novo o mesmo cupom recalcula a partir da base, sem empilhar. Percentual arredonda para 2 casas. Valor fixo não deixa o total negativo (desconto máximo = total).

`400` `CUPOM_INVALIDO` se o código não existe, está inativo ou expirou. `409` se a reserva não está aguardando pagamento.

### `POST /reservas/:id/pagamento`

O body ganha campos opcionais. O PIX simulado e o `501` do cartão continuam iguais.

```json
{
  "metodo": "PIX",
  "codigoCupom": "BEMVINDO10",
  "usarCashback": true
}
```

Ordem do desconto: primeiro o cupom, depois o cashback, limitado ao que ainda resta. O cashback usado sai da carteira na hora. Se o pagamento expirar ou a reserva for recusada ou cancelada com estorno, o cashback volta.

`200` acrescenta, além do PIX atual:

```json
{
  "desconto": 36,
  "cashbackAplicado": 20,
  "total": 304
}
```

O `GET /reservas/:id/pagamento` devolve os mesmos três campos. `codigoCupom` inválido responde `400` `CUPOM_INVALIDO` e não cria o pagamento.

Exemplo: Bike Tour, 2 pessoas a R$ 180, cupom 10% e R$ 20 de cashback → desconto 36, cashback 20, total 304.

## 3. Perfil público do guia

### `GET /guias/:id`

Público. `404` se não for guia, não existir, a conta estiver encerrada, ou `statusAprovacao` diferente de `APROVADO`.

`200`:

```json
{
  "id": "uuid",
  "nomeCompleto": "Pedro Marcos França",
  "fotoUrl": null,
  "bio": "Guia de Brasília.",
  "idiomas": ["português"],
  "cidade": "Brasília",
  "estado": "DF",
  "notaMedia": 5,
  "totalAvaliacoes": 2,
  "aprovado": true,
  "roteiros": []
}
```

`roteiros` usa o mesmo item de `GET /roteiros` e só inclui `ativo = true`. `notaMedia` e `totalAvaliacoes` agregam as avaliações dos roteiros desse guia. Sem avaliação: nota `0`, total `0`.

O frontend abre essa página em `/guias/:id` a partir do nome do guia no detalhe do roteiro. O id sai do login (`user.id`) ou do objeto `guia` do roteiro.

### `GET /guia/perfil`

Auth `GUIA`. O mesmo objeto, mais `email`. Inclui o guia ainda pendente (`aprovado: false`). `roteiros` inclui os dele, ativos e inativos, e cada item traz `ativo`.

### `PUT /guia/perfil`

Auth `GUIA`. Não altera nome, e-mail, tipo nem senha.

```json
{
  "bio": "Guia de Brasília.",
  "idiomas": ["português", "inglês"],
  "cidade": "Brasília",
  "estado": "DF"
}
```

`200` no formato do GET. `bio` até 500 caracteres. `idiomas` é `string[]`. Campos omitidos ficam como estão.

### `POST /guia/perfil/foto`

Auth `GUIA`. `multipart/form-data`, campo `foto` (jpg, png ou webp, até 5MB). `200` devolve o perfil com `fotoUrl` preenchida.

### `POST /guia/roteiros`

Se `statusAprovacao` não for `APROVADO`, responde `403` com `code` `GUIA_NAO_APROVADO`. O frontend esconde o botão de criar roteiro nesse caso.

## 4. Avisos

Sem websocket. O frontend consulta a cada 15 segundos. Só cria aviso para o usuário que precisa saber. Não avisa o autor da própria ação.

### `GET /notificacoes`

Auth de qualquer papel. `200`, mais recente primeiro:

```json
{
  "items": [
    {
      "id": "uuid",
      "tipo": "RESERVA_CONFIRMADA",
      "titulo": "Reserva confirmada",
      "texto": "Bike Tour do Eixo Monumental foi confirmado.",
      "lida": false,
      "criadoEm": "2026-09-28T14:30:00.000Z",
      "href": "/carteira"
    }
  ]
}
```

`tipo`: `PAGAMENTO_PAGO` | `RESERVA_CONFIRMADA` | `RESERVA_RECUSADA` | `RESERVA_CANCELADA` | `MENSAGEM`.

`href` é um caminho do frontend, ou `null`.

| Evento | Quem recebe | tipo | href |
|--------|-------------|------|------|
| Pagamento fica `PAGO` | turista da reserva | `PAGAMENTO_PAGO` | `/carteira` |
| Reserva vai para `PENDENTE` (pago) | guia do roteiro | `PAGAMENTO_PAGO` | `/gestao-agendamentos` |
| Guia aceita | turista | `RESERVA_CONFIRMADA` | `/carteira` |
| Guia recusa | turista | `RESERVA_RECUSADA` | `/carteira` |
| Reserva cancelada | o outro participante | `RESERVA_CANCELADA` | `/carteira` ou `/gestao-agendamentos` |
| Mensagem nova | o outro participante da conversa | `MENSAGEM` | `/chat?id=<conversaId>` |

O aviso do guia quando o pagamento confirma usa o título "Nova reserva". O do turista usa "Pagamento confirmado".

PIX que expira avisa os dois (não há autor). Encerrar a conta cancela as reservas futuras e avisa só o guia, em `/gestao-agendamentos`.

### `PATCH /notificacoes/:id/lida`

Auth dono do aviso. `204`. `404` se o aviso for de outra pessoa.

## 5. Administração

### `GET /admin/guias?status=PENDENTE`

Auth `ADMIN`. `status` opcional: `PENDENTE`, `APROVADO` ou `RECUSADO`. Sem query, devolve todos.

`200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "nomeCompleto": "Novo Guia",
      "email": "novo@goguia.test",
      "fotoUrl": null,
      "cidade": "",
      "criadoEm": "2026-09-28T14:30:00.000Z",
      "statusAprovacao": "PENDENTE"
    }
  ]
}
```

O painel chama com `status=PENDENTE`.

### `POST /admin/guias/:id/aprovar`

`200` `{ "id": "uuid", "statusAprovacao": "APROVADO" }`. `404` se não for guia.

### `POST /admin/guias/:id/recusar`

`200` `{ "id": "uuid", "statusAprovacao": "RECUSADO" }`. Roteiros desse guia ficam `ativo = false`.

### `GET /admin/roteiros`

`200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "titulo": "Bike Tour do Eixo Monumental - Brasília",
      "ativo": true,
      "destaque": true,
      "denuncias": 0,
      "guia": { "id": "uuid", "nomeCompleto": "Pedro Marcos França" }
    }
  ]
}
```

Inclui inativos. `denuncias` é a contagem.

### `PATCH /admin/roteiros/:id/destaque`

`{ "destaque": true }` → `200` `{ "id", "destaque" }`. É o mesmo `destaque` de `GET /roteiros?destaque=true`.

### `PATCH /admin/roteiros/:id/ativo`

`{ "ativo": false }` → `200` `{ "id", "ativo" }`. Inativo some do catálogo público.

### `POST /roteiros/:id/denuncias`

Auth `TURISTA` ou `GUIA`.

```json
{ "motivo": "Descrição não corresponde ao passeio" }
```

`201` `{ "id": "uuid" }`. `motivo` de 5 a 500 caracteres, com trim. `404` se o roteiro não existe. Roteiro inativo pode ser denunciado.

### `GET /admin/denuncias`

`200`, mais recente primeiro:

```json
{
  "items": [
    {
      "id": "uuid",
      "roteiroId": "uuid",
      "roteiro": "Bike Tour do Eixo Monumental - Brasília",
      "motivo": "...",
      "autor": "Turista Teste",
      "criadoEm": "2026-09-28T14:30:00.000Z"
    }
  ]
}
```

### `GET /admin/saques`

`200` `{ "items": [ ... ] }`, mais recente primeiro. Cada item é o saque do guia mais o guia:

```json
{
  "id": "uuid",
  "valor": 100,
  "metodo": "PIX",
  "status": "PENDENTE",
  "criadoEm": "2026-09-28T14:30:00.000Z",
  "guia": { "id": "uuid", "nomeCompleto": "Pedro Marcos França" }
}
```

### `PATCH /admin/saques/:id`

`{ "status": "PROCESSANDO" }` ou `{ "status": "CONCLUIDO" }`. `200` devolve o saque no mesmo formato do item acima.

Só avança: `PENDENTE` → `PROCESSANDO` → `CONCLUIDO`. `409` `STATUS_INVALIDO` se o status pedido for um retrocesso ou um pulo. `400` se o status não for um desses três. `CONCLUIDO` não desconta de novo: o saque já sai de `saldoDisponivel` quando o guia solicita, nos status `PENDENTE`, `PROCESSANDO` e `CONCLUIDO`.

## O que o frontend já chama

| Tela | Rotas |
|------|--------|
| Reserva do turista | `GET /roteiros/:id/disponibilidade`, `POST /reservas` com horário e quantidade |
| Agenda em Meus roteiros | `GET` e `PUT /guia/roteiros/:id/agenda` |
| Pagamento | `POST /reservas/:id/cupom`, `POST /reservas/:id/pagamento` com `codigoCupom` e `usarCashback` |
| Nome do guia no detalhe | `GET /guias/:id` |
| Configurações do guia | `GET` e `PUT /guia/perfil`, `POST /guia/perfil/foto` |
| Sino do header | `GET /notificacoes`, `PATCH /notificacoes/:id/lida` |
| Denunciar no detalhe | `POST /roteiros/:id/denuncias` |
| `/admin` | guias, roteiros, saques, denúncias e cupons |

Enquanto `GET /roteiros/:id/disponibilidade` responder `404`, a tela de reserva deixa o turista informar horário e quantidade à mão. Com a rota no ar, ela lista só os horários com vaga.

Coleção Postman: [`postman/GoGuia-Dominio.postman_collection.json`](postman/GoGuia-Dominio.postman_collection.json), pasta "Agenda, cupom, perfil, avisos e admin".
