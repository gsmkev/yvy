/** Diálogo para cargar una línea de presupuesto: alcance (campaña, lote o cultivo), categoría, actividad y monto. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ACTIVITIES, COST_CATEGORIES, CROPS } from "@yvy/shared";
import { post } from "../../../lib/api";
import { t, tk } from "../../../lib/i18n";
import { useFarm, useFarms } from "../../../lib/queries";
import { Field, Form, FormFooter, Input, Modal, Select, toast } from "../../ui";

/** Alta de una línea de presupuesto para la campaña `seasonId`. */
export function LineModal({ seasonId, onClose }: { seasonId: string; onClose: () => void }) {
  const farms = useFarms();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"season" | "plot" | "crop">("season");
  const [farmId, setFarmId] = useState("");
  const farm = useFarm(farmId, !!farmId);
  const [plotId, setPlotId] = useState("");
  const [crop, setCrop] = useState<string>(CROPS[0]);
  const [activity, setActivity] = useState("");
  const [category, setCategory] = useState("input");
  const [amount, setAmount] = useState("");
  const save = useMutation({
    mutationFn: () =>
      post("/org/erp/budget-lines", {
        seasonId,
        plotId: scope === "plot" ? plotId || null : null,
        crop: scope === "crop" ? crop : null,
        activity: activity || null,
        category,
        amountPyg: Number(amount),
      }),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={t("ui.budget.new")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.budget.scope")}>
          <Select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            options={[
              { value: "season", label: t("ui.budget.whole") },
              { value: "plot", label: t("ui.budget.plot") },
              { value: "crop", label: t("ui.budget.crop") },
            ]}
          />
        </Field>
        {scope === "crop" && (
          <Field label={t("ui.budget.crop")}>
            <Select value={crop} onChange={(e) => setCrop(e.target.value)} options={CROPS.map((c) => ({ value: c, label: tk(`fields.crop.${c}`) }))} />
          </Field>
        )}
        {scope === "plot" && (
          <>
            <Field label={t("ui.cost.farm")}>
              <Select value={farmId} onChange={(e) => { setFarmId(e.target.value); setPlotId(""); }} options={[{ value: "", label: "—" }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
            </Field>
            <Field label={t("ui.cost.plot")}>
              <Select value={plotId} onChange={(e) => setPlotId(e.target.value)} options={[{ value: "", label: "—" }, ...(farm.data?.plots ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
            </Field>
          </>
        )}
        <Field label={t("ui.cost.category")}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} options={COST_CATEGORIES.map((c) => ({ value: c, label: tk(`ui.cost.category_${c}`) }))} />
        </Field>
        <Field label={t("ui.cost.activity")}>
          <Select value={activity} onChange={(e) => setActivity(e.target.value)} options={[{ value: "", label: t("ui.cost.all") }, ...ACTIVITIES.map((a) => ({ value: a, label: tk(`ui.activity.${a}`) }))]} />
        </Field>
        <Field label={t("ui.budget.planned")}>
          <Input required type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending || (scope === "plot" && !plotId)} />
      </Form>
    </Modal>
  );
}
