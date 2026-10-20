import { describe, it, expect, vi, beforeEach } from "vitest";
import * as auth from "@/services/auth";

let fetchMock: ReturnType<typeof vi.fn>;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];

const user = {
  id: "1", nomeCompleto: "Pedro", email: "guia@goguia.test",
  fotoUrl: null, tipo: "GUIA", emailConfirmado: true,
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("login", () => {
  it("TI-20 envia email/senha para /auth/login e salva a sessão", async () => {
    fetchMock.mockResolvedValue(json({ token: "jwt", expiresIn: 60, user }));
    const data = await auth.login("guia@goguia.test", "Senha@123");
    const [url, opts] = lastCall();
    expect(url).toMatch(/\/auth\/login$/);
    expect(JSON.parse(opts.body)).toEqual({ email: "guia@goguia.test", senha: "Senha@123" });
    expect(opts.headers.Authorization).toBeUndefined();
    expect(data.token).toBe("jwt");
    expect(localStorage.getItem("token")).toBe("jwt");
    expect(auth.getStoredUser()).toEqual(user);
  });

  it("TI-21 credenciais inválidas não gravam sessão", async () => {
    fetchMock.mockResolvedValue(json({ message: "Credenciais inválidas" }, 401));
    await expect(auth.login("a@a.com", "errada")).rejects.toMatchObject({ message: "Credenciais inválidas" });
    expect(localStorage.getItem("token")).toBeNull();
  });
});

describe("cadastro", () => {
  const base = { nomeCompleto: "Ana", email: "ana@x.com", senha: "Senha@123", tipo: "TURISTA" as const };

  it("TI-22 sem foto envia JSON", async () => {
    fetchMock.mockResolvedValue(json({ message: "ok" }, 201));
    await auth.cadastro(base);
    const [url, opts] = lastCall();
    expect(url).toMatch(/\/auth\/cadastro$/);
    expect(JSON.parse(opts.body)).toEqual(base);
  });

  it("TI-23 com foto envia multipart/FormData", async () => {
    fetchMock.mockResolvedValue(json({ message: "ok" }, 201));
    const foto = new File(["x"], "f.png", { type: "image/png" });
    await auth.cadastro({ ...base, foto });
    const body = lastCall()[1].body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("email")).toBe("ana@x.com");
    expect(body.get("tipo")).toBe("TURISTA");
    expect((body.get("foto") as File).name).toBe("f.png");
  });

  it("TI-24 salva sessão quando a API devolve token", async () => {
    fetchMock.mockResolvedValue(json({ token: "novo", user }, 201));
    await auth.cadastro(base);
    expect(localStorage.getItem("token")).toBe("novo");
  });

  it("TI-25 e-mail já cadastrado propaga erro 409", async () => {
    fetchMock.mockResolvedValue(json({ message: "E-mail já cadastrado" }, 409));
    await expect(auth.cadastro(base)).rejects.toMatchObject({ response: { status: 409 } });
  });
});

describe("me / logout", () => {
  it("TI-26 me atualiza o usuário no localStorage", async () => {
    localStorage.setItem("token", "t");
    fetchMock.mockResolvedValue(json(user));
    await auth.me();
    expect(lastCall()[0]).toMatch(/\/auth\/me$/);
    expect(auth.getStoredUser()).toEqual(user);
  });

  it("TI-27 logout limpa a sessão após chamar a API", async () => {
    localStorage.setItem("token", "t");
    localStorage.setItem("user", "{}");
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await auth.logout();
    expect(lastCall()[0]).toMatch(/\/auth\/logout$/);
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("TI-28 logout limpa a sessão mesmo se a API falhar", async () => {
    localStorage.setItem("token", "t");
    fetchMock.mockResolvedValue(json({ message: "erro" }, 500));
    await expect(auth.logout()).rejects.toBeTruthy();
    expect(localStorage.getItem("token")).toBeNull();
  });
});

describe("recuperação de senha e confirmação de e-mail", () => {
  it("TI-29 esqueciSenha chama /auth/esqueci-senha sem token", async () => {
    localStorage.setItem("token", "t");
    fetchMock.mockResolvedValue(json({ message: "enviado" }));
    await auth.esqueciSenha("a@a.com");
    const [url, opts] = lastCall();
    expect(url).toMatch(/\/auth\/esqueci-senha$/);
    expect(JSON.parse(opts.body)).toEqual({ email: "a@a.com" });
    expect(opts.headers.Authorization).toBeUndefined();
  });

  it("TI-30 redefinirSenha envia token e novaSenha", async () => {
    fetchMock.mockResolvedValue(json({ message: "ok" }));
    await auth.redefinirSenha("tk", "Nova@123");
    expect(JSON.parse(lastCall()[1].body)).toEqual({ token: "tk", novaSenha: "Nova@123" });
  });

  it("TI-31 redefinirSenha com token inválido propaga erro 400", async () => {
    fetchMock.mockResolvedValue(json({ message: "Token inválido" }, 400));
    await expect(auth.redefinirSenha("x", "y")).rejects.toMatchObject({ message: "Token inválido" });
  });

  it("TI-32 confirmarEmail envia o token", async () => {
    fetchMock.mockResolvedValue(json({ message: "ok" }));
    await auth.confirmarEmail("abc");
    expect(lastCall()[0]).toMatch(/\/auth\/confirmar-email$/);
    expect(JSON.parse(lastCall()[1].body)).toEqual({ token: "abc" });
  });
});
