/** Administración: maestros, stock, costos y márgenes. Solo dueño y administradores. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { AccountantPanel } from "../components/erp/AccountantPanel";
import { BudgetPanel } from "../components/erp/BudgetPanel";
import { CashPanel } from "../components/erp/CashPanel";
import { CattlePanel } from "../components/erp/CattlePanel";
import { ContractorsPanel } from "../components/erp/ContractorsPanel";
import { CostsPanel } from "../components/erp/CostsPanel";
import { StaffPanel } from "../components/erp/StaffPanel";
import { StockPanel } from "../components/erp/StockPanel";
import { WarehousesPanel } from "../components/erp/WarehousesPanel";
import { ExchangeRatesPanel } from "../components/erp/ExchangeRatesPanel";
import { ExportPanel } from "../components/erp/ExportPanel";
import { FeedlotPanel } from "../components/erp/FeedlotPanel";
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
import { AdminSlotContext } from "../components/erp/adminSlot";
import { OverviewPanel } from "../components/erp/OverviewPanel";
import { Button, Page, Tabs } from "../components/ui";
import { ADMIN_GROUPS, groupOf } from "../lib/adminNav";
import { t, type MessageKey } from "../lib/i18n";
import { useMe } from "../lib/queries";

interface Section {
  id: string;
  label: MessageKey;
  render: () => ReactNode;
}

/** Cada ítem del ERP suma su sección acá. */
const SECTIONS: Section[] = [
  { id: "overview", label: "ui.admin.section_overview", render: () => <OverviewPanel /> },
  { id: "products", label: "ui.admin.section_products", render: () => <ProductsPanel canEdit /> },
  { id: "parties", label: "ui.admin.section_parties", render: () => <PartiesPanel /> },
  { id: "machines", label: "ui.admin.section_machines", render: () => <MachinesPanel /> },
  { id: "warehouses", label: "ui.admin.section_warehouses", render: () => <WarehousesPanel /> },
  { id: "purchases", label: "ui.admin.section_purchases", render: () => <PurchasesPanel /> },
  { id: "grain", label: "ui.admin.section_grain", render: () => <GrainSalesPanel /> },
  { id: "cattle", label: "ui.admin.section_cattle", render: () => <CattlePanel /> },
  { id: "cash", label: "ui.admin.section_cash", render: () => <CashPanel /> },
  { id: "stock", label: "ui.admin.section_stock", render: () => <StockPanel /> },
  { id: "minstock", label: "ui.admin.section_minstock", render: () => <MinStockPanel /> },
  { id: "maintenance", label: "ui.admin.section_maintenance", render: () => <MaintenancePanel /> },
  { id: "labor", label: "ui.admin.section_labor", render: () => <LaborCostPanel /> },
  { id: "staff", label: "ui.admin.section_staff", render: () => <StaffPanel /> },
  { id: "fuel", label: "ui.admin.section_fuel", render: () => <FuelPanel /> },
  { id: "feedlot", label: "ui.admin.section_feedlot", render: () => <FeedlotPanel /> },
  { id: "orders", label: "ui.admin.section_orders", render: () => <OrdersPanel /> },
  { id: "budget", label: "ui.admin.section_budget", render: () => <BudgetPanel /> },
  { id: "results", label: "ui.admin.section_results", render: () => <ResultsPanel /> },
  { id: "contractors", label: "ui.admin.section_contractors", render: () => <ContractorsPanel /> },
  { id: "accountant", label: "ui.admin.section_accountant", render: () => <AccountantPanel /> },
  { id: "export", label: "ui.admin.section_export", render: () => <ExportPanel /> },
  { id: "rates", label: "ui.admin.section_rates", render: () => <ExchangeRatesPanel /> },
  { id: "costs", label: "ui.admin.section_costs", render: () => <CostsPanel /> },
];

/** Pantalla de Administración con sus módulos y secciones; la sección va en la URL. */
export function AdminPage() {
  const me = useMe();
  const navigate = useNavigate();
  const { s } = useSearch({ strict: false }) as { s?: string };
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // Se abre por Resumen; un ?s= que no existe también cae ahí
  const current = SECTIONS.find((x) => x.id === s) ?? SECTIONS[0]!;
  const group = groupOf(current.id);
  const allowed = me.data?.role === "owner" || me.data?.role === "admin";
  if (me.data && !allowed) return <Page width="read"><p className="text-sm text-tinta-2">{t("ui.admin.noAccess")}</p></Page>;
  const go = (id: string) => navigate({ to: "/administracion", search: { s: id } });
  const label = (id: string) => t(SECTIONS.find((x) => x.id === id)!.label);
  return (
    <Page width="data" title={t("ui.admin.title")}>
      <div className="flex flex-col gap-3">
        <Tabs
          tabs={ADMIN_GROUPS.map((g) => ({ id: g.id, label: t(g.label) }))}
          value={group.id}
          onChange={(id) => go(ADMIN_GROUPS.find((g) => g.id === id)!.sections[0]!)}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {group.sections.length > 1 ? (
            <SectionPills label={t("ui.admin.sections", { module: t(group.label) })} items={group.sections.map((id) => ({ id, label: label(id) }))} value={current.id} onChange={go} />
          ) : (
            <span />
          )}
          <div ref={setSlot} className="flex shrink-0 items-center gap-2 empty:hidden print:hidden" />
        </div>
      </div>
      <AdminSlotContext.Provider value={{ el: slot }}>{allowed && <div key={current.id}>{current.render()}</div>}</AdminSlotContext.Provider>
    </Page>
  );
}

/** Secciones del módulo activo: botones segmentados que se desplazan de costado si no entran. */
function SectionPills({ label, items, value, onChange }: { label: string; items: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // La sección activa siempre queda a la vista, también al llegar con ?s= desde otro lugar
  useEffect(() => {
    document.getElementById(`pill-${value}`)?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [value]);
  return (
    <div ref={box} role="group" aria-label={label} className="-mx-4 flex min-w-0 gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <Button
          key={it.id}
          id={`pill-${it.id}`}
          size="sm"
          variant="quiet"
          aria-current={value === it.id ? "page" : undefined}
          onClick={() => onChange(it.id)}
          className={`shrink-0 whitespace-nowrap ${value === it.id ? "!bg-surco/[0.07] !text-surco" : ""}`}
        >
          {it.label}
        </Button>
      ))}
    </div>
  );
}
