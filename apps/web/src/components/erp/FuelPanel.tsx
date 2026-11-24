/** Combustible: cargas por máquina y litros por hora. Las cargas descuentan el stock y cargan el costo solas. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { newId, noonAsuncion, RECORD_SCHEMA_VERSION, localDate, type PushResponse } from "@yvy/shared";
import { get, post, withQs } from "../../lib/api";
import { fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtQty } from "../../lib/money";
import { useFarms } from "../../lib/queries";
import { Button, type Column, DataTable, EmptyState, ErrorBox, Field, FilterBar, Form, FormFooter, Input, Modal, Select, Spinner, toast } from "../ui";
import { useMachines } from "./MachinesPanel";
import { HeaderActions, useTableExport } from "./adminSlot";

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

/** Cargas de combustible por máquina y litros por hora. */
export function FuelPanel() {
  const [f, setF] = useState({ farmId: "", from: "", to: "" });
  const [loading, setLoading] = useState(false);
  const farms = useFarms();
  const exp = useTableExport("combustible");
  const q = useQuery({
    queryKey: ["erp", "fuel", f],
    queryFn: () =>
      get<MachineFuel[]>(
        withQs("/org/erp/fuel/report", {
          farmId: f.farmId || undefined,
          from: f.from || undefined,
          to: f.to || undefined,
        }),
      ),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const rows = q.data ?? [];
  const filtered = !!(f.farmId || f.from || f.to);
  const newButton = (
    <Button variant="primary" onClick={() => setLoading(true)}>
      {t("ui.fuel.new")}
    </Button>
  );
  const columns: Column<MachineFuel>[] = [
    { id: "machine", header: t("ui.machine.name"), cell: (m) => m.name, sort: (a, b) => a.name.localeCompare(b.name) },
    { id: "loads", header: t("ui.fuel.loads"), align: "right", hideBelow: "sm", cell: (m) => m.loads },
    { id: "liters", header: t("ui.fuel.liters"), align: "right", cell: (m) => fmtQty(m.liters, "l"), sort: (a, b) => a.liters - b.liters },
    { id: "meter", header: t("ui.fuel.meterRange"), align: "right", hideBelow: "md", cell: (m) => (m.firstMeter !== null && m.lastMeter !== null ? `${fmtNum(m.firstMeter)} a ${fmtNum(m.lastMeter)}` : "") },
    { id: "rate", header: t("ui.fuel.rate"), align: "right", cell: (m) => (m.litersPerUnit === null ? "" : `${fmtQty(m.litersPerUnit)} ${m.meterKind === "hours" ? t("ui.fuel.perHour") : t("ui.fuel.per100km")}`) },
  ];
  const hasData = rows.length > 0 || filtered;
  return (
    <div className="flex flex-col gap-4">
      {hasData && (
        <>
          <HeaderActions>{newButton}</HeaderActions>
          {rows.length > 0 && exp.menu}
          <FilterBar>
            <Field label={t("ui.cost.farm")}>
              <Select value={f.farmId} onChange={set("farmId")} options={[{ value: "", label: t("ui.cost.all") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
            </Field>
            <Field label={t("ui.cost.from")}>
              <Input type="date" value={f.from} onChange={set("from")} />
            </Field>
            <Field label={t("ui.cost.to")}>
              <Input type="date" value={f.to} onChange={set("to")} />
            </Field>
          </FilterBar>
        </>
      )}
      {q.isLoading && <Spinner />}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {q.data && (
        <div ref={exp.ref}>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(m) => m.machineId ?? m.name}
            caption={t("ui.admin.section_fuel")}
            empty={
              filtered ? (
                <EmptyState compact title={t("ui.erp.empty")}>
                  {t("ui.fuel.empty")}
                </EmptyState>
              ) : (
                <EmptyState title={t("ui.empty.fuelTitle")} action={newButton}>
                  {t("ui.empty.fuelBody")}
                </EmptyState>
              )
            }
          />
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
      if (!farmId) throw new Error(t("ui.fuel.noFarm"));
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
      if (r?.status === "rejected") throw new Error(r.detail ?? t("ui.fuel.rejected"));
    },
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  const noMachine = { value: "", label: t("ui.fuel.otherMachine") };
  return (
    <Modal title={t("ui.fuel.new")} onClose={onClose}>
      <Form className="grid grid-cols-2 gap-3" onSubmit={() => save.mutate()}>
        <Field label={t("ui.cost.farm")}>
          <Select value={f.farmId || (farms.data?.[0]?.id ?? "")} onChange={set("farmId")} options={(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
        </Field>
        <Field label={t("ui.cost.date")}>
          <Input type="date" required value={f.date} onChange={set("date")} />
        </Field>
        <Field label={t("ui.machine.name")}>
          <Select value={f.machineId} onChange={set("machineId")} options={[noMachine, ...(machines.data ?? []).map((m) => ({ value: m.id, label: `${m.name} (${tk(`ui.machine.type_${m.type}`)})` }))]} />
        </Field>
        {!f.machineId && (
          <Field label={t("ui.fuel.machineName")}>
            <Input required value={f.machine} onChange={set("machine")} maxLength={80} />
          </Field>
        )}
        <Field label={t("ui.fuel.liters")}>
          <Input type="number" required min={0} step="any" value={f.liters} onChange={set("liters")} />
        </Field>
        <Field label={t("ui.machine.meter")}>
          <Input type="number" min={0} step="any" value={f.meter} onChange={set("meter")} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
