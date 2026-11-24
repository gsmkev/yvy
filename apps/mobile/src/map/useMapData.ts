import { useEffect, useState } from "react";
import { isFieldRole } from "@yvy/shared";
import { getDb } from "../lib/db";
import { byFarm, useFarmChoice } from "../lib/farmFilter";
import { isOwnerMode } from "../lib/ownerSummary";
import { tilesBaseUrl } from "../lib/offline";
import { useReadOnly } from "../lib/readOnly";
import { useSession } from "../lib/session";
import { useLocal } from "../lib/useLocal";

/** Lo que el mapa dibuja y lo que la persona puede hacer, todo de la base local. */
export function useMapData() {
  const { farmId: chosenFarm, current } = useFarmChoice();
  // F-29: dueño, administrador y agrónomo ven todos los lotes de todas las estancias; la estancia elegida solo mueve la cámara.
  const owner = isOwnerMode(useSession()?.organization.role);
  const farmId = owner ? null : chosenFarm;
  const farms = useLocal(() => byFarm(getDb().farms().map((f) => ({ ...f, farmId: f.id })), farmId), [farmId]);
  const plots = useLocal(() => byFarm(getDb().plots(), farmId), [farmId]);
  const records = useLocal(() => byFarm(getDb().records(300), farmId), [farmId]);
  const lastVisit = useLocal(() => getDb().lastVisitByPlot());
  const userId = useSession()?.user.id ?? "";
  const pois = useLocal(() => byFarm(getDb().pois(), farmId), [farmId]);
  const taskPoints = useLocal(() => getDb().taskPoints(userId), [userId]);
  const [remoteBase, setRemoteBase] = useState<string | null>(null);
  const farm = current ?? farms[0];
  const readOnly = useReadOnly();
  const canMarkPoi = !isFieldRole(useSession()?.organization.role ?? "worker") && !readOnly;
  useEffect(() => {
    tilesBaseUrl().then(setRemoteBase, () => setRemoteBase(null));
  }, []);
  return { farmId, farms, plots, records, lastVisit, pois, taskPoints, remoteBase, farm, readOnly, canMarkPoi };
}
