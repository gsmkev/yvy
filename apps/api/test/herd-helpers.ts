/** Preparación común de los tests de ganadería (gan-p2): organización, estancia con potreros y un empleado. */
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

export const DAY = 86_400_000;

/** Estancia con `n` lotes y un empleado asignado a los dos primeros. */
export async function setupHerd(n = 4, pasture = true) {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, n);
  const worker = await addMemberAndLogin(owner.token, "worker");
  await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: plotIds.slice(0, 2) } });
  if (pasture)
    for (const id of plotIds) await call("PATCH", `/org/plots/${id}`, { token: owner.token, body: { kind: "pasture" } });
  return { owner, worker, farmId, plotIds };
}
