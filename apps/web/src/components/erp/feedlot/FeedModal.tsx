/** Diálogo para registrar el suministro de una ración a un corral. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { localDate, newId, noonAsuncion, rationLines, RECORD_SCHEMA_VERSION, type PushResponse } from "@yvy/shared";
import { post } from "../../../lib/api";
import { fmtNum } from "../../../lib/format";
import { t } from "../../../lib/i18n";
import { useFarm, useFarms } from "../../../lib/queries";
import { useProducts } from "../../../lib/products";
import { Field, Form, FormFooter, Input, Modal, Select, toast } from "../../ui";
import type { Ration } from "./types";

interface FeedPush {
  farmId: string;
  plotId: string;
  ration: Ration;
  kgDm: number;
  head: string;
  date: string;
  lines: { productId: string; name: string; kg: number }[];
}

/** Manda el registro de suministro por el mismo canal de sincronización que el celular. */
async function pushFeed({ farmId, plotId, ration, kgDm, head, date, lines }: FeedPush) {
  const res = await post<PushResponse>("/sync/push", {
    deviceId: "web",
    mutations: [
      {
        mutationId: newId(),
        kind: "records.upsert",
        row: {
          id: newId(),
          farmId,
          plotId,
          poiId: null,
          kind: "feed",
          data: { rationId: ration.id, ration: ration.name, kgDm, ...(head ? { head: Number(head) } : {}), items: lines },
          schemaVersion: RECORD_SCHEMA_VERSION,
          lon: null,
          lat: null,
          gpsAccuracyM: null,
          capturedAt: Math.min(noonAsuncion(date), Date.now() - 1000),
        },
      },
    ],
  });
  const r = res.results[0];
  if (r?.status === "rejected") throw new Error(r.detail ?? t("ui.fuel.rejected"));
}

/** Registra el suministro de una ración a un corral. */
export function FeedModal({ rations, onClose }: { rations: Ration[]; onClose: () => void }) {
  const farms = useFarms();
  const products = useProducts();
  const qc = useQueryClient();
  const [f, setF] = useState({ farmId: "", plotId: "", rationId: rations[0]?.id ?? "", kgDm: "", head: "", date: localDate(Date.now()) });
  const farmId = f.farmId || farms.data?.[0]?.id || "";
  const farm = useFarm(farmId, !!farmId);
  const corrals = (farm.data?.plots ?? []).filter((p) => p.kind === "pasture");
  const plotId = f.plotId || corrals[0]?.id || "";
  const ration = rations.find((r) => r.id === f.rationId);
  const kgDm = Number(f.kgDm.replace(",", "."));
  const lines = ration && kgDm > 0 ? rationLines(ration.items, kgDm) : [];
  const nameOf = (id: string) => products.data?.find((p) => p.id === id)?.name ?? "—";
  const save = useMutation({
    mutationFn: async () => {
      if (ration) await pushFeed({ farmId, plotId, ration, kgDm, head: f.head, date: f.date, lines: lines.map((l) => ({ productId: l.productId, name: nameOf(l.productId), kg: l.kg })) });
    },
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={t("ui.feedlot.feed")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.cost.farm")}>
          <Select value={farmId} onChange={(e) => setF({ ...f, farmId: e.target.value, plotId: "" })} options={(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
        </Field>
        <Field label={t("ui.feedlot.corral")}>
          <Select value={plotId} onChange={(e) => setF({ ...f, plotId: e.target.value })} options={corrals.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <Field label={t("ui.feedlot.ration")}>
          <Select value={f.rationId} onChange={(e) => setF({ ...f, rationId: e.target.value })} options={rations.map((r) => ({ value: r.id, label: r.name }))} />
        </Field>
        <Field label={t("ui.cost.date")}>
          <Input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label={t("ui.feedlot.kgDm")}>
          <Input type="number" required min={0} step="any" value={f.kgDm} onChange={(e) => setF({ ...f, kgDm: e.target.value })} />
        </Field>
        <Field label={t("ui.feedlot.head")}>
          <Input type="number" min={1} step={1} value={f.head} onChange={(e) => setF({ ...f, head: e.target.value })} />
        </Field>
        {corrals.length === 0 && <p className="sm:col-span-2 text-sm text-tinta-2">{t("ui.feedlot.noCorrals")}</p>}
        {lines.length > 0 && (
          <ul className="num col-span-2 text-sm text-tinta-2">
            {lines.map((l) => (
              <li key={l.productId}>
                {nameOf(l.productId)}: {fmtNum(l.kg)} kg
              </li>
            ))}
          </ul>
        )}
        <FormFooter error={save.error} disabled={save.isPending || !plotId || !ration || lines.length === 0} />
      </Form>
    </Modal>
  );
}
