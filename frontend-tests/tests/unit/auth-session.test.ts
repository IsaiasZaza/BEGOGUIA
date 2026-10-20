import { describe, it, expect } from "vitest";
import {
  saveSession,
  clearSession,
  getStoredUser,
  getApiErrorMessage,
  type AuthUser,
} from "@/services/auth";

const user: AuthUser = {
  id: "1",
  nomeCompleto: "Maria Turista",
  email: "turista@goguia.test",
  fotoUrl: null,
  tipo: "TURISTA",
  emailConfirmado: true,
};

describe("saveSession", () => {
  it("TU-10 grava token, usuário e tempo de sessão", () => {
    const antes = Date.now();
    saveSession({ token: "abc", user, expiresIn: 3600 });
    expect(localStorage.getItem("token")).toBe("abc");
    expect(JSON.parse(localStorage.getItem("user")!)).toEqual(user);
    const expira = Number(localStorage.getItem("tempoSessao"));
    expect(expira).toBeGreaterThanOrEqual(antes + 3600 * 1000);
  });
  it("TU-11 não grava nada quando a resposta vem vazia", () => {
    saveSession({});
    expect(localStorage.length).toBe(0);
  });
});

describe("clearSession", () => {
  it("TU-12 remove token, user e tempoSessao", () => {
    saveSession({ token: "abc", user, expiresIn: 10 });
    clearSession();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(localStorage.getItem("tempoSessao")).toBeNull();
  });
});

describe("getStoredUser", () => {
  it("TU-13 retorna null sem usuário salvo", () => {
    expect(getStoredUser()).toBeNull();
  });
  it("TU-14 retorna o usuário salvo", () => {
    localStorage.setItem("user", JSON.stringify(user));
    expect(getStoredUser()).toEqual(user);
  });
  it("TU-15 retorna null quando o JSON está corrompido", () => {
    localStorage.setItem("user", "{quebrado");
    expect(getStoredUser()).toBeNull();
  });
});

describe("getApiErrorMessage", () => {
  it("TU-16 junta as mensagens de errors por campo", () => {
    const e = { response: { data: { errors: { email: "E-mail inválido.", senha: "Senha fraca." } } } };
    expect(getApiErrorMessage(e, "fallback")).toBe("E-mail inválido. Senha fraca.");
  });
  it("TU-17 usa data.message quando não há errors", () => {
    expect(getApiErrorMessage({ response: { data: { message: "Credenciais inválidas" } } }, "x")).toBe(
      "Credenciais inválidas"
    );
  });
  it("TU-18 usa error.message quando não há resposta", () => {
    expect(getApiErrorMessage({ message: "Network down" }, "x")).toBe("Network down");
  });
  it("TU-19 ignora a mensagem genérica 'Request failed'", () => {
    expect(getApiErrorMessage({ message: "Request failed" }, "Erro ao entrar")).toBe("Erro ao entrar");
  });
  it("TU-20 devolve o fallback para valores que não são objeto", () => {
    expect(getApiErrorMessage(null, "fallback")).toBe("fallback");
    expect(getApiErrorMessage("erro", "fallback")).toBe("fallback");
  });
});
