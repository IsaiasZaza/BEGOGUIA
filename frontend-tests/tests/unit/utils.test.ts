import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { formatBRL, labelStatus, type StatusReserva } from "@/services/dominio";

describe("cn (utils)", () => {
  it("TU-01 junta classes simples", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("TU-02 ignora valores falsos", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });
  it("TU-03 resolve conflitos do Tailwind (último vence)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

describe("BRAND", () => {
  it("TU-04 define cores no formato hexadecimal", () => {
    Object.values(BRAND).forEach((c) => expect(c).toMatch(/^#[0-9a-fA-F]{6}$/));
  });
});

describe("formatBRL", () => {
  it("TU-05 formata valor inteiro em reais", () => {
    expect(formatBRL(360).replace(/\s/g, " ")).toBe("R$ 360,00");
  });
  it("TU-06 formata centavos", () => {
    expect(formatBRL(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
  });
  it("TU-07 formata zero", () => {
    expect(formatBRL(0).replace(/\s/g, " ")).toBe("R$ 0,00");
  });
});

describe("labelStatus", () => {
  const casos: [StatusReserva, string][] = [
    ["AGUARDANDO_PAGAMENTO", "Aguardando pagamento"],
    ["PENDENTE", "Pendente"],
    ["CONFIRMADA", "Confirmada"],
    ["RECUSADA", "Recusada"],
    ["CONCLUIDA", "Concluída"],
    ["CANCELADA", "Cancelada"],
  ];
  it.each(casos)("TU-08 status %s => %s", (status, texto) => {
    expect(labelStatus(status)).toBe(texto);
  });
});
