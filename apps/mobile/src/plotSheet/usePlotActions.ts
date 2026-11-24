/** Acciones de la ficha del lote: editar atributos y borrar. */
import { useState } from "react";
import type { MultiPolygon, Polygon } from "geojson";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import type { Plot } from "../db/store";
import { getDb } from "../lib/db";
import { useSession } from "../lib/session";
import { localChanged, syncNow } from "../lib/sync";
import { showToast } from "../lib/toast";
import { useOnlineMutation } from "../office/useOnlineMutation";
import { editFromPlot, type PlotEdit } from "../ui/PlotSections";

/** Editar los atributos del lote (por el outbox o por REST) y borrarlo (REST, con confirmación escrita). */
export function usePlotActions(plot: Plot) {
  const session = useSession();
  const id = plot.id;
  const [editing, setEditing] = useState<PlotEdit | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const patch = useOnlineMutation<Record<string, unknown>, { ok: boolean }>("PATCH", `/org/plots/${id}`);
  const remove = useOnlineMutation<void, { ok: boolean }>("DELETE", `/org/plots/${id}`);

  const openEdit = () => {
    patch.reset();
    setFormError(null);
    setEditing(editFromPlot(plot));
  };


  /** Nombre, tipo y cultivo viajan por el outbox (anda sin señal): hay que poder reescribir el lote tal cual salvo esos campos. */
  const saveOffline = (edit: PlotEdit, name: string): boolean => {
    const geo = JSON.parse(plot.geometry) as Polygon | MultiPolygon;
    const same = edit.season === (plot.season ?? "") && edit.sowingDate === (plot.sowingDate ?? "") && edit.pastureType === (plot.pastureType ?? "");
    const orgId = session?.organization.id;
    if (!(same && orgId && geo.type === "Polygon" && geo.coordinates.length === 1)) return false;
    getDb().savePlot(orgId, { id: plot.id, farmId: plot.farmId, name, kind: edit.kind, crop: edit.kind === "crop" ? ((edit.crop || null) as typeof plot.crop) : null, geometry: geo });
    localChanged();
    setEditing(null);
    showToast(t("ui.toast.plotUpdated"));
    void syncNow();
    return true;
  };

  const submitEdit = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return setFormError(t("office.plot.needsName"));
    setFormError(null);
    // Campaña, siembra y pastura no están en el protocolo de sync: van por REST.
    if (saveOffline(editing, name)) return;
    const isCrop = editing.kind === "crop";
    const r = await patch.mutate({ name, kind: editing.kind, crop: isCrop ? editing.crop || null : null, season: isCrop ? editing.season || null : null, sowingDate: editing.sowingDate || null, pastureType: isCrop ? null : editing.pastureType.trim() || null });
    if (r.ok) {
      setEditing(null);
      showToast(t("ui.toast.plotUpdated"));
      void syncNow();
    }
  };

  const doDelete = async () => {
    const r = await remove.mutate();
    if (r.ok) {
      setConfirming(false);
      showToast(t("ui.toast.plotDeleted"));
      void syncNow();
      router.back();
    }
  };

  const askDelete = () => {
    remove.reset();
    setTyped("");
    setConfirming(true);
  };

  return { editing, setEditing, formError, confirming, setConfirming, typed, setTyped, patch, remove, openEdit, submitEdit, doDelete, askDelete };
}
