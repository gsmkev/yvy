/** Combustible (E-16): cargas por máquina y litros por hora. Las cargas descuentan el stock y cargan el costo solas. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { newId, noonAsuncion, RECORD_SCHEMA_VERSION, localDate, type PushResponse } from "@yvy/shared";
import { get, post, qs } from "../../lib/api";
import { fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtQty } from "../../lib/money";
import { useFarms } from "../../lib/queries";
import { Button, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../ui";
import { useMachines } from "./MachinesPanel";

interface MachineFuel {
  machineId: string | null;
  name: string;
  meterKind: "hours" | "km";
  loads: number;
  liters: number;
  firstMeter: number | null;
  lastMeter: number | null;
  litersPerUnit: number | null;
}

export function FuelPanel() {
  const [f, setF] = useState({ farmId: "", from: "", to: "" });
  const [loading, setLoading] = useState(false);
  const farms = useFarms();
  const q = useQuery({
    queryKey: ["erp", "fuel", f],
    queryFn: () => get<MachineFuel[]>(`/org/erp/fuel/report${qs({ farmId: f.farmId || undefined, from: f.from || undefined, to: f.to || undefined })}`),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tinta-2">{t("ui.fuelIntro")}</p>
      <div>
        <Button variant="primary" onClick={() => setLoading(true)}>
          {t("ui.fuelNew")}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("ui.costFarm")}>
          <Select value={f.farmId} onChange={set("farmId")} options={[{ value: "", label: t("ui.costAll") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <Field label={t("ui.costFrom")}>
          <Input type="date" value={f.from} onChange={set("from")} />
        </Field>
        <Field label={t("ui.costTo")}>
          <Input type="date" value={f.to} onChange={set("to")} />
        </Field>
      </div>
      {q.isLoading && <Spinner />}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {q.data && q.data.length === 0 && <Empty>{t("ui.fuelEmpty")}</Empty>}
      {q.data && q.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-tinta-2">
                <th className="py-2 pr-4 font-medium">{t("ui.machineName")}</th>
                <th className="py-2 pr-4 text-right font-medium">{t("ui.fuelLoads")}</th>
                <th className="py-2 pr-4 text-right font-medium">{t("ui.fuelLiters")}</th>
                <th className="py-2 pr-4 text-right font-medium">{t("ui.fuelMeterRange")}</th>
                <th className="py-2 text-right font-medium">{t("ui.fuelRate")}</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((m) => (
                <tr key={m.machineId ?? m.name} className="border-b border-linea">
                  <td className="py-2.5 pr-4 font-medium">{m.name}</td>
                  <td className="num py-2.5 pr-4 text-right">{m.loads}</td>
                  <td className="num py-2.5 pr-4 text-right">{fmtQty(m.liters, "l")}</td>
                  <td className="num py-2.5 pr-4 text-right">
                    {m.firstMeter !== null && m.lastMeter !== null ? `${fmtNum(m.firstMeter)} a ${fmtNum(m.lastMeter)}` : ""}
                  </td>
                  <td className="num py-2.5 text-right">
                    {m.litersPerUnit === null ? "" : `${fmtQty(m.litersPerUnit)} ${m.meterKind === "hours" ? t("ui.fuelPerHour") : t("ui.fuelPer100km")}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loading && <FuelLoadModal onClose={() => setLoading(false)} />}
    </div>
  );
}

/** Registra la carga como un registro de campo (por /sync/push, igual que la app): el ERP hace el resto. */
function FuelLoadModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const farms = useFarms();
  const machines = useMachines();
  const [f, setF] = useState({ farmId: "", machineId: "", machine: "", date: localDate(Date.now()), liters: "", meter: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: async () => {
      const machine = machines.data?.find((m) => m.id === f.machineId);
      const farmId = f.farmId || farms.data?.[0]?.id;
      if (!farmId) throw new Error(t("ui.fuelNoFarm"));
      const data = {
        ...(machine ? { machineId: machine.id } : {}),
        machine: machine?.name ?? f.machine.trim(),
        liters: Number(f.liters),
        ...(f.meter ? { meterValue: Number(f.meter) } : {}),
      };
      const res = await post<PushResponse>("/sync/push", {
        deviceId: "web",
        mutations: [
          {
            mutationId: newId(),
            kind: "records.upsert",
            row: {
              id: newId(),
              farmId,
              plotId: null,
              poiId: null,
              kind: "fuel_load",
              data,
              schemaVersion: RECORD_SCHEMA_VERSION,
              lon: null,
              lat: null,
              gpsAccuracyM: null,
              capturedAt: Math.min(noonAsuncion(f.date), Date.now() - 1000),
            },
          },
        ],
      });
      const r = res.results[0];
      if (r?.status === "rejected") throw new Error(r.detail ?? t("ui.fuelRejected"));
    },
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const noMachine = { value: "", label: t("ui.fuelOtherMachine") };
  return (
    <Modal title={t("ui.fuelNew")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.costFarm")}>
          <Select value={f.farmId || (farms.data?.[0]?.id ?? "")} onChange={set("farmId")} options={(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
        </Field>
        <Field label={t("ui.costDate")}>
          <Input type="date" required value={f.date} onChange={set("date")} />
        </Field>
        <Field label={t("ui.machineName")}>
          <Select value={f.machineId} onChange={set("machineId")} options={[noMachine, ...(machines.data ?? []).map((m) => ({ value: m.id, label: `${m.name} (${tk(`ui.machineType_${m.type}`)})` }))]} />
        </Field>
        {!f.machineId && (
          <Field label={t("ui.fuelMachineName")}>
            <Input required value={f.machine} onChange={set("machine")} maxLength={80} />
          </Field>
        )}
        <Field label={t("ui.fuelLiters")}>
          <Input type="number" required min={0} step="any" value={f.liters} onChange={set("liters")} />
        </Field>
        <Field label={t("ui.machineMeter")}>
          <Input type="number" min={0} step="any" value={f.meter} onChange={set("meter")} />
        </Field>
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("ui.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
