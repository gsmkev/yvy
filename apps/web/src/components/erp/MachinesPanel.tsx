/** Maquinaria y vehículos con horómetro u odómetro (E-03). */
import { MACHINE_TYPES, METER_KINDS } from "@yvy/shared";
import { fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import { MasterPanel, useErpList, type FieldDef } from "./MasterPanel";

export interface Machine {
  id: string;
  farmId: string | null;
  name: string;
  type: (typeof MACHINE_TYPES)[number];
  brand: string | null;
  model: string | null;
  year: number | null;
  meterKind: (typeof METER_KINDS)[number];
  meterValue: number;
}

export const useMachines = () => useErpList<Machine>("machines");

export function MachinesPanel() {
  const farms = useFarms();
  const fields: FieldDef[] = [
    { key: "name", label: t("ui.machineName"), required: true, maxLength: 80 },
    {
      key: "type",
      label: t("ui.machineType"),
      type: "select",
      initial: "tractor",
      options: MACHINE_TYPES.map((k) => ({ value: k, label: tk(`ui.machineType_${k}`) })),
    },
    { key: "brand", label: t("ui.machineBrand"), maxLength: 60 },
    { key: "model", label: t("ui.machineModel"), maxLength: 60 },
    { key: "year", label: t("ui.machineYear"), type: "number", min: 1950, max: 2100, step: "1" },
    {
      key: "meterKind",
      label: t("ui.machineMeterKind"),
      type: "select",
      initial: "hours",
      options: METER_KINDS.map((k) => ({ value: k, label: tk(`ui.meterKind_${k}`) })),
    },
    { key: "meterValue", label: t("ui.machineMeter"), type: "number", min: 0, hint: t("ui.machineMeterHint") },
    {
      key: "farmId",
      label: t("ui.machineFarm"),
      type: "select",
      options: [{ value: "", label: t("ui.machineAllFarms") }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))],
    },
  ];
  return (
    <MasterPanel<Machine>
      path="machines"
      newLabel={t("ui.machineNew")}
      name={(m) => m.name}
      fields={fields}
      columns={[
        { header: t("ui.machineName"), cell: (m) => <span className="font-medium">{m.name}</span> },
        { header: t("ui.machineType"), cell: (m) => tk(`ui.machineType_${m.type}`) },
        { header: t("ui.machineBrandModel"), cell: (m) => [m.brand, m.model, m.year].filter(Boolean).join(" ") },
        {
          header: t("ui.machineMeter"),
          right: true,
          cell: (m) => `${fmtNum(m.meterValue)} ${m.meterKind === "hours" ? "h" : "km"}`,
        },
        { header: t("ui.machineFarm"), cell: (m) => farms.data?.find((f) => f.id === m.farmId)?.name ?? t("ui.machineAllFarms") },
      ]}
    />
  );
}
