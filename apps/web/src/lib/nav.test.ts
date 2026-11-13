import { describe, expect, it } from "vitest";
import { buildNav, type NavContext } from "./nav";

const base: NavContext = { role: "owner", farms: 2, plots: 9, hasClients: false, isStaff: false, labs: true };
const paths = (c: Partial<NavContext>) => {
  const n = buildNav({ ...base, ...c });
  return [...n.main.flatMap((g) => g.items), ...n.bottom].map((i) => i.to);
};

describe("navegación lateral", () => {
  it("el dueño con varias estancias ve todo, agrupado", () => {
    const n = buildNav(base);
    expect(n.main.map((g) => g.id)).toEqual(["field", "livestock", "manage", "alerts"]);
    expect(paths({})).toEqual([
      "/", "/registros", "/tareas", "/calendario", "/sanidad", "/administracion", "/comparar", "/equipo", "/avisos", "/laboratorio",
    ]);
  });
  it("Comparar solo aparece con más de una estancia", () => {
    expect(paths({ farms: 1 })).not.toContain("/comparar");
    expect(paths({ farms: null })).not.toContain("/comparar");
  });
  it("Sanidad se oculta sin lotes y para el personal de campo", () => {
    expect(paths({ plots: 0 })).not.toContain("/sanidad");
    expect(paths({ plots: null })).toContain("/sanidad");
    expect(paths({ role: "worker" })).not.toContain("/sanidad");
  });
  it("Administración es del dueño y los administradores", () => {
    expect(paths({ role: "agronomist" })).not.toContain("/administracion");
    expect(paths({ role: "admin" })).toContain("/administracion");
  });
  it("Laboratorio, Clientes e Interno según corresponda", () => {
    expect(paths({ labs: false })).not.toContain("/laboratorio");
    expect(paths({ hasClients: true })).toContain("/clientes");
    expect(buildNav({ ...base, isStaff: true }).bottom.map((i) => i.to)).toEqual(["/laboratorio", "/interno"]);
  });
  it("un grupo sin ítems no se muestra", () => {
    const n = buildNav({ ...base, role: "worker", farms: 1 });
    expect(n.main.map((g) => g.id)).not.toContain("livestock");
  });
});
