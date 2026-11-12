/** Administración (ADR 0004): maestros, stock, costos y márgenes. Solo dueño y administradores. */
import type { ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BudgetPanel } from "../components/erp/BudgetPanel";
import { ContractorsPanel } from "../components/erp/ContractorsPanel";
import { CostsPanel } from "../components/erp/CostsPanel";
import { StaffPanel } from "../components/erp/StaffPanel";
import { StockPanel } from "../components/erp/StockPanel";
import { WarehousesPanel } from "../components/erp/WarehousesPanel";
import { ExchangeRatesPanel } from "../components/erp/ExchangeRatesPanel";
import { FuelPanel } from "../components/erp/FuelPanel";
import { OrdersPanel } from "../components/erp/OrdersPanel";
import { PurchasesPanel } from "../components/erp/PurchasesPanel";
import { ResultsPanel } from "../components/erp/ResultsPanel";
import { MachinesPanel } from "../components/erp/MachinesPanel";
import { GrainSalesPanel } from "../components/erp/GrainSalesPanel";
import { LaborCostPanel } from "../components/erp/LaborCostPanel";
import { MaintenancePanel } from "../components/erp/MaintenancePanel";
import { MinStockPanel } from "../components/erp/MinStockPanel";
import { PartiesPanel } from "../components/erp/PartiesPanel";
import { ProductsPanel } from "../components/ProductsPanel";
import { Tabs } from "../components/ui";
import { t, type MessageKey } from "../lib/i18n";
import { useMe } from "../lib/queries";

interface Section {
  id: string;
  label: MessageKey;
  render: () => ReactNode;
}

/** Cada ítem del ERP suma su sección acá. */
const SECTIONS: Section[] = [
  { id: "products", label: "ui.adminSection_products", render: () => <ProductsPanel canEdit /> },
  { id: "parties", label: "ui.adminSection_parties", render: () => <PartiesPanel /> },
  { id: "machines", label: "ui.adminSection_machines", render: () => <MachinesPanel /> },
  { id: "warehouses", label: "ui.adminSection_warehouses", render: () => <WarehousesPanel /> },
  { id: "purchases", label: "ui.adminSection_purchases", render: () => <PurchasesPanel /> },
  { id: "grain", label: "ui.adminSection_grain", render: () => <GrainSalesPanel /> },
  { id: "stock", label: "ui.adminSection_stock", render: () => <StockPanel /> },
  { id: "minstock", label: "ui.adminSection_minstock", render: () => <MinStockPanel /> },
  { id: "maintenance", label: "ui.adminSection_maintenance", render: () => <MaintenancePanel /> },
  { id: "labor", label: "ui.adminSection_labor", render: () => <LaborCostPanel /> },
  { id: "staff", label: "ui.adminSection_staff", render: () => <StaffPanel /> },
  { id: "fuel", label: "ui.adminSection_fuel", render: () => <FuelPanel /> },
  { id: "orders", label: "ui.adminSection_orders", render: () => <OrdersPanel /> },
  { id: "budget", label: "ui.adminSection_budget", render: () => <BudgetPanel /> },
  { id: "results", label: "ui.adminSection_results", render: () => <ResultsPanel /> },
  { id: "contractors", label: "ui.adminSection_contractors", render: () => <ContractorsPanel /> },
  { id: "rates", label: "ui.adminSection_rates", render: () => <ExchangeRatesPanel /> },
  { id: "costs", label: "ui.adminSection_costs", render: () => <CostsPanel /> },
];

export function AdminPage() {
  const me = useMe();
  const navigate = useNavigate();
  const { s } = useSearch({ strict: false }) as { s?: string };
  const current = SECTIONS.find((x) => x.id === s) ?? SECTIONS[0]!;
  const allowed = me.data?.role === "owner" || me.data?.role === "admin";
  if (me.data && !allowed) return <div className="mx-auto max-w-3xl p-4 text-sm text-tinta-2">{t("ui.adminNoAccess")}</div>;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold">{t("ui.adminTitle")}</h1>
        <p className="text-sm text-tinta-2">{t("ui.adminIntro")}</p>
      </div>
      <Tabs
        tabs={SECTIONS.map((x) => ({ id: x.id, label: t(x.label) }))}
        value={current.id}
        onChange={(id) => navigate({ to: "/administracion", search: { s: id } })}
      />
      {allowed && <div key={current.id}>{current.render()}</div>}
    </div>
  );
}
