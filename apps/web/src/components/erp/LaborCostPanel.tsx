/** Costo de la labor propia frente al contratista del mismo servicio (E-23). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CONTRACTOR_SERVICES } from "@yvy/shared";
import { del, get, put } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { Button, DataTable, EmptyState, ErrorBox, Field, Input, Modal, Select, Spinner, toast, type Column } from "../ui";
import { SectionButton } from "./SectionButton";
import { useMachines } from "./MachinesPanel";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions, RowMenu } from "./adminSlot";

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
  const machines = useMachines();
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
  const list = rows.data ?? [];
  const hasHours = (machines.data ?? []).some((m) => m.meterKind === "hours");
  const newBtn = (
    <Button variant="primary" onClick={() => setEditing("new")}>
      {t("ui.laborNew")}
    </Button>
  );
  const cols: Column<Row>[] = [
    {
      id: "machine",
      header: t("ui.laborMachine"),
      cell: (r) => (
        <>
          {r.machine}
          <span className="block text-meta font-normal text-tinta-2">{tk(`ui.contractorService_${r.service}`)}</span>
        </>
      ),
    },
    { id: "fuel", header: t("ui.laborFuel"), align: "right", hideBelow: "lg", cell: (r) => fmtGs(r.own.fuelPerHour) },
    { id: "operator", header: t("ui.laborOperator"), align: "right", hideBelow: "lg", cell: (r) => fmtGs(r.own.operatorPerHour) },
    { id: "depr", header: t("ui.laborDepreciation"), align: "right", hideBelow: "lg", cell: (r) => fmtGs(r.own.depreciationPerHour) },
    { id: "hour", header: t("ui.laborOwnHour"), align: "right", hideBelow: "sm", cell: (r) => <span className="font-medium">{fmtGs(r.own.totalPerHour)}</span> },
    { id: "ha", header: t("ui.laborOwnHa"), align: "right", cell: (r) => <span className="font-medium">{r.own.perHa === null ? "—" : fmtGs(r.own.perHa)}</span> },
    {
      id: "contractor",
      header: t("ui.laborContractor"),
      hideBelow: "md",
      cell: (r) =>
        r.contractor ? (
          <>
            {r.contractor.name}
            <span className="num block text-meta text-tinta-2">{r.contractor.perHa !== null ? `${fmtGs(r.contractor.perHa)} / ha` : `${fmtGs(r.contractor.perHour ?? 0)} / h`}</span>
          </>
        ) : (
          <span className="text-tinta-2">{t("ui.laborNoContractor")}</span>
        ),
    },
    {
      id: "verdict",
      header: t("ui.laborVerdict"),
      hideBelow: "md",
      cell: (r) =>
        r.verdict ? (
          <span className={r.verdict.cheaper === "own" ? "text-accion" : "text-trigo-texto"}>
            {t(r.verdict.cheaper === "own" ? "ui.laborOwnCheaper" : "ui.laborContractorCheaper", { n: fmtGs(Math.abs(r.verdict.savingPyg)), unit: r.verdict.basis === "ha" ? "ha" : "h" })}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "_a",
      header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>,
      align: "right",
      width: "3rem",
      cell: (r) => <RowMenu name={r.machine} onEdit={() => setEditing(profiles.data?.find((p) => p.machineId === r.machineId) ?? null)} onDelete={() => remove.mutate(r.machineId)} />,
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      {list.length > 0 && <HeaderActions>{newBtn}</HeaderActions>}
      {list.length === 0 ? (
        <EmptyState title={t("ui.laborEmptyTitle")} action={hasHours ? newBtn : <SectionButton to="machines" primary>{t("ui.laborGoMachines")}</SectionButton>}>
          {hasHours ? t("ui.laborEmptyHint") : t("ui.laborEmptyNoMachines")}
        </EmptyState>
      ) : (
        <>
          <ExportableTable name="mano-de-obra">
            <DataTable columns={cols} rows={list} rowKey={(r) => r.machineId} caption={t("ui.adminSection_labor")} />
          </ExportableTable>
          <p className="text-meta text-tinta-2">{t("ui.laborNote")}</p>
        </>
      )}
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
