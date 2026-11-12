/** Costo de la labor propia frente al contratista del mismo servicio (E-23). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CONTRACTOR_SERVICES } from "@yvy/shared";
import { del, get, put } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { Button, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../ui";
import { useMachines } from "./MachinesPanel";
import { ExportableTable } from "../ExportableTable";

interface Row {
  machineId: string;
  machine: string;
  service: (typeof CONTRACTOR_SERVICES)[number];
  own: { fuelPerHour: number; operatorPerHour: number; depreciationPerHour: number; totalPerHour: number; perHa: number | null };
  fuelLitersPerHour: number | null;
  fuelPricePyg: number | null;
  contractor: { id: string; name: string; perHa: number | null; perHour: number | null } | null;
  verdict: { basis: "ha" | "hour"; savingPyg: number; cheaper: "own" | "contractor" } | null;
}
interface Profile {
  machineId: string;
  service: (typeof CONTRACTOR_SERVICES)[number];
  purchasePricePyg: number;
  residualPyg: number;
  lifeHours: number;
  operatorPerHourPyg: number;
  haPerHour: number | null;
  fuelLitersPerHour: number | null;
  fuelPricePyg: number | null;
}

export function LaborCostPanel() {
  const rows = useQuery({ queryKey: ["erp", "labor-cost"], queryFn: () => get<Row[]>("/org/erp/labor-cost") });
  const profiles = useQuery({ queryKey: ["erp", "machine-costs"], queryFn: () => get<Profile[]>("/org/erp/machine-costs") });
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/machine-costs/${id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (rows.isLoading || profiles.isLoading) return <Spinner />;
  if (rows.error) return <ErrorBox error={rows.error} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tinta-2">{t("ui.laborIntro")}</p>
      <div>
        <Button variant="primary" onClick={() => setEditing("new")}>
          {t("ui.laborNew")}
        </Button>
      </div>
      {(rows.data ?? []).length === 0 ? (
        <Empty>{t("ui.erpEmpty")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <ExportableTable name="mano-de-obra">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-tinta-2">
                  <th className="py-2 pr-4 font-medium">{t("ui.laborMachine")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.laborFuel")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.laborOperator")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.laborDepreciation")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.laborOwnHour")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("ui.laborOwnHa")}</th>
                  <th className="py-2 pr-4 font-medium">{t("ui.laborContractor")}</th>
                  <th className="py-2 font-medium">{t("ui.laborVerdict")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(rows.data ?? []).map((r) => (
                  <tr key={r.machineId} className="border-b border-linea align-top">
                    <td className="py-2.5 pr-4">
                      <div className="font-medium">{r.machine}</div>
                      <div className="text-tinta-2">{tk(`ui.contractorService_${r.service}`)}</div>
                    </td>
                    <td className="num py-2.5 pr-4 text-right">{fmtGs(r.own.fuelPerHour)}</td>
                    <td className="num py-2.5 pr-4 text-right">{fmtGs(r.own.operatorPerHour)}</td>
                    <td className="num py-2.5 pr-4 text-right">{fmtGs(r.own.depreciationPerHour)}</td>
                    <td className="num py-2.5 pr-4 text-right font-medium">{fmtGs(r.own.totalPerHour)}</td>
                    <td className="num py-2.5 pr-4 text-right font-medium">{r.own.perHa === null ? "—" : fmtGs(r.own.perHa)}</td>
                    <td className="py-2.5 pr-4">
                      {r.contractor ? (
                        <>
                          <div>{r.contractor.name}</div>
                          <div className="num text-tinta-2">
                            {r.contractor.perHa !== null ? `${fmtGs(r.contractor.perHa)} / ha` : `${fmtGs(r.contractor.perHour ?? 0)} / h`}
                          </div>
                        </>
                      ) : (
                        <span className="text-tinta-2">{t("ui.laborNoContractor")}</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {r.verdict ? (
                        <span className={r.verdict.cheaper === "own" ? "text-accion" : "text-trigo-texto"}>
                          {t(r.verdict.cheaper === "own" ? "ui.laborOwnCheaper" : "ui.laborContractorCheaper", {
                            n: fmtGs(Math.abs(r.verdict.savingPyg)),
                            unit: r.verdict.basis === "ha" ? "ha" : "h",
                          })}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap text-tinta-2">
                      <button
                        className="mr-4 cursor-pointer underline-offset-4 hover:text-surco hover:underline"
                        onClick={() => setEditing(profiles.data?.find((p) => p.machineId === r.machineId) ?? null)}
                      >
                        {t("ui.erpEdit")}
                      </button>
                      <button className="cursor-pointer underline-offset-4 hover:text-peligro hover:underline" onClick={() => remove.mutate(r.machineId)}>
                        {t("ui.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExportableTable>
        </div>
      )}
      <p className="text-xs text-tinta-2">{t("ui.laborNote")}</p>
      {editing && <ProfileModal row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProfileModal({ row, onClose }: { row: Profile | null; onClose: () => void }) {
  const machines = useMachines();
  const qc = useQueryClient();
  const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  const [f, setF] = useState({
    machineId: row?.machineId ?? (machines.data ?? []).find((m) => m.meterKind === "hours")?.id ?? "",
    service: row?.service ?? "spraying",
    purchase: str(row?.purchasePricePyg),
    residual: str(row?.residualPyg),
    life: str(row?.lifeHours),
    operator: str(row?.operatorPerHourPyg),
    haPerHour: str(row?.haPerHour),
    lph: str(row?.fuelLitersPerHour),
    price: str(row?.fuelPricePyg),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const save = useMutation({
    mutationFn: () =>
      put(`/org/erp/machine-costs/${f.machineId}`, {
        service: f.service,
        purchasePricePyg: num(f.purchase) ?? 0,
        residualPyg: num(f.residual) ?? 0,
        lifeHours: num(f.life) ?? 0,
        operatorPerHourPyg: num(f.operator) ?? 0,
        haPerHour: num(f.haPerHour),
        fuelLitersPerHour: num(f.lph),
        fuelPricePyg: num(f.price),
      }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const hours = (machines.data ?? []).filter((m) => m.meterKind === "hours");
  return (
    <Modal title={t("ui.laborNew")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.laborMachine")} hint={t("ui.laborHoursOnly")}>
          <Select value={f.machineId} onChange={set("machineId")} options={hours.map((m) => ({ value: m.id, label: m.name }))} />
        </Field>
        <Field label={t("ui.laborService")}>
          <Select value={f.service} onChange={set("service")} options={CONTRACTOR_SERVICES.map((k) => ({ value: k, label: tk(`ui.contractorService_${k}`) }))} />
        </Field>
        <Field label={t("ui.laborPurchase")}>
          <Input type="number" min={0} step="any" value={f.purchase} onChange={set("purchase")} />
        </Field>
        <Field label={t("ui.laborResidual")}>
          <Input type="number" min={0} step="any" value={f.residual} onChange={set("residual")} />
        </Field>
        <Field label={t("ui.laborLife")}>
          <Input type="number" min={0} step="any" value={f.life} onChange={set("life")} />
        </Field>
        <Field label={t("ui.laborOperator")}>
          <Input type="number" min={0} step="any" value={f.operator} onChange={set("operator")} />
        </Field>
        <Field label={t("ui.laborHaPerHour")}>
          <Input type="number" min={0} step="any" value={f.haPerHour} onChange={set("haPerHour")} />
        </Field>
        <Field label={t("ui.laborLph")} hint={t("ui.laborLphHint")}>
          <Input type="number" min={0} step="any" value={f.lph} onChange={set("lph")} />
        </Field>
        <Field label={t("ui.laborPrice")} hint={t("ui.laborPriceHint")}>
          <Input type="number" min={0} step="any" value={f.price} onChange={set("price")} />
        </Field>
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending || !f.machineId}>
            {t("ui.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
