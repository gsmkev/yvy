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
