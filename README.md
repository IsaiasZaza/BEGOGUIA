# GoGuia API

API consumida pelo frontend Next.js. Auth e domínio (catálogo, reservas, guia, chat e carteira).

**Base URL (dev):** `http://localhost:3001`

No frontend:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Contrato: [`openapi.yaml`](openapi.yaml)  
Coleção: [`postman/GoGuia-Auth.postman_collection.json`](postman/GoGuia-Auth.postman_collection.json)

## Usuários de teste

Criados no boot local (`SEED_ON_BOOT` diferente de `false`). Reiniciar a API restaura a senha, os 6 roteiros e as 3 reservas de demonstração do turista.

| E-mail | Senha | Tipo | Nome |
|--------|-------|------|------|
| `turista@goguia.test` | `Senha@123` | TURISTA | Turista Teste |
| `guia@goguia.test` | `Senha@123` | GUIA | Pedro Marcos França |
| `carlos.lima@goguia.test` | `Senha@123` | GUIA | Carlos Alberto Lima |
| `mariana.reis@goguia.test` | `Senha@123` | GUIA | Mariana Costa Reis |
| `fernanda.souza@goguia.test` | `Senha@123` | GUIA | Fernanda Souza |
| `ricardo.silveira@goguia.test` | `Senha@123` | GUIA | Ricardo Silveira |
| `antonio.bezerra@goguia.test` | `Senha@123` | GUIA | Antônio Bezerra |

`guia@goguia.test` é o dono do Bike Tour. O turista já tem, nesse roteiro, uma reserva concluída, uma confirmada daqui a 14 dias e uma pendente daqui a 21 dias.

## Como rodar

Requer Node.js 20+.

```bash
npm install
npm run setup
npm run dev
```

`npm test` cobre auth e o domínio.

## Decisões das dúvidas abertas

1. **Cadastro entra direto.** `POST /auth/cadastro` responde `201` com `token`, `expiresIn` e `user`. O frontend pode gravar a sessão e ir para `/home`. `emailConfirmado` nasce `false`, mas o login não cobra confirmação.
2. **Foto no mesmo endpoint.** `multipart/form-data` com o campo `foto`. Sem foto, JSON também vale.
3. **`GUIA` já existe no cadastro.** `tipo` opcional: `TURISTA` (padrão) ou `GUIA`.
4. **Só access token.** JWT HS256 de 24h (`expiresIn: 86400`). Sem refresh. `POST /auth/logout` exige Bearer e responde `204`; o token segue válido até expirar, e o frontend apaga `localStorage`.
5. **Foto em disco local.** Arquivos em `uploads/`, URL pública em `/uploads/...`. Sem `SMTP_HOST`, o e-mail de confirmação e o de redefinição saem no console do servidor.

Para exigir confirmação antes do login, use `REQUIRE_EMAIL_CONFIRMATION=true`. Aí o cadastro volta `201` sem `token`, e o login de quem não confirmou responde `403`.

## Endpoints

| Método | Rota | Auth |
|--------|------|------|
| `POST` | `/auth/cadastro` | não |
| `POST` | `/auth/login` | não |
| `GET` | `/auth/me` | Bearer |
| `POST` | `/auth/logout` | Bearer |
| `POST` | `/auth/esqueci-senha` | não |
| `POST` | `/auth/redefinir-senha` | não |
| `POST` | `/auth/confirmar-email` | não |
| `GET` | `/auth/confirmar-email?token=` | não |
| `GET` | `/health` | não |

Header autenticado: `Authorization: Bearer <jwt>`.

Claims: `sub` (id), `email`, `tipo`, `iat`, `exp`.

CORS liberado, com `credentials`, para `http://localhost:8080`, `http://localhost:3000` e os equivalentes em `127.0.0.1`. Ajuste com `CORS_ORIGINS`.

### Erros

```json
{
  "message": "Mensagem legível para o usuário",
  "code": "EMAIL_ALREADY_EXISTS",
  "errors": { "email": "E-mail já cadastrado" }
}
```

Login inválido responde sempre `401` com `"Credenciais inválidas"`, exista o e-mail ou não.

`POST /auth/esqueci-senha` responde `200` com a mesma mensagem para e-mail válido cadastrado ou não. Formato inválido continua `400`.

### E-mails (fase 2)

O link de confirmação aponta para `{FRONTEND_URL}/confirmacao-email?token=...`. O frontend envia esse token em `POST /auth/confirmar-email`. Abrir `GET /auth/confirmar-email?token=...` no navegador também confirma e redireciona para `/confirmacao-email?status=success`.

O link de redefinição aponta para `{FRONTEND_URL}/redefinir-senha?token=...` (tela ainda a criar no frontend). A API que troca a senha é `POST /auth/redefinir-senha`. Confirmação expira em 24h; redefinição, em 1h.

## Domínio

Valores em reais (`number`). Datas `YYYY-MM-DD`. Horários `HH:mm` em America/Sao_Paulo. Rotas `/guia/*` exigem `tipo = GUIA`. Rotas `/turista/*` exigem `tipo = TURISTA`. Catálogo público: `GET /roteiros`, `GET /roteiros/:id` e `GET /roteiros/:id/avaliacoes`.

Agenda, cupom, perfil do guia, avisos e admin: [`ROTAS-NOVAS.md`](ROTAS-NOVAS.md).

| Método | Rota |
|--------|------|
| `GET` | `/roteiros` |
| `GET` | `/roteiros/:id` |
| `GET` | `/roteiros/:id/avaliacoes` |
| `GET` `POST` | `/turista/favoritos` |
| `DELETE` | `/turista/favoritos/:roteiroId` |
| `GET` `PUT` | `/usuario/perfil` |
| `PUT` | `/usuario/senha` |
| `DELETE` | `/usuario/conta` |
| `POST` | `/reservas` |
| `GET` | `/reservas/:id` |
| `GET` | `/turista/reservas` |
| `POST` `GET` | `/reservas/:id/pagamento` |
| `GET` `POST` | `/guia/roteiros` |
| `GET` `PUT` | `/guia/roteiros/:id` |
| `PATCH` | `/guia/roteiros/:id/ativo` |
| `GET` | `/guia/reservas` |
| `GET` | `/guia/reservas/:id` |
| `POST` | `/guia/reservas/:id/aceitar` e `/recusar` |
| `GET` | `/guia/resumo-semana` |
| `POST` `GET` | `/conversas` |
| `GET` `POST` | `/conversas/:id/mensagens` |
| `GET` | `/turista/carteira` e `/guia/carteira` |
| `POST` `GET` | `/guia/saques` |

PIX é simulado. `PIX_SIMULADO_PAGO_EM_SEGUNDOS` (padrão `5` em dev) define em quantos segundos o próximo `GET /reservas/:id/pagamento` marca o pagamento como `PAGO` e a reserva como `PENDENTE`. O QR expira em 30 minutos; depois disso o pagamento vai para `EXPIRADO` e a reserva para `CANCELADA`. `CARTAO` responde `501`.

Senha atual incorreta em `PUT /usuario/senha` responde `400` com `SENHA_ATUAL_INVALIDA`, para o frontend não tratar como sessão inválida. Encerrar a conta invalida o JWT na hora.

Taxa da plataforma: 10% do `total`, no líquido de `CONFIRMADA` e `CONCLUIDA`. Passeio `CONFIRMADA` cujo horário já passou vira `CONCLUIDA` na próxima leitura. Presença no chat é sempre `false`.

## Divergências do contrato

- Logout existe e é stateless: não há blacklist.
- `GET /health` é extra, fora do contrato de auth.
- As respostas de auth não trazem `criadoEm` nem `atualizadoEm`, como nos exemplos da spec.
- Erros incluem `code` além de `message` e `errors`.
- Banco local é SQLite (`prisma/dev.db`). Para outro ambiente, troque `DATABASE_URL` e o provider do Prisma.
- `GET /guia/roteiros/:id` existe para o dono ver roteiro inativo.
- O roteiro guarda `pontoEncontro`, usado como `endereco` no detalhe da reserva do guia. O JSON público do roteiro não inclui esse campo.
- Não há endpoint para o turista concluir o passeio: `CONFIRMADA` com data/horário já ocorridos passa a `CONCLUIDA` na leitura.
- Crédito promocional e voucher continuam `0`. Cashback, cupom, agenda, perfil do guia, avisos e admin estão em [`ROTAS-NOVAS.md`](ROTAS-NOVAS.md). Cartão responde `501`. Sem websocket e sem OSRM no servidor.
