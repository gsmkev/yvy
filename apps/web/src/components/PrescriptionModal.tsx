import { useState } from "react";
import { isFieldRole } from "@yvy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DOSE_UNITS_FOR, localDate, type DoseUnit } from "@yvy/shared";
import { post } from "../lib/api";
import { t, tk } from "../lib/i18n";
import { useMembers, useSeasons } from "../lib/queries";
import type { Plot } from "../lib/types";
import { useProducts } from "./ProductsPanel";
import { Button, ErrorBox, Field, FormActions, Input, Modal, Select, toast } from "./ui";

interface Line {
  productId: string;
  dose: string;
  unit: DoseUnit;
}

/** Receta del agrónomo (A-11): lotes, productos y dosis → una tarea de aplicación por lote para el empleado. */
export function PrescriptionModal({
  farmId,
  plots,
  onClose,
}: {
  farmId: string;
  plots: Plot[];
  onClose: () => void;
}) {
  const products = useProducts();
  const members = useMembers();
  const seasons = useSeasons(farmId);
  const qc = useQueryClient();
  const catalog = products.data ?? [];
  const [lines, setLines] = useState<Line[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [f, setF] = useState({ assigneeId: "", dueDate: localDate(Date.now()), volumeLHa: "", seasonId: "", note: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const cropPlots = plots.filter((p) => p.kind === "crop");
  const addLine = () => {
    const p = catalog[0];
    if (p) setLines([...lines, { productId: p.id, dose: "", unit: DOSE_UNITS_FOR[p.unit][0] }]);
  };
  const patchLine = (i: number, v: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...v } : l)));
  const ready =
    picked.length > 0 &&
    f.assigneeId !== "" &&
    lines.length > 0 &&
    lines.every((l) => Number(l.dose.replace(",", ".")) > 0);

  const create = useMutation({
    mutationFn: () =>
      post("/org/prescriptions", {
        farmId,
        plotIds: picked,
        assigneeId: f.assigneeId,
        dueDate: f.dueDate,
        prescription: {
          seasonId: f.seasonId || undefined,
          volumeLHa: f.volumeLHa ? Number(f.volumeLHa.replace(",", ".")) : undefined,
          note: f.note.trim() || undefined,
          products: lines.map((l) => ({
            productId: l.productId,
            name: catalog.find((p) => p.id === l.productId)?.name ?? "",
            dose: Number(l.dose.replace(",", ".")),
            unit: l.unit,
          })),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast(t("ui.toastPrescriptionSaved", { n: picked.length }));
      onClose();
    },
  });

  return (
    <Modal title={t("ui.prescriptionNew")} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) create.mutate();
        }}
      >
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">{t("ui.prescriptionPlots")}</legend>
          <div className="max-h-40 overflow-auto border-y border-linea">
            {cropPlots.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 border-b border-linea py-1.5 text-sm last:border-b-0">
                <input
                  type="checkbox"
                  checked={picked.includes(p.id)}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))}
                />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("ui.prescriptionProducts")}</span>
          {catalog.length === 0 && <p className="text-sm text-tinta-2">{t("ui.prescriptionNoProducts")}</p>}
          {lines.map((l, i) => {
            const base = catalog.find((p) => p.id === l.productId)?.unit ?? "l";
            return (
              <div key={i} className="grid grid-cols-[1fr_90px_100px_auto] items-center gap-2">
                <Select
                  aria-label={t("ui.productName")}
                  value={l.productId}
                  onChange={(e) => {
                    const p = catalog.find((x) => x.id === e.target.value);
                    patchLine(i, { productId: e.target.value, unit: p ? DOSE_UNITS_FOR[p.unit][0] : l.unit });
                  }}
                  options={catalog.map((p) => ({ value: p.id, label: p.name }))}
                />
                <Input
                  aria-label={t("ui.prescriptionDose")}
                  inputMode="decimal"
                  value={l.dose}
                  onChange={(e) => patchLine(i, { dose: e.target.value })}
                />
                <Select
                  aria-label={t("ui.productUnit")}
                  value={l.unit}
                  onChange={(e) => patchLine(i, { unit: e.target.value as DoseUnit })}
                  options={DOSE_UNITS_FOR[base].map((u) => ({ value: u, label: tk(`fields.doseUnit_${u}`) }))}
                />
                <button
                  type="button"
                  className="cursor-pointer text-sm text-tinta-2 underline-offset-4 hover:text-peligro hover:underline"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  {t("ui.delete")}
                </button>
              </div>
            );
          })}
          <div>
            <Button disabled={catalog.length === 0} onClick={addLine}>
              {t("ui.prescriptionAddProduct")}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.assignee")}>
            <Select
              required
              value={f.assigneeId}
              onChange={set("assigneeId")}
              options={[
                { value: "", label: "—" },
                ...(members.data ?? []).filter((m) => isFieldRole(m.role)).map((m) => ({ value: m.userId, label: m.fullName })),
              ]}
            />
          </Field>
          <Field label={t("ui.dueDate")}>
            <Input type="date" required value={f.dueDate} onChange={set("dueDate")} />
          </Field>
          <Field label={t("fields.volumeLHa")}>
            <Input inputMode="decimal" value={f.volumeLHa} onChange={set("volumeLHa")} />
          </Field>
          <Field label={t("ui.season")}>
            <Select
              value={f.seasonId}
              onChange={set("seasonId")}
              options={[{ value: "", label: "—" }, ...(seasons.data?.seasons ?? []).map((s) => ({ value: s.id, label: s.name }))]}
            />
          </Field>
        </div>
        <Field label={t("app.note")}>
          <Input value={f.note} onChange={set("note")} maxLength={2000} />
        </Field>
        <p className="text-xs text-tinta-2">{t("ui.prescriptionHint")}</p>
        {create.error && <ErrorBox error={create.error} />}
        <FormActions onCancel={onClose} disabled={!ready || create.isPending} label={t("ui.prescriptionCreate")} />
      </form>
    </Modal>
  );
}
