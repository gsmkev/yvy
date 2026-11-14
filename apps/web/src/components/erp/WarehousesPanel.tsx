/** Depósitos por estancia: galpón, tanque de combustible o silo (E-10). */
import { WAREHOUSE_TYPES } from "@yvy/shared";
import { t, tk } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import { MasterPanel, useErpList, type FieldDef } from "./MasterPanel";

export interface Warehouse {
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
      label: t("ui.warehouseFarm"),
      type: "select",
      required: true,
      initial: farms.data?.[0]?.id ?? "",
      options: (farms.data ?? []).map((f) => ({ value: f.id, label: f.name })),
    },
    { key: "name", label: t("ui.warehouseName"), required: true, maxLength: 80 },
    {
      key: "type",
      label: t("ui.warehouseType"),
      type: "select",
      initial: "shed",
      options: WAREHOUSE_TYPES.map((k) => ({ value: k, label: tk(`ui.warehouseType_${k}`) })),
    },
  ];
  return (
    <MasterPanel<Warehouse>
      path="warehouses"
      newLabel={t("ui.warehouseNew")}
      name={(w) => w.name}
      fields={fields}
      columns={[
        { header: t("ui.warehouseName"), cell: (w) => <span className="font-medium">{w.name}</span> },
        { header: t("ui.warehouseType"), cell: (w) => tk(`ui.warehouseType_${w.type}`) },
        { header: t("ui.warehouseFarm"), cell: (w) => farms.data?.find((f) => f.id === w.farmId)?.name ?? "" },
        { header: t("ui.warehouseDefault"), cell: (w) => (w.isDefault ? t("ui.warehouseDefaultYes") : "") },
      ]}
    />
  );
}
