/** Proveedores y clientes con RUC. */
import { PARTY_KINDS } from "@yvy/shared";
import { t, tk } from "../../lib/i18n";
import { MasterPanel, useErpList, type FieldDef } from "./MasterPanel";

interface Party {
  id: string;
  name: string;
  ruc: string | null;
  kind: (typeof PARTY_KINDS)[number];
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
}

/** Proveedores y clientes de la organización. */
export const useParties = () => useErpList<Party>("parties");

/** Alta, cambio y baja de proveedores y clientes. */
export function PartiesPanel() {
  const fields: FieldDef[] = [
    { key: "name", label: t("ui.party.name"), required: true, maxLength: 120 },
    { key: "ruc", label: t("ui.party.ruc"), maxLength: 12, hint: t("ui.party.rucHint") },
    {
      key: "kind",
      label: t("ui.party.kind"),
      type: "select",
      initial: "supplier",
      options: PARTY_KINDS.map((k) => ({ value: k, label: tk(`ui.party.kind_${k}`) })),
    },
    { key: "phone", label: t("ui.party.phone"), maxLength: 40 },
    { key: "email", label: t("ui.party.email"), maxLength: 120 },
    { key: "address", label: t("ui.party.address"), maxLength: 200 },
    { key: "note", label: t("ui.party.note"), maxLength: 500 },
  ];
  return (
    <MasterPanel<Party>
      path="parties"
      exportName="proveedores-y-clientes"
      empty={{ title: t("ui.empty.partiesTitle"), body: t("ui.empty.partiesBody") }}
      newLabel={t("ui.party.new")}
      name={(p) => p.name}
      fields={fields}
      columns={[
        { header: t("ui.party.name"), cell: (p) => <span className="font-medium">{p.name}</span> },
        { header: t("ui.party.ruc"), hideBelow: "sm", cell: (p) => p.ruc ?? "" },
        { header: t("ui.party.kind"), cell: (p) => tk(`ui.party.kind_${p.kind}`) },
        { header: t("ui.party.phone"), hideBelow: "md", cell: (p) => p.phone ?? "" },
      ]}
    />
  );
}
