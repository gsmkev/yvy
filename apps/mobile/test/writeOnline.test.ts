import { describe, expect, it } from "vitest";
import { HttpError, OfflineError } from "../src/lib/errors";
import { runWrite, writeErrorText, type WriteState } from "../src/lib/writeOnline";

describe("escrituras en línea (ola 0)", () => {
  it("sin señal no llama al servidor y dice que necesita conexión", async () => {
    const seen: WriteState[] = [];
    let called = false;
    const r = await runWrite(false, async () => ((called = true), 1), (s) => seen.push(s));
    expect(r).toEqual({ ok: false });
    expect(called).toBe(false);
    expect(seen).toEqual([{ phase: "error", message: "Necesita conexión" }]);
  });

  it("pasa por mandando y termina bien", async () => {
    const seen: string[] = [];
    const r = await runWrite(true, async () => ({ id: "t1" }), (s) => seen.push(s.phase));
    expect(r).toEqual({ ok: true, value: { id: "t1" } });
    expect(seen).toEqual(["sending", "done"]);
  });

  it("si falla deja el error a la vista y no tira", async () => {
    let last: WriteState = { phase: "idle" };
    const r = await runWrite(
      true,
      async () => {
        throw new HttpError(403, "Solo dueño o administrador crean empleados");
      },
      (s) => (last = s),
    );
    expect(r).toEqual({ ok: false });
    expect(last).toEqual({ phase: "error", message: "Tu rol no puede hacer esto." });
  });

  it("traduce cada error para la persona", () => {
    expect(writeErrorText(new OfflineError("Sin señal"))).toBe("Necesita conexión");
    expect(writeErrorText(new HttpError(401, "x"))).toContain("sesión venció");
    expect(writeErrorText(new HttpError(403, "x"))).toBe("Tu rol no puede hacer esto.");
    expect(writeErrorText(new HttpError(403, "El dueño exige segundo factor a los administradores. Activalo para seguir."))).toContain("segundo factor");
    expect(writeErrorText(new HttpError(404, "Lote inexistente"))).toContain("ya no existe");
    expect(writeErrorText(new HttpError(409, "Otra persona ya ingresa con ese teléfono."))).toBe("Otra persona ya ingresa con ese teléfono.");
    expect(writeErrorText(new HttpError(400, "HTTP 400"))).toBe("No se pudo completar. Probá de nuevo.");
    expect(writeErrorText(new HttpError(500, "boom"))).toBe("No se pudo completar. Probá de nuevo.");
    expect(writeErrorText(new Error("x"))).toBe("No se pudo completar. Probá de nuevo.");
  });
});
