/** Compras: lista por estado; cada compra abre su detalle. /org/erp/purchases (solo dueño y administrador). */
import { useState } from "react";
import { router, type Href } from "expo-router";
import { Plus } from "lucide-react-native";
import { t, type Currency, type PurchaseStatus } from "@yvy/shared";
import { AdminGate, k, useParties } from "../../../src/office/adminKit";
import { isoShort, NoSignalNote } from "../../../src/office/erpCommon";
import { fmtMoney } from "../../../src/office/money";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { OnlineState } from "../../../src/office/state";
import { DataList, FilterChips } from "../../../src/office/ui";
import { useOnline } from "../../../src/office/useOnline";

/** Fila de una compra tal como la devuelve el servidor. */
export interface PurchaseRow {
  id: string;
  partyId: string | null;
  orderDate: string;
  currency: Currency;
  totalAmount: number;
  invoiceNumber: string | null;
  receivedAt: string | null;
  photoPath: string | null;
  status: PurchaseStatus;
}

const STATUSES = ["ordered", "invoiced", "received", "complete"] as const;

/** Listado de compras. */
export default function Purchases() {
  const q = useOnline<PurchaseRow[]>("/org/erp/purchases");
  const parties = useParties();
  const [status, setStatus] = useState<"all" | PurchaseStatus>("all");
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "—";
  const sorted = [...(q.data ?? [])].sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const rows = sorted.filter((p) => status === "all" || p.status === status);
  return (
    <AdminGate need="manage" title={t("ui.admin.section_purchases")}>
      <OfficeScreen
        title={t("ui.admin.section_purchases")}
        query={q}
        onRefresh={async () => {
          await Promise.all([q.refresh(), parties.refresh()]);
        }}
        action={{ label: t("ui.purch.new"), icon: Plus, onPress: () => router.push("/office/admin/purchase-new" as Href) }}
      >
        <NoSignalNote />
        <OnlineState query={q} empty={{ title: t("ui.empty.purchTitle"), hint: t("ui.empty.purchBody") }}>
          {(all) => (
            <>
              <FilterChips<"all" | PurchaseStatus>
                value={status}
                onChange={setStatus}
                options={[{ value: "all", label: t("ui.cost.all"), count: all.length }, ...STATUSES.map((s) => ({ value: s, label: t(k(`ui.purch.status_${s}`)) }))]}
              />
              <DataList
                rows={rows}
                keyOf={(p) => p.id}
                title={(p) => party(p.partyId)}
                subtitle={(p) => [isoShort(p.orderDate), t(k(`ui.purch.status_${p.status}`)), p.photoPath ? t("office.adm.withPhoto") : null].filter(Boolean).join(" · ")}
                right={(p) => fmtMoney(p.totalAmount, p.currency)}
                onPress={(p) => router.push({ pathname: "/office/admin/purchase", params: { id: p.id } } as Href)}
                empty={{ title: t("ui.erp.empty") }}
              />
            </>
          )}
        </OnlineState>
      </OfficeScreen>
    </AdminGate>
  );
}
