/** Venta de granos: contratos, entregas con ticket y liquidaciones. */
import { useState } from "react";
import { CROPS, CURRENCIES } from "@yvy/shared";
import { t, tk } from "../../lib/i18n";
import { useParties } from "./PartiesPanel";
import { Button, DataTable, EmptyState, ErrorBox, Spinner, Tabs } from "../ui";
import { RowModal, type FieldDef } from "./RowModal";
import { useSeasonList } from "./costs/useCosts";
import { HeaderActions, useTableExport } from "./adminSlot";
import { GrainActionModal } from "./grain/GrainActionModal";
import { contractColumns, deliveryColumns, settlementColumns } from "./grain/grainColumns";
import { useGrainData, type Contract } from "./grain/useGrainData";

type Tab = "contracts" | "deliveries" | "settlements";

const EXPORT_NAME: Record<Tab, string> = { contracts: "contratos-de-granos", deliveries: "entregas-de-granos", settlements: "liquidaciones" };

const blank = { value: "", label: "—" };

/** Campos del alta de un contrato. */
function useContractFields(): FieldDef[] {
  const parties = useParties();
  const seasons = useSeasonList();
  return [
    { key: "partyId", label: t("ui.grain.buyer"), type: "select", options: [blank, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))] },
    { key: "number", label: t("ui.grain.number"), maxLength: 40 },
    { key: "crop", label: t("ui.grain.crop"), type: "select", initial: "soja", options: CROPS.map((c) => ({ value: c, label: tk(`fields.crop.${c}`) })) },
    { key: "seasonId", label: t("ui.cost.season"), type: "select", options: [blank, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))] },
    { key: "tons", label: t("ui.grain.tons"), type: "number", required: true, min: 0 },
    { key: "currency", label: t("ui.common.currency"), type: "select", initial: "PYG", options: CURRENCIES.map((c) => ({ value: c, label: c })) },
    { key: "priceMinor", label: t("ui.grain.price"), type: "money", required: true, currencyKey: "currency" },
    { key: "deliveryFrom", label: t("ui.grain.from"), type: "date" },
    { key: "deliveryTo", label: t("ui.grain.to"), type: "date" },
  ];
}

/** Tabla de la pestaña elegida: contratos, entregas o liquidaciones. */
function GrainTable({ tab, data, party, onAction }: { tab: Tab; data: ReturnType<typeof useGrainData>; party: (id: string | null) => string; onAction: (kind: "delivery" | "settlement", c: Contract) => void }) {
  const { contracts, deliveries, settlements, removeDelivery, removeSettlement } = data;
  if (tab === "contracts") {
    return <DataTable columns={contractColumns(party, onAction)} rows={contracts.data ?? []} rowKey={(c) => c.id} caption={t("ui.grain.tabContracts")} />;
  }
  if (tab === "deliveries") {
    const empty = <EmptyState compact title={t("ui.erp.empty")}>{t("ui.empty.deliveriesBody")}</EmptyState>;
    return <DataTable columns={deliveryColumns(contracts.data, deliveries.data ?? [], removeDelivery.mutate)} rows={deliveries.data ?? []} rowKey={(d) => d.id} caption={t("ui.grain.deliveries")} empty={empty} />;
  }
  const empty = <EmptyState compact title={t("ui.erp.empty")}>{t("ui.empty.settlementsBody")}</EmptyState>;
  return <DataTable columns={settlementColumns(contracts.data, removeSettlement.mutate)} rows={settlements.data ?? []} rowKey={(l) => l.id} caption={t("ui.grain.settlements")} empty={empty} />;
}

/** Contratos, entregas con ticket y liquidaciones de venta de granos. */
export function GrainSalesPanel() {
  const data = useGrainData();
  const { contracts, deliveries, settlements, removeDelivery, removeSettlement } = data;
  const parties = useParties();
  const fields = useContractFields();
  const [newContract, setNewContract] = useState(false);
  const [action, setAction] = useState<{ kind: "delivery" | "settlement"; contract: Contract } | null>(null);
  const [tab, setTab] = useState<Tab>("contracts");
  const exp = useTableExport(EXPORT_NAME[tab]);
  if (contracts.isLoading) return <Spinner />;
  if (contracts.error) return <ErrorBox error={contracts.error} />;
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "";
  const counts = { contracts: contracts.data?.length ?? 0, deliveries: deliveries.data?.length ?? 0, settlements: settlements.data?.length ?? 0 };
  const newButton = (
    <Button variant="primary" onClick={() => setNewContract(true)}>
      {t("ui.grain.new")}
    </Button>
  );
  const empty = counts.contracts === 0;
  return (
    <div className="flex flex-col gap-4">
      {!empty && <HeaderActions>{newButton}</HeaderActions>}
      {empty ? (
        <EmptyState title={t("ui.empty.grainTitle")} action={newButton}>
          {t("ui.empty.grainBody")}
        </EmptyState>
      ) : (
        <>
          {counts[tab] > 0 && exp.menu}
          <Tabs
            tabs={[
              { id: "contracts", label: t("ui.grain.tabContracts"), count: counts.contracts },
              { id: "deliveries", label: t("ui.grain.deliveries"), count: counts.deliveries },
              { id: "settlements", label: t("ui.grain.settlements"), count: counts.settlements },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div ref={exp.ref}>
            <GrainTable tab={tab} data={data} party={party} onAction={(kind, contract) => setAction({ kind, contract })} />
          </div>
        </>
      )}
      {(removeDelivery.error || removeSettlement.error) && <ErrorBox error={removeDelivery.error ?? removeSettlement.error} />}
      {newContract && <RowModal title={t("ui.grain.new")} fields={fields} row={null} path="grain-contracts" onClose={() => setNewContract(false)} />}
      {action && <GrainActionModal kind={action.kind} contract={action.contract} onClose={() => setAction(null)} />}
    </div>
  );
}
