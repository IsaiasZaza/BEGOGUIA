import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { FetchAuthProvider } from "@/components/providers/FetchAuthProvider";

const API = "https://api.goguia.test";
let base: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = API;
  base = vi.fn().mockImplementation(async () => new Response("{}"));
  window.fetch = base as any;
});

const montar = () => render(<FetchAuthProvider><p>filho</p></FetchAuthProvider>);

describe("FetchAuthProvider", () => {
  it("TI-80 renderiza os filhos", () => {
    const { getByText } = montar();
    expect(getByText("filho")).toBeInTheDocument();
  });

  it("TI-81 injeta Bearer em requisições para a API do GoGuia", async () => {
    localStorage.setItem("token", "abc");
    montar();
    await window.fetch(`${API}/roteiros`);
    const headers = base.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer abc");
  });

  it("TI-82 NÃO injeta Authorization em outros domínios (ex.: mapas)", async () => {
    localStorage.setItem("token", "abc");
    montar();
    await window.fetch("https://tiles.maplibre.test/style.json");
    const init = base.mock.calls[0][1];
    expect(init?.headers).toBeUndefined();
  });

  it("TI-83 não altera a requisição quando não há token", async () => {
    montar();
    await window.fetch(`${API}/roteiros`);
    const init = base.mock.calls[0][1];
    expect(init?.headers).toBeUndefined();
  });

  it("TI-84 restaura o fetch original ao desmontar", () => {
    const { unmount } = montar();
    const wrapper = window.fetch;
    unmount();
    expect(window.fetch).not.toBe(wrapper);
    window.fetch(`${API}/x`);
    expect(base).toHaveBeenCalledTimes(1);
  });
});
