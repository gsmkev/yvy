import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BASE_MOISTURE_PCT, CROPS, grainNet } from "@yvy/shared";
import { del, get, post } from "../lib/api";
import { fmtIsoDate, fmtNum, toIso } from "../lib/format";
import { t, tk } from "../lib/i18n";
import type { Plot } from "../lib/types";
import { Button, ConfirmModal, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "./ui";

interface Delivery {
  id: string;
  plotId: string | null;
  plotName: string | null;
  crop: (typeof CROPS)[number];
  ticket: string;
  silo: string;
  deliveredOn: string;
  grossKg: number;
  moisturePct: number | null;
  netKg: number;
}
interface DeliveriesResponse {
  rows: Delivery[];
  byPlot: { plotId: string; plotName: string; grossKg: number; netKg: number; deliveries: number; harvestTons: number | null }[];
}

const tons = (kg: number) => `${fmtNum(Math.round(kg / 10) / 100)} t`;
const toNum = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/** Entregas de grano a acopio por lote (A-23): ticket, silo, humedad, descuentos y toneladas netas. */
export function DeliveriesPanel({ farmId, plots }: { farmId: string; plots: Plot[] }) {
  const q = useQuery({ queryKey: ["deliveries", farmId], queryFn: () => get<DeliveriesResponse>(`/org/farms/${farmId}/deliveries`) });
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Delivery | null>(null);
  const remove = useMutation({
    mutationFn: (d: Delivery) => del(`/org/deliveries/${d.id}`),
    onSuccess: () => {
      setRemoving(null);
      toast(t("ui.delivDeleted"));
      qc.invalidateQueries({ queryKey: ["deliveries", farmId] });
    },
  });
  const d = q.data;
  return (
    <section aria-labelledby="deliv-h" className="flex flex-col gap-3">
      <h3 id="deliv-h" className="font-serif text-lg font-semibold">
        {t("ui.delivTitle")}
      </h3>
      <p className="text-sm text-tinta-2">{t("ui.delivIntro")}</p>
      <div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          {t("ui.delivAdd")}
        </Button>
      </div>
      {q.isLoading && <Spinner rows={3} h={40} />}
      {q.error && <ErrorBox error={q.error} />}
      {d && d.rows.length === 0 && <Empty title={t("ui.delivTitle")}>{t("ui.delivNone")}</Empty>}
      {d && d.byPlot.length > 0 && (
        <ul className="divide-y divide-linea border-y border-linea text-sm">
          {d.byPlot.map((p) => (
            <li key={p.plotId} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
              <span className="font-medium">{p.plotName}</span>
              <span className="num text-tinta-2">
                {t("ui.delivByPlot", { n: p.deliveries, net: tons(p.netKg), gross: tons(p.grossKg) })}
                {p.harvestTons !== null ? ` · ${t("ui.delivHarvested", { t: fmtNum(p.harvestTons) })}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {d && d.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-tinta-2">
              <tr>
                <th className="py-2 pr-3 font-medium">{t("ui.delivDate")}</th>
                <th className="py-2 pr-3 font-medium">{t("ui.delivTicket")}</th>
                <th className="py-2 pr-3 font-medium">{t("ui.delivSilo")}</th>
                <th className="py-2 pr-3 font-medium">{t("ui.plot")}</th>
                <th className="num py-2 pr-3 text-right font-medium">{t("ui.delivGross")}</th>
                <th className="num py-2 pr-3 text-right font-medium">{t("ui.delivMoisture")}</th>
                <th className="num py-2 pr-3 text-right font-medium">{t("ui.delivNet")}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-linea border-y border-linea">
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td className="num py-2.5 pr-3">{fmtIsoDate(r.deliveredOn)}</td>
                  <td className="num py-2.5 pr-3">{r.ticket}</td>
                  <td className="py-2.5 pr-3">{r.silo}</td>
                  <td className="py-2.5 pr-3">{r.plotName ?? "—"}</td>
                  <td className="num py-2.5 pr-3 text-right">{tons(r.grossKg)}</td>
                  <td className="num py-2.5 pr-3 text-right">{r.moisturePct === null ? "—" : `${fmtNum(r.moisturePct)} %`}</td>
                  <td className="num py-2.5 pr-3 text-right font-medium">{tons(r.netKg)}</td>
                  <td className="py-2.5 text-right">
                    <button className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-peligro hover:underline" onClick={() => setRemoving(r)}>
                      {t("ui.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <DeliveryModal farmId={farmId} plots={plots} onClose={() => setAdding(false)} />}
      {removing && (
        <ConfirmModal
          title={t("ui.delivTitle")}
          message={t("ui.delivConfirmDelete", { ticket: removing.ticket })}
          confirmLabel={t("ui.delete")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </section>
  );
}

function DeliveryModal({ farmId, plots, onClose }: { farmId: string; plots: Plot[]; onClose: () => void }) {
  const qc = useQueryClient();
  const cropPlots = plots.filter((p) => p.kind === "crop");
  const [f, setF] = useState({
    plotId: cropPlots[0]?.id ?? "",
    crop: ((cropPlots[0]?.crop as (typeof CROPS)[number] | null) ?? "soja") as (typeof CROPS)[number],
    ticket: "",
    silo: "",
    deliveredOn: toIso(Date.now()),
    grossKg: "",
    moisturePct: "",
    baseMoisturePct: String(BASE_MOISTURE_PCT[(cropPlots[0]?.crop as (typeof CROPS)[number] | null) ?? "soja"]),
    impuritiesPct: "0",
    otherKg: "0",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const gross = toNum(f.grossKg);
  const preview =
    gross && gross > 0
      ? grainNet({
          grossKg: gross,
          moisturePct: toNum(f.moisturePct),
          baseMoisturePct: toNum(f.baseMoisturePct) ?? 13,
          impuritiesPct: toNum(f.impuritiesPct) ?? 0,
          otherKg: toNum(f.otherKg) ?? 0,
        })
      : null;
  const save = useMutation({
    mutationFn: () =>
      post(`/org/farms/${farmId}/deliveries`, {
        plotId: f.plotId || null,
        crop: f.crop,
        ticket: f.ticket,
        silo: f.silo,
        deliveredOn: f.deliveredOn,
        grossKg: gross,
        moisturePct: toNum(f.moisturePct),
        baseMoisturePct: toNum(f.baseMoisturePct),
        impuritiesPct: toNum(f.impuritiesPct) ?? 0,
        otherKg: toNum(f.otherKg) ?? 0,
      }),
    onSuccess: () => {
      toast(t("ui.delivSaved"));
      qc.invalidateQueries({ queryKey: ["deliveries", farmId] });
      onClose();
    },
  });
  return (
    <Modal title={t("ui.delivAdd")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.plot")}>
            <Select value={f.plotId} onChange={set("plotId")} options={[{ value: "", label: "—" }, ...cropPlots.map((p) => ({ value: p.id, label: p.name }))]} />
          </Field>
          <Field label={t("ui.crop")}>
            <Select
              value={f.crop}
              onChange={(e) => {
                const crop = e.target.value as (typeof CROPS)[number];
                setF({ ...f, crop, baseMoisturePct: String(BASE_MOISTURE_PCT[crop]) });
              }}
              options={CROPS.map((c) => ({ value: c, label: tk(`fields.crop_${c}`) }))}
            />
          </Field>
          <Field label={t("ui.delivTicket")}>
            <Input required value={f.ticket} onChange={set("ticket")} maxLength={40} />
          </Field>
          <Field label={t("ui.delivDate")}>
            <Input type="date" required value={f.deliveredOn} onChange={set("deliveredOn")} />
          </Field>
        </div>
        <Field label={t("ui.delivSilo")}>
          <Input required value={f.silo} onChange={set("silo")} maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.delivGrossKg")}>
            <Input required inputMode="decimal" className="num" value={f.grossKg} onChange={set("grossKg")} />
          </Field>
          <Field label={t("ui.delivMoisturePct")}>
            <Input inputMode="decimal" className="num" value={f.moisturePct} onChange={set("moisturePct")} />
          </Field>
          <Field label={t("ui.delivBasePct")}>
            <Input required inputMode="decimal" className="num" value={f.baseMoisturePct} onChange={set("baseMoisturePct")} />
          </Field>
          <Field label={t("ui.delivImpurities")}>
            <Input inputMode="decimal" className="num" value={f.impuritiesPct} onChange={set("impuritiesPct")} />
          </Field>
          <Field label={t("ui.delivOtherKg")}>
            <Input inputMode="decimal" className="num" value={f.otherKg} onChange={set("otherKg")} />
          </Field>
        </div>
        {preview && (
          <p className="num text-sm">
            {t("ui.delivPreview", { net: tons(preview.netKg), moist: fmtNum(preview.moistureKg), imp: fmtNum(preview.impuritiesKg) })}
          </p>
        )}
        {save.error && <ErrorBox error={save.error} />}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("ui.save")}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
