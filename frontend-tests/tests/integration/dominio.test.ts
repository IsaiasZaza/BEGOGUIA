import { describe, it, expect, vi, beforeEach } from "vitest";
import * as d from "@/services/dominio";

let fetchMock: ReturnType<typeof vi.fn>;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const call = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
const url = () => call()[0] as string;
const opts = () => call()[1];

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation(async () => json({ items: [] }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("Roteiros (públicos)", () => {
  it("TI-40 listarRoteiros sem filtro não envia query string", async () => {
    await d.listarRoteiros();
    expect(url()).toMatch(/\/roteiros$/);
  });
  it("TI-41 listarRoteiros monta q, categoria e destaque", async () => {
    await d.listarRoteiros({ q: "bike", categoria: "lazer", destaque: true });
    const u = new URL(url());
    expect(u.pathname).toBe("/roteiros");
    expect(u.searchParams.get("q")).toBe("bike");
    expect(u.searchParams.get("categoria")).toBe("lazer");
    expect(u.searchParams.get("destaque")).toBe("true");
  });
  it("TI-42 listarRoteiros ignora destaque=false", async () => {
    await d.listarRoteiros({ destaque: false });
    expect(url()).not.toContain("destaque");
  });
  it("TI-43 listarRoteiros codifica caracteres especiais", async () => {
    await d.listarRoteiros({ q: "São Paulo & cia" });
    expect(new URL(url()).searchParams.get("q")).toBe("São Paulo & cia");
  });
  it("TI-44 rotas públicas não enviam Authorization", async () => {
    localStorage.setItem("token", "t");
    await d.detalheRoteiro("1");
    expect(opts().headers.Authorization).toBeUndefined();
    expect(url()).toMatch(/\/roteiros\/1$/);
  });
  it("TI-45 disponibilidadeRoteiro envia a data", async () => {
    await d.disponibilidadeRoteiro("9", "2026-12-17");
    expect(url()).toMatch(/\/roteiros\/9\/disponibilidade\?data=2026-12-17$/);
  });
});

describe("Favoritos", () => {
  it("TI-46 favoritar faz POST com roteiroId", async () => {
    localStorage.setItem("token", "t");
    await d.favoritar("5");
    expect(opts().method).toBe("POST");
    expect(JSON.parse(opts().body)).toEqual({ roteiroId: "5" });
    expect(opts().headers.Authorization).toBe("Bearer t");
  });
  it("TI-47 desfavoritar faz DELETE no id", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await d.desfavoritar("5");
    expect(opts().method).toBe("DELETE");
    expect(url()).toMatch(/\/turista\/favoritos\/5$/);
  });
});

describe("Reservas e pagamento", () => {
  it("TI-48 criarReserva envia roteiroId, data, horario e quantidade", async () => {
    const dados = { roteiroId: "1", data: "2026-12-17", horario: "09:00", quantidade: 2 };
    await d.criarReserva(dados);
    expect(url()).toMatch(/\/reservas$/);
    expect(JSON.parse(opts().body)).toEqual(dados);
  });
  it("TI-49 criarReserva sem vagas propaga 409 HORARIO_ESGOTADO", async () => {
    fetchMock.mockResolvedValue(json({ message: "Esgotado", code: "HORARIO_ESGOTADO" }, 409));
    await expect(
      d.criarReserva({ roteiroId: "1", data: "2026-12-17", horario: "09:00", quantidade: 99 })
    ).rejects.toMatchObject({ response: { status: 409, data: { code: "HORARIO_ESGOTADO" } } });
  });
  it("TI-50 listarReservasTurista filtra por status", async () => {
    await d.listarReservasTurista("CONFIRMADA");
    expect(url()).toMatch(/\/turista\/reservas\?status=CONFIRMADA$/);
  });
  it("TI-51 pagarReserva PIX simples não envia cupom nem cashback", async () => {
    await d.pagarReserva("r1", "PIX");
    expect(JSON.parse(opts().body)).toEqual({ metodo: "PIX" });
  });
  it("TI-52 pagarReserva envia cupom e cashback quando informados", async () => {
    await d.pagarReserva("r1", "PIX", { codigoCupom: "BEMVINDO10", usarCashback: true });
    expect(JSON.parse(opts().body)).toEqual({ metodo: "PIX", codigoCupom: "BEMVINDO10", usarCashback: true });
  });
  it("TI-53 pagarReserva omite usarCashback=false e cupom vazio", async () => {
    await d.pagarReserva("r1", "CARTAO", { codigoCupom: "", usarCashback: false });
    expect(JSON.parse(opts().body)).toEqual({ metodo: "CARTAO" });
  });
  it("TI-54 aplicarCupom envia o código", async () => {
    await d.aplicarCupom("r1", "BEMVINDO10");
    expect(url()).toMatch(/\/reservas\/r1\/cupom$/);
    expect(JSON.parse(opts().body)).toEqual({ codigo: "BEMVINDO10" });
  });
  it("TI-55 cupom inválido propaga 400 CUPOM_INVALIDO", async () => {
    fetchMock.mockResolvedValue(json({ message: "Cupom inválido", code: "CUPOM_INVALIDO" }, 400));
    await expect(d.aplicarCupom("r1", "XXX")).rejects.toMatchObject({
      response: { status: 400, data: { code: "CUPOM_INVALIDO" } },
    });
  });
});

describe("Guia", () => {
  it("TI-56 listarReservasGuia usa 'proximas' por padrão", async () => {
    await d.listarReservasGuia();
    expect(url()).toMatch(/\/guia\/reservas\?quando=proximas$/);
  });
  it("TI-57 listarReservasGuia aceita 'historico'", async () => {
    await d.listarReservasGuia("historico");
    expect(url()).toMatch(/quando=historico$/);
  });
  it("TI-58 aceitar e recusar reserva usam POST nas rotas corretas", async () => {
    await d.aceitarReserva("7");
    expect(url()).toMatch(/\/guia\/reservas\/7\/aceitar$/);
    await d.recusarReserva("7");
    expect(url()).toMatch(/\/guia\/reservas\/7\/recusar$/);
    expect(opts().method).toBe("POST");
  });
  it("TI-59 definirRoteiroAtivo usa PATCH com { ativo }", async () => {
    await d.definirRoteiroAtivo("3", false);
    expect(opts().method).toBe("PATCH");
    expect(JSON.parse(opts().body)).toEqual({ ativo: false });
  });
  it("TI-60 salvarAgenda usa PUT com a agenda completa", async () => {
    const agenda = { diasSemana: [1, 2], horarios: ["09:00"], datasBloqueadas: ["2026-12-25"] };
    await d.salvarAgenda("3", agenda);
    expect(opts().method).toBe("PUT");
    expect(url()).toMatch(/\/guia\/roteiros\/3\/agenda$/);
    expect(JSON.parse(opts().body)).toEqual(agenda);
  });
  it("TI-61 solicitarSaque envia valor e método", async () => {
    await d.solicitarSaque(150, "PIX");
    expect(JSON.parse(opts().body)).toEqual({ valor: 150, metodo: "PIX" });
  });
  it("TI-62 enviarFotoPerfilGuia envia FormData com 'foto'", async () => {
    const foto = new File(["x"], "p.png", { type: "image/png" });
    await d.enviarFotoPerfilGuia(foto);
    expect(opts().body).toBeInstanceOf(FormData);
    expect((opts().body as FormData).get("foto")).toBeInstanceOf(File);
  });
});

describe("Chat, notificações e perfil", () => {
  it("TI-63 listarMensagens passa 'depois' quando informado", async () => {
    await d.listarMensagens("c1", "2026-01-01T00:00:00Z");
    expect(url()).toContain("/conversas/c1/mensagens?depois=");
  });
  it("TI-64 listarMensagens sem 'depois' não envia query", async () => {
    await d.listarMensagens("c1");
    expect(url()).toMatch(/\/conversas\/c1\/mensagens$/);
  });
  it("TI-65 enviarMensagem envia o texto", async () => {
    await d.enviarMensagem("c1", "Olá!");
    expect(JSON.parse(opts().body)).toEqual({ texto: "Olá!" });
  });
  it("TI-66 marcarNotificacaoLida usa PATCH", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await d.marcarNotificacaoLida("n1");
    expect(opts().method).toBe("PATCH");
    expect(url()).toMatch(/\/notificacoes\/n1\/lida$/);
  });
  it("TI-67 trocarSenha envia senhaAtual e novaSenha", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await d.trocarSenha("velha", "nova");
    expect(opts().method).toBe("PUT");
    expect(JSON.parse(opts().body)).toEqual({ senhaAtual: "velha", novaSenha: "nova" });
  });
});

describe("Admin", () => {
  it("TI-68 listarGuiasAdmin filtra por status", async () => {
    await d.listarGuiasAdmin("PENDENTE");
    expect(url()).toMatch(/\/admin\/guias\?status=PENDENTE$/);
  });
  it("TI-69 aprovarGuia e recusarGuia usam as rotas corretas", async () => {
    await d.aprovarGuia("g1");
    expect(url()).toMatch(/\/admin\/guias\/g1\/aprovar$/);
    await d.recusarGuia("g1");
    expect(url()).toMatch(/\/admin\/guias\/g1\/recusar$/);
  });
  it("TI-70 criarCupomAdmin envia os dados do cupom", async () => {
    const dados = { codigo: "NATAL20", tipo: "PERCENTUAL" as const, valor: 20, expiraEm: "2026-12-31" };
    await d.criarCupomAdmin(dados);
    expect(JSON.parse(opts().body)).toEqual(dados);
  });
  it("TI-71 acesso de turista a rota admin retorna 403 sem derrubar a sessão", async () => {
    localStorage.setItem("token", "t");
    fetchMock.mockResolvedValue(json({ message: "Acesso negado" }, 403));
    await expect(d.listarCuponsAdmin()).rejects.toMatchObject({ response: { status: 403 } });
    expect(localStorage.getItem("token")).toBe("t");
  });
  it("TI-72 atualizarSaqueAdmin envia o novo status", async () => {
    await d.atualizarSaqueAdmin("s1", "CONCLUIDO");
    expect(JSON.parse(opts().body)).toEqual({ status: "CONCLUIDO" });
  });
});
