/** Proveedores y clientes: lista, alta y edición. /org/erp/parties (solo dueño y administrador). */
import { useState } from "react";
import { Plus } from "lucide-react-native";
import { t } from "@yvy/shared";
import { AdminGate, k, useParties } from "../../../src/office/adminKit";
import { NoSignalNote, useNoSignalReason } from "../../../src/office/erpCommon";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { PartySheet } from "../../../src/office/parties/PartySheet";
import { usePartyEditor, type Kind } from "../../../src/office/parties/usePartyEditor";
import { OnlineState } from "../../../src/office/state";
import { DataList, FilterChips } from "../../../src/office/ui";

/** Clientes y proveedores. */
export default function Parties() {
  const q = useParties();
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const editor = usePartyEditor();
  const noSignal = useNoSignalReason();
  const rows = (q.data ?? []).filter((p) => filter === "all" || p.kind === filter || p.kind === "both");

  return (
    <AdminGate need="manage" title={t("ui.admin.section_parties")}>
      <OfficeScreen title={t("ui.admin.section_parties")} query={q} action={{ label: t("ui.party.new"), icon: Plus, onPress: () => editor.open(null), disabled: !!noSignal }}>
        <NoSignalNote />
        <OnlineState query={q} empty={{ title: t("ui.empty.partiesTitle"), hint: t("ui.empty.partiesBody") }}>
          {(all) => (
            <>
              <FilterChips<"all" | Kind>
                value={filter}
                onChange={setFilter}
                options={[{ value: "all", label: t("ui.cost.all"), count: all.length }, { value: "supplier", label: t("ui.party.kind_supplier") }, { value: "customer", label: t("ui.party.kind_customer") }]}
              />
              <DataList
                rows={rows}
                keyOf={(p) => p.id}
                title={(p) => p.name}
                subtitle={(p) => [t(k(`ui.party.kind_${p.kind}`)), p.ruc, p.phone].filter(Boolean).join(", ")}
                onPress={editor.open}
                empty={{ title: t("ui.erp.empty") }}
              />
            </>
          )}
        </OnlineState>
        <PartySheet editor={editor} />
      </OfficeScreen>
    </AdminGate>
  );
}
