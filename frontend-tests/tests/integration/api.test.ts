import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/services/api";

function resp(body: unknown, init: { status?: number; statusText?: string } = {}) {
  const status = init.status ?? 200;
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  return new Response(status === 204 ? null : text, { status, statusText: init.statusText ?? "" });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("ApiService - cabeçalhos e métodos", () => {
  it("TI-01 GET envia Authorization quando há token", async () => {
    localStorage.setItem("token", "tok123");
    fetchMock.mockResolvedValue(resp({ ok: true }));
    await api.get("/roteiros");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/roteiros$/);
    expect(opts.method).toBe("GET");
    expect(opts.headers.Authorization).toBe("Bearer tok123");
    expect(opts.credentials).toBe("include");
  });

  it("TI-02 GET sem token não envia Authorization", async () => {
    fetchMock.mockResolvedValue(resp({}));
    await api.get("/roteiros");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("TI-03 skipAuth não envia Authorization mesmo com token", async () => {
    localStorage.setItem("token", "tok123");
    fetchMock.mockResolvedValue(resp({}));
    await api.get("/roteiros", { skipAuth: true });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("TI-04 POST serializa o corpo em JSON", async () => {
    fetchMock.mockResolvedValue(resp({ id: 1 }));
    await api.post("/reservas", { quantidade: 2 });
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.method).toBe("POST");
    expect(opts.body).toBe(JSON.stringify({ quantidade: 2 }));
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("TI-05 POST com arquivo usa FormData e remove Content-Type", async () => {
    fetchMock.mockResolvedValue(resp({}));
    const file = new File(["x"], "foto.png", { type: "image/png" });
    await api.post("/upload", { a: 1 }, {}, file);
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.headers["Content-Type"]).toBeUndefined();
    expect((opts.body as FormData).get("data")).toBe(JSON.stringify({ a: 1 }));
  });

  it("TI-06 postForm envia FormData sem Content-Type", async () => {
    localStorage.setItem("token", "t");
    fetchMock.mockResolvedValue(resp({}));
    await api.postForm("/auth/cadastro", new FormData());
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.headers["Content-Type"]).toBeUndefined();
    expect(opts.headers.Authorization).toBe("Bearer t");
  });

  it.each([
    ["put", "PUT"],
    ["patch", "PATCH"],
  ] as const)("TI-07 %s usa o método HTTP %s", async (fn, metodo) => {
    fetchMock.mockResolvedValue(resp({}));
    await (api as any)[fn]("/x", { a: 1 });
    expect(fetchMock.mock.calls[0][1].method).toBe(metodo);
  });

  it("TI-08 delete usa o método DELETE", async () => {
    fetchMock.mockResolvedValue(resp(undefined, { status: 204 }));
    await api.delete("/turista/favoritos/1");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("ApiService - respostas", () => {
  it("TI-09 retorna o JSON em respostas 200", async () => {
    fetchMock.mockResolvedValue(resp({ nome: "Bike Tour" }));
    await expect(api.get("/x")).resolves.toEqual({ nome: "Bike Tour" });
  });

  it("TI-10 retorna undefined em 204", async () => {
    fetchMock.mockResolvedValue(resp(undefined, { status: 204 }));
    await expect(api.delete("/x")).resolves.toBeUndefined();
  });

  it("TI-11 retorna undefined quando o corpo é vazio", async () => {
    fetchMock.mockResolvedValue(resp(""));
    await expect(api.get("/x")).resolves.toBeUndefined();
  });

  it("TI-12 erro 400 lança objeto com status, data e message da API", async () => {
    fetchMock.mockResolvedValue(resp({ message: "Dados inválidos", errors: { email: "x" } }, { status: 400 }));
    await expect(api.post("/auth/cadastro", {})).rejects.toMatchObject({
      message: "Dados inválidos",
      response: { status: 400, data: { message: "Dados inválidos" } },
    });
  });

  it("TI-13 erro sem JSON usa statusText como mensagem", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 500, statusText: "Server Error" }));
    await expect(api.get("/x")).rejects.toMatchObject({ message: "Server Error", response: { status: 500 } });
  });

  it("TI-14 erro 403 não encerra a sessão", async () => {
    localStorage.setItem("token", "t");
    fetchMock.mockResolvedValue(resp({ message: "Proibido" }, { status: 403 }));
    await expect(api.get("/admin/guias")).rejects.toMatchObject({ response: { status: 403 } });
    expect(localStorage.getItem("token")).toBe("t");
  });
});

describe("ApiService - sessão expirada (401)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", { value: { href: "/home" }, writable: true });
  });

  it("TI-15 401 limpa a sessão, grava aviso e redireciona ao login", async () => {
    localStorage.setItem("token", "t");
    localStorage.setItem("user", "{}");
    localStorage.setItem("tempoSessao", "1");
    fetchMock.mockResolvedValue(resp({}, { status: 401 }));
    await expect(api.get("/auth/me")).rejects.toThrow("Session expired");
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(localStorage.getItem("tempoSessao")).toBeNull();
    expect(localStorage.getItem("expiredSessionMessage")).toBe("Sessão expirada. Faça login novamente.");
    expect(window.location.href).toBe("/login");
  });

  it("TI-16 401 com skipAuth (login errado) não redireciona", async () => {
    fetchMock.mockResolvedValue(resp({ message: "Credenciais inválidas" }, { status: 401 }));
    await expect(api.post("/auth/login", {}, { skipAuth: true })).rejects.toMatchObject({
      message: "Credenciais inválidas",
      response: { status: 401 },
    });
    expect(window.location.href).toBe("/home");
  });
});

describe("ApiService - postText", () => {
  it("TI-17 retorna o texto da resposta", async () => {
    fetchMock.mockResolvedValue(new Response("olá", { status: 200 }));
    await expect(api.postText("/x", { a: 1 })).resolves.toBe("olá");
  });
  it("TI-18 erro HTTP lança objeto com status", async () => {
    fetchMock.mockResolvedValue(new Response("falha", { status: 500, statusText: "Err" }));
    await expect(api.postText("/x")).rejects.toMatchObject({ response: { status: 500, data: "falha" } });
  });
});
