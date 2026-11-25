/** Contratistas con tarifas por hectárea, por hora o por tonelada. */
import { CONTRACTOR_SERVICES, CURRENCIES, RATE_UNITS, type Currency } from "@yvy/shared";
import { t, tk } from "../../lib/i18n";
import { fmtMoney } from "../../lib/money";
import { useErpList, type FieldDef } from "./RowModal";
import { RecordList } from "./RecordList";
import { useParties } from "./PartiesPanel";

interface Contractor {
  id: string;
  name: string;
  partyId: string | null;
  service: (typeof CONTRACTOR_SERVICES)[number];
  rateUnit: (typeof RATE_UNITS)[number];
  rateAmount: number;
  currency: Currency;
  note: string | null;
}

/** Contratistas de la organización. */
export const useContractors = () => useErpList<Contractor>("contractors");

/** Alta, cambio y baja de contratistas con sus tarifas. */
export function ContractorsPanel() {
  const parties = useParties();
  const fields: FieldDef[] = [
    { key: "name", label: t("ui.contractor.name"), required: true, maxLength: 120 },
    {
      key: "partyId",
      label: t("ui.contractor.party"),
      type: "select",
      options: [{ value: "", label: t("ui.contractor.noParty") }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))],
    },
    {
      key: "service",
      label: t("ui.contractor.service"),
      type: "select",
      initial: "spraying",
      options: CONTRACTOR_SERVICES.map((k) => ({ value: k, label: tk(`ui.contractor.service_${k}`) })),
    },
    {
      key: "rateUnit",
      label: t("ui.contractor.rateUnit"),
      type: "select",
      initial: "ha",
      options: RATE_UNITS.map((k) => ({ value: k, label: tk(`ui.rate.unit_${k}`) })),
    },
    {
      key: "currency",
      label: t("ui.common.currency"),
      type: "select",
      initial: "PYG",
      options: CURRENCIES.map((k) => ({ value: k, label: k })),
    },
    { key: "rateAmount", label: t("ui.contractor.rate"), type: "money", currencyKey: "currency", required: true },
    { key: "note", label: t("ui.party.note"), maxLength: 300 },
  ];
  return (
    <RecordList<Contractor>
      path="contractors"
      exportName="contratistas"
      emptyTitle={t("ui.contractor.emptyTitle")}
      emptyHint={t("ui.contractor.emptyHint")}
      newLabel={t("ui.contractor.new")}
      name={(c) => c.name}
      fields={fields}
      columns={[
        { header: t("ui.contractor.name"), cell: (c) => <span className="font-medium">{c.name}</span> },
        { header: t("ui.contractor.service"), cell: (c) => tk(`ui.contractor.service_${c.service}`) },
        {
          header: t("ui.contractor.rate"),
          right: true,
          cell: (c) => `${fmtMoney(c.rateAmount, c.currency)} ${tk(`ui.rate.unitPer_${c.rateUnit}`)}`,
        },
        { header: t("ui.contractor.party"), hideBelow: "md", cell: (c) => parties.data?.find((p) => p.id === c.partyId)?.name ?? "" },
      ]}
    />
  );
}
