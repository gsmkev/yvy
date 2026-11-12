import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SOIL_PARAMS, soilAverage, soilLevel, type SoilParam } from "@yvy/shared";
import { del, get, post } from "../lib/api";
import { fmtIsoDate, fmtNum, toIso } from "../lib/format";
import { t, tk } from "../lib/i18n";
import type { Plot } from "../lib/types";
import { Button, ConfirmModal, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "./ui";

export interface SoilSample {
  id: string;
  plotId: string | null;
  plotName: string | null;
  pointLabel: string | null;
  lon: number | null;
  lat: number | null;
  sampledOn: string;
  depthCm: number;
  lab: string | null;
  ph: number | null;
  pMgKg: number | null;
  kCmolKg: number | null;
  omPct: number | null;
  note: string | null;
}

export const useSoilSamples = (farmId: string) =>
  useQuery({ queryKey: ["soil", farmId], queryFn: () => get<SoilSample[]>(`/org/farms/${farmId}/soil-samples`) });

const toNum = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/** Análisis de suelo de laboratorio por lote o punto de muestreo (A-30). */
export function SoilPanel({ farmId, plots }: { farmId: string; plots: Plot[] }) {
  const q = useSoilSamples(farmId);
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<SoilSample | null>(null);
  const remove = useMutation({
    mutationFn: (x: SoilSample) => del(`/org/soil-samples/${x.id}`),
    onSuccess: () => {
      setRemoving(null);
      toast(t("ui.soilDeleted"));
      qc.invalidateQueries({ queryKey: ["soil", farmId] });
    },
  });
  const rows = q.data ?? [];
  const avg = soilAverage(rows);
  const cell = (p: SoilParam, v: number | null) => {
    const lvl = soilLevel(p, v);
    return v === null ? "—" : `${fmtNum(v)} (${t(`ui.soilLevel_${lvl}` as "ui.soilLevel_low")})`;
  };
  return (
    <section aria-labelledby="soil-h" className="flex flex-col gap-3">
      <h3 id="soil-h" className="font-serif text-lg font-semibold">
        {t("ui.soilTitle")}
      </h3>
      <p className="text-sm text-tinta-2">{t("ui.soilIntro")}</p>
      <div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          {t("ui.soilAdd")}
        </Button>
      </div>
      {q.isLoading && <Spinner rows={3} h={40} />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && rows.length === 0 && <Empty title={t("ui.soilTitle")}>{t("ui.soilNone")}</Empty>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-tinta-2">
              <tr>
                <th className="py-2 pr-3 font-medium">{t("ui.soilWhere")}</th>
                <th className="py-2 pr-3 font-medium">{t("ui.soilDate")}</th>
                {SOIL_PARAMS.map((p) => (
                  <th key={p} className="py-2 pr-3 font-medium">
                    {t(`ui.soilParam_${p}` as "ui.soilParam_ph")}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-linea border-y border-linea">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 pr-3">
                    {[r.plotName, r.pointLabel].filter(Boolean).join(" · ") || t("ui.soilFarmWide")}
                    <span className="block text-xs text-tinta-2">
                      {[`${r.depthCm} cm`, r.lab].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="num py-2.5 pr-3">{fmtIsoDate(r.sampledOn)}</td>
                  {SOIL_PARAMS.map((p) => (
                    <td key={p} className="num py-2.5 pr-3">
                      {cell(p, r[p])}
                    </td>
                  ))}
                  <td className="py-2.5 text-right">
                    <button
                      className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-peligro hover:underline"
                      onClick={() => setRemoving(r)}
                    >
                      {t("ui.delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length > 1 && (
                <tr className="font-medium">
                  <td className="py-2.5 pr-3">{t("ui.soilAverage")}</td>
                  <td />
                  {SOIL_PARAMS.map((p) => (
                    <td key={p} className="num py-2.5 pr-3">
                      {cell(p, avg[p])}
                    </td>
                  ))}
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-tinta-2">{t("ui.soilNote")}</p>
      {adding && <SoilModal farmId={farmId} plots={plots} onClose={() => setAdding(false)} />}
      {removing && (
        <ConfirmModal
          title={t("ui.soilTitle")}
          message={t("ui.soilConfirmDelete")}
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

function SoilModal({ farmId, plots, onClose }: { farmId: string; plots: Plot[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    plotId: "",
    pointLabel: "",
    sampledOn: toIso(Date.now()),
    depthCm: "20",
    lab: "",
    ph: "",
    pMgKg: "",
    kCmolKg: "",
    omPct: "",
    lon: "",
    lat: "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () =>
      post(`/org/farms/${farmId}/soil-samples`, {
        plotId: f.plotId || null,
        pointLabel: f.pointLabel.trim() || null,
        sampledOn: f.sampledOn,
        depthCm: Number(f.depthCm) || 20,
        lab: f.lab.trim() || null,
        ph: toNum(f.ph),
        pMgKg: toNum(f.pMgKg),
        kCmolKg: toNum(f.kCmolKg),
        omPct: toNum(f.omPct),
        lon: toNum(f.lon),
        lat: toNum(f.lat),
      }),
    onSuccess: () => {
      toast(t("ui.soilSaved"));
      qc.invalidateQueries({ queryKey: ["soil", farmId] });
      onClose();
    },
  });
  return (
    <Modal title={t("ui.soilAdd")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.plot")}>
          <Select
            value={f.plotId}
            onChange={set("plotId")}
            options={[{ value: "", label: t("ui.soilFarmWide") }, ...plots.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.soilPoint")}>
            <Input value={f.pointLabel} onChange={set("pointLabel")} maxLength={60} />
          </Field>
          <Field label={t("ui.soilDate")}>
            <Input type="date" required value={f.sampledOn} onChange={set("sampledOn")} />
          </Field>
          <Field label={t("ui.soilDepth")}>
            <Input inputMode="numeric" value={f.depthCm} onChange={set("depthCm")} />
          </Field>
          <Field label={t("ui.soilLab")}>
            <Input value={f.lab} onChange={set("lab")} maxLength={120} />
          </Field>
          {SOIL_PARAMS.map((p) => (
            <Field key={p} label={t(`ui.soilParam_${p}` as "ui.soilParam_ph")}>
              <Input inputMode="decimal" className="num" value={f[p]} onChange={set(p)} />
            </Field>
          ))}
          <Field label={t("ui.soilLon")}>
            <Input inputMode="decimal" className="num" value={f.lon} onChange={set("lon")} />
          </Field>
          <Field label={t("ui.soilLat")}>
            <Input inputMode="decimal" className="num" value={f.lat} onChange={set("lat")} />
          </Field>
        </div>
        <p className="text-xs text-tinta-2">{tk("ui.soilFormHint")}</p>
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
