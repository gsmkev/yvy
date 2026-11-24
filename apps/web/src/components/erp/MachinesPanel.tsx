/** Maquinaria y vehículos con horómetro u odómetro. */
import { MACHINE_TYPES, METER_KINDS } from "@yvy/shared";
import { fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import { useErpList, type FieldDef } from "./MasterPanel";
import { RecordList } from "./RecordList";

interface Machine {
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
    { key: "name", label: t("ui.machine.name"), required: true, maxLength: 80 },
    {
      key: "type",
      label: t("ui.machine.type"),
      type: "select",
      initial: "tractor",
      options: MACHINE_TYPES.map((k) => ({ value: k, label: tk(`ui.machine.type_${k}`) })),
    },
    { key: "brand", label: t("ui.machine.brand"), maxLength: 60 },
    { key: "model", label: t("ui.machine.model"), maxLength: 60 },
    { key: "year", label: t("ui.machine.year"), type: "number", min: 1950, max: 2100, step: "1" },
    {
      key: "meterKind",
      label: t("ui.machine.meterKind"),
      type: "select",
      initial: "hours",
      options: METER_KINDS.map((k) => ({ value: k, label: tk(`ui.meter.kind_${k}`) })),
    },
    { key: "meterValue", label: t("ui.machine.meter"), type: "number", min: 0, hint: t("ui.machine.meterHint") },
    {
      key: "farmId",
      label: t("ui.machine.farm"),
      type: "select",
      options: [{ value: "", label: t("ui.machine.allFarms") }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))],
    },
  ];
  return (
    <RecordList<Machine>
      path="machines"
      exportName="maquinaria"
      emptyTitle={t("ui.machine.emptyTitle")}
      emptyHint={t("ui.machine.emptyHint")}
      newLabel={t("ui.machine.new")}
      name={(m) => m.name}
      fields={fields}
      columns={[
        { header: t("ui.machine.name"), cell: (m) => <span className="font-medium">{m.name}</span> },
        { header: t("ui.machine.type"), cell: (m) => tk(`ui.machine.type_${m.type}`) },
        { header: t("ui.machine.brandModel"), hideBelow: "md", cell: (m) => [m.brand, m.model, m.year].filter(Boolean).join(" ") },
        {
          header: t("ui.machine.meter"),
          right: true,
          cell: (m) => `${fmtNum(m.meterValue)} ${m.meterKind === "hours" ? "h" : "km"}`,
        },
        { header: t("ui.machine.farm"), hideBelow: "lg", cell: (m) => farms.data?.find((f) => f.id === m.farmId)?.name ?? t("ui.machine.allFarms") },
      ]}
    />
  );
}
