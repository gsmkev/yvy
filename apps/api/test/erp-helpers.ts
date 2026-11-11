/** Armado común de las pruebas del ERP: una organización con los cuatro roles. */
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

export async function erpSetup(plots = 2) {
  const owner = await createOrgWithOwner();
  const admin = await addMemberAndLogin(owner.token, "admin", "Administrador");
  const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing. Agrónoma");
  const worker = await addMemberAndLogin(owner.token, "worker", "Peón");
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, plots);
  await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]!] } });
  return { owner, admin, agro, worker, farmId, plotIds };
}

export const erpPost = <T = any>(token: string, path: string, body: unknown) =>
  call<T>("POST", `/org/erp/${path}`, { token, body });
export const erpGet = <T = any>(token: string, path: string) => call<T>("GET", `/org/erp/${path}`, { token });

/** Comprueba que cada rol recibe el estado esperado al listar. */
export async function expectListStatus(path: string, tokens: Record<string, [string, number]>) {
  for (const [who, [token, status]] of Object.entries(tokens)) {
    const r = await erpGet(token, path);
    if (r.status !== status) throw new Error(`${who}: GET ${path} dio ${r.status}, se esperaba ${status}`);
  }
}

/** Organización con dos depósitos y un producto (litros) para probar stock. */
export async function stockSetup() {
  const s = await erpSetup();
  const a = await erpPost(s.owner.token, "warehouses", { farmId: s.farmId, name: "Galpón", type: "shed" });
  const b = await erpPost(s.owner.token, "warehouses", { farmId: s.farmId, name: "Depósito 2", type: "shed" });
  const p = await call<any>("POST", "/org/products", {
    token: s.owner.token,
    body: { name: "Glifosato", type: "agrochemical", unit: "l" },
  });
  return { ...s, whA: a.body.id as string, whB: b.body.id as string, productId: p.body.id as string };
}

export const buy = (token: string, s: { productId: string; whA: string }, qty: number, amount: number, extra = {}) =>
  erpPost(token, "stock/purchases", {
    productId: s.productId,
    warehouseId: s.whA,
    date: "2026-11-05",
    qty,
    amount,
    currency: "PYG",
    ...extra,
  });

