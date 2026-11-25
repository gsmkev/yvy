/** Límite de unidades animales por hectárea: edición para dueño y administrador. */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MAX_UA_PER_HA_LIMITS, type FarmStockResponse } from "@yvy/shared";
import { put } from "../../lib/api";
import { t } from "../../lib/i18n";
import { Button, ErrorBox, Field, Form, Input, toast } from "../ui";

const num = (v: string) => Number(v.replace(",", "."));
const shown = (n: number) => String(n).replace(".", ",");

/** Formulario del límite; `stock` trae el valor actual y `canEdit` indica si quien mira puede cambiarlo. */
export function LimitForm({ farmId, stock, canEdit }: { farmId: string; stock: FarmStockResponse; canEdit: boolean }) {
  const qc = useQueryClient();
  const [limit, setLimit] = useState(shown(stock.maxUaPerHa));
  useEffect(() => setLimit(shown(stock.maxUaPerHa)), [stock.maxUaPerHa]);
  const limitOk = limit.trim() !== "" && num(limit) >= MAX_UA_PER_HA_LIMITS.min && num(limit) <= MAX_UA_PER_HA_LIMITS.max;
  const save = useMutation({
    mutationFn: () => put(`/org/farms/${farmId}/livestock-settings`, { maxUaPerHa: num(limit) }),
    onSuccess: () => {
      toast(t("ui.toast.limitSaved"));
      return qc.invalidateQueries({ queryKey: ["stock", farmId] });
    },
  });
  return (
    <Form className="flex max-w-xl flex-col gap-3 border-t border-linea pt-4" onSubmit={() => { if (limitOk) save.mutate(); }}>
      <Field label={t("ui.herd.limitLabel")} hint={t("ui.herd.limitHint")}>
        <Input inputMode="decimal" className="w-32" value={limit} disabled={!canEdit} onChange={(e) => setLimit(e.target.value)} />
      </Field>
      {stock.maxUaIsDefault && <p className="text-sm text-tinta-2">{t("ui.herd.limitIsDefault")}</p>}
      {canEdit ? (
        <div>
          <Button variant="primary" type="submit" disabled={!limitOk || save.isPending}>
            {t("ui.common.save")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-tinta-2">{t("ui.alert.settingsOnlyOwner")}</p>
      )}
      {save.error ? <ErrorBox error={save.error} /> : null}
    </Form>
  );
}
