/** Diálogo de alta y edición de una ración. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LIMITS, rationPctTotal } from "@yvy/shared";
import { post, put } from "../../../lib/api";
import { fmtNum } from "../../../lib/format";
import { t } from "../../../lib/i18n";
import { useProducts } from "../../../lib/products";
import { Button, Field, Form, FormFooter, Input, Modal, Select, toast } from "../../ui";
import type { Ration } from "./types";

/** Alta y edición de una ración; `ration` es null para una nueva. */
export function RationModal({ ration, onClose }: { ration: Ration | null; onClose: () => void }) {
  const products = useProducts();
  const qc = useQueryClient();
  const kgProducts = (products.data ?? []).filter((p) => p.unit === "kg");
  const [name, setName] = useState(ration?.name ?? "");
  const [rows, setRows] = useState<{ productId: string; pctDm: string; dmPct: string }[]>(
    ration?.items.map((i) => ({ productId: i.productId, pctDm: String(i.pctDm), dmPct: String(i.dmPct) })) ?? [{ productId: "", pctDm: "", dmPct: "100" }],
  );
  const n = (v: string) => Number(v.replace(",", "."));
  const items = rows.filter((r) => r.productId).map((r) => ({ productId: r.productId, pctDm: n(r.pctDm), dmPct: n(r.dmPct) || 100 }));
  const total = rationPctTotal(items.map((i) => ({ pctDm: Number.isFinite(i.pctDm) ? i.pctDm : 0 })));
  const save = useMutation({
    mutationFn: () => (ration ? put(`/org/erp/feedlot/rations/${ration.id}`, { name, items }) : post("/org/erp/feedlot/rations", { name, items })),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp", "feedlot"] });
      onClose();
    },
  });
  const set = (i: number, k: "productId" | "pctDm" | "dmPct", v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <Modal title={ration ? t("ui.feedlot.rationEdit") : t("ui.feedlot.rationNew")} onClose={onClose}>
      <Form className="flex flex-col gap-3" onSubmit={() => save.mutate()}>
        <Field label={t("ui.feedlot.rationName")}>
          <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {kgProducts.length === 0 && <p className="text-sm text-peligro">{t("ui.feedlot.noKgProducts")}</p>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_5.5rem_5.5rem] items-end gap-2">
            <Field label={i === 0 ? t("ui.feedlot.ingredient") : ""}>
              <Select
                value={r.productId}
                onChange={(e) => set(i, "productId", e.target.value)}
                options={[{ value: "", label: "—" }, ...kgProducts.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </Field>
            <Field label={i === 0 ? t("ui.feedlot.pctDm") : ""}>
              <Input inputMode="decimal" className="num" value={r.pctDm} onChange={(e) => set(i, "pctDm", e.target.value)} />
            </Field>
            <Field label={i === 0 ? t("ui.feedlot.productDm") : ""}>
              <Input inputMode="decimal" className="num" value={r.dmPct} onChange={(e) => set(i, "dmPct", e.target.value)} />
            </Field>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button variant="quiet" disabled={rows.length >= LIMITS.feedlot.maxRationItems} onClick={() => setRows([...rows, { productId: "", pctDm: "", dmPct: "100" }])}>
            {t("ui.feedlot.addIngredient")}
          </Button>
          <p className={`num text-sm ${Math.abs(total - 100) <= LIMITS.feedlot.pctTolerance ? "" : "text-peligro"}`}>{t("ui.feedlot.pctTotal", { n: fmtNum(total) })}</p>
        </div>
        <p className="text-xs text-tinta-2">{t("ui.feedlot.pctHint")}</p>
        <FormFooter error={save.error} disabled={save.isPending || items.length === 0} label={t("ui.common.save")} />

      </Form>
    </Modal>
  );
}
