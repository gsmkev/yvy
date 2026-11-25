/** Ajustes de la hacienda de una estancia: límite de carga (UA/ha) y sistema de producción, cada uno con su hoja. */
import { useState } from "react";
import { MAX_UA_PER_HA_LIMITS, t, type ProductionSystem } from "@yvy/shared";
import { showToast } from "../../lib/toast";
import { fmtNumber, parseDecimal } from "../format";
import { useOnlineMutation } from "../useOnlineMutation";

/** Hoja del límite de carga: estado, apertura y guardado. `refresh` recarga las existencias al guardar. */
export function useLimitSheet(farmId: string | undefined, maxUa: number, refresh: () => void) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const save = useOnlineMutation<{ maxUaPerHa: number }, unknown>("PUT", `/org/farms/${farmId}/livestock-settings`, { invalidate: [`/org/farms/${farmId}/stock`] });
  const show = () => {
    save.reset();
    setFormError(null);
    setText(fmtNumber(maxUa, 2));
    setOpen(true);
  };
  const submit = async () => {
    const v = parseDecimal(text);
    if (v === null || v < MAX_UA_PER_HA_LIMITS.min || v > MAX_UA_PER_HA_LIMITS.max) return setFormError(t("office.herd.stockLimitBad", { min: fmtNumber(MAX_UA_PER_HA_LIMITS.min), max: MAX_UA_PER_HA_LIMITS.max }));
    setFormError(null);
    const r = await save.mutate({ maxUaPerHa: v });
    if (r.ok) {
      setOpen(false);
      showToast(t("office.herd.stockLimitSaved"));
      refresh();
    }
  };
  return { open, close: () => setOpen(false), show, text, setText, submit, pending: save.pending, error: formError ?? save.error };
}

/** Hoja del sistema de producción (tambo, cría, etc.): estado, apertura con el valor actual y guardado. */
export function useSystemSheet(farmId: string | undefined, current: ProductionSystem | null, refresh: () => void) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<ProductionSystem | "">("");
  const save = useOnlineMutation<{ system: ProductionSystem }, unknown>("PUT", `/org/farms/${farmId}/livestock-settings`, { invalidate: [`/org/farms/${farmId}/stock`, `/org/farms/${farmId}/production`] });
  const show = () => {
    save.reset();
    setPick(current ?? "");
    setOpen(true);
  };
  const submit = async () => {
    if (!pick) return;
    const r = await save.mutate({ system: pick });
    if (r.ok) {
      setOpen(false);
      showToast(t("ui.herd.sysSaved"));
      refresh();
    }
  };
  return { open, close: () => setOpen(false), show, pick, setPick, submit, pending: save.pending, error: save.error };
}
