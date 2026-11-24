/** Depósitos por estancia: galpón, tanque de combustible o silo (E-10). */
import { WAREHOUSE_TYPES } from "@yvy/shared";
import { t, tk } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import { MasterPanel, useErpList, type FieldDef } from "./MasterPanel";

interface Warehouse {
  id: string;
  farmId: string;
  name: string;
  type: (typeof WAREHOUSE_TYPES)[number];
  isDefault: boolean;
}

export const useWarehouses = () => useErpList<Warehouse>("warehouses");

export function WarehousesPanel() {
  const farms = useFarms();
  const fields: FieldDef[] = [
    {
      key: "farmId",
      label: t("ui.warehouse.farm"),
      type: "select",
      required: true,
      initial: farms.data?.[0]?.id ?? "",
      options: (farms.data ?? []).map((f) => ({ value: f.id, label: f.name })),
    },
    { key: "name", label: t("ui.warehouse.name"), required: true, maxLength: 80 },
    {
      key: "type",
      label: t("ui.warehouse.type"),
      type: "select",
      initial: "shed",
      options: WAREHOUSE_TYPES.map((k) => ({ value: k, label: tk(`ui.warehouse.type_${k}`) })),
    },
  ];
  return (
    <MasterPanel<Warehouse>
      path="warehouses"
      exportName="depositos"
      empty={{ title: t("ui.empty.warehousesTitle"), body: t("ui.empty.warehousesBody") }}
      newLabel={t("ui.warehouse.new")}
      name={(w) => w.name}
      fields={fields}
      columns={[
        { header: t("ui.warehouse.name"), cell: (w) => <span className="font-medium">{w.name}</span> },
        { header: t("ui.warehouse.type"), cell: (w) => tk(`ui.warehouse.type_${w.type}`) },
        { header: t("ui.warehouse.farm"), hideBelow: "sm", cell: (w) => farms.data?.find((f) => f.id === w.farmId)?.name ?? "" },
        { header: t("ui.warehouse.default"), cell: (w) => (w.isDefault ? t("ui.warehouse.defaultYes") : "") },
      ]}
    />
  );
}
