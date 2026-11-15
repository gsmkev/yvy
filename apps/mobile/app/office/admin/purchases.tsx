/** Compras (función 117): lista por estado; cada compra abre su detalle. /org/erp/purchases (solo dueño y administrador). */
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

export default function Purchases() {
  const q = useOnline<PurchaseRow[]>("/org/erp/purchases");
  const parties = useParties();
  const [status, setStatus] = useState<"all" | PurchaseStatus>("all");
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "—";
  const sorted = [...(q.data ?? [])].sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const rows = sorted.filter((p) => status === "all" || p.status === status);
  return (
    <AdminGate need="manage" title={t("ui.adminSection_purchases")}>
      <OfficeScreen
        title={t("ui.adminSection_purchases")}
        query={q}
        onRefresh={async () => {
          await Promise.all([q.refresh(), parties.refresh()]);
        }}
        action={{ label: t("ui.purchNew"), icon: Plus, onPress: () => router.push("/office/admin/purchase-new" as Href) }}
      >
        <NoSignalNote />
        <OnlineState query={q} empty={{ title: t("ui.emptyPurchTitle"), hint: t("ui.emptyPurchBody") }}>
          {(all) => (
            <>
              <FilterChips<"all" | PurchaseStatus>
                value={status}
                onChange={setStatus}
                options={[{ value: "all", label: t("ui.costAll"), count: all.length }, ...STATUSES.map((s) => ({ value: s, label: t(k(`ui.purchStatus_${s}`)) }))]}
              />
              <DataList
                rows={rows}
                keyOf={(p) => p.id}
                title={(p) => party(p.partyId)}
                subtitle={(p) => [isoShort(p.orderDate), t(k(`ui.purchStatus_${p.status}`)), p.photoPath ? t("office.admWithPhoto") : null].filter(Boolean).join(" · ")}
                right={(p) => fmtMoney(p.totalAmount, p.currency)}
                onPress={(p) => router.push({ pathname: "/office/admin/purchase", params: { id: p.id } } as Href)}
                empty={{ title: t("ui.erpEmpty") }}
              />
            </>
          )}
        </OnlineState>
      </OfficeScreen>
    </AdminGate>
  );
}
