/** Proveedores y clientes con RUC (E-02). */
import { PARTY_KINDS } from "@yvy/shared";
import { t, tk } from "../../lib/i18n";
import { MasterPanel, useErpList, type FieldDef } from "./MasterPanel";

export interface Party {
  id: string;
  name: string;
  ruc: string | null;
  kind: (typeof PARTY_KINDS)[number];
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
}

export const useParties = () => useErpList<Party>("parties");

export function PartiesPanel() {
  const fields: FieldDef[] = [
    { key: "name", label: t("ui.partyName"), required: true, maxLength: 120 },
    { key: "ruc", label: t("ui.partyRuc"), maxLength: 12, hint: t("ui.partyRucHint") },
    {
      key: "kind",
      label: t("ui.partyKind"),
      type: "select",
      initial: "supplier",
      options: PARTY_KINDS.map((k) => ({ value: k, label: tk(`ui.partyKind_${k}`) })),
    },
    { key: "phone", label: t("ui.partyPhone"), maxLength: 40 },
    { key: "email", label: t("ui.partyEmail"), maxLength: 120 },
    { key: "address", label: t("ui.partyAddress"), maxLength: 200 },
    { key: "note", label: t("ui.partyNote"), maxLength: 500 },
  ];
  return (
    <MasterPanel<Party>
      path="parties"
      newLabel={t("ui.partyNew")}
      name={(p) => p.name}
      fields={fields}
      columns={[
        { header: t("ui.partyName"), cell: (p) => <span className="font-medium">{p.name}</span> },
        { header: t("ui.partyRuc"), cell: (p) => p.ruc ?? "" },
        { header: t("ui.partyKind"), cell: (p) => tk(`ui.partyKind_${p.kind}`) },
        { header: t("ui.partyPhone"), cell: (p) => p.phone ?? "" },
      ]}
    />
  );
}
