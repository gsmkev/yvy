/** Contratistas con tarifas por hectárea, por hora o por tonelada (E-04). */
import { CONTRACTOR_SERVICES, CURRENCIES, RATE_UNITS, type Currency } from "@yvy/shared";
import { t, tk } from "../../lib/i18n";
import { fmtMoney } from "../../lib/money";
import { MasterPanel, useErpList, type FieldDef } from "./MasterPanel";
import { useParties } from "./PartiesPanel";

export interface Contractor {
  id: string;
  name: string;
  partyId: string | null;
  service: (typeof CONTRACTOR_SERVICES)[number];
  rateUnit: (typeof RATE_UNITS)[number];
  rateAmount: number;
  currency: Currency;
  note: string | null;
}

export const useContractors = () => useErpList<Contractor>("contractors");

export function ContractorsPanel() {
  const parties = useParties();
  const fields: FieldDef[] = [
    { key: "name", label: t("ui.contractorName"), required: true, maxLength: 120 },
    {
      key: "partyId",
      label: t("ui.contractorParty"),
      type: "select",
      options: [{ value: "", label: t("ui.contractorNoParty") }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))],
    },
    {
      key: "service",
      label: t("ui.contractorService"),
      type: "select",
      initial: "spraying",
      options: CONTRACTOR_SERVICES.map((k) => ({ value: k, label: tk(`ui.contractorService_${k}`) })),
    },
    {
      key: "rateUnit",
      label: t("ui.contractorRateUnit"),
      type: "select",
      initial: "ha",
      options: RATE_UNITS.map((k) => ({ value: k, label: tk(`ui.rateUnit_${k}`) })),
    },
    {
      key: "currency",
      label: t("ui.currency"),
      type: "select",
      initial: "PYG",
      options: CURRENCIES.map((k) => ({ value: k, label: k })),
    },
    { key: "rateAmount", label: t("ui.contractorRate"), type: "money", currencyKey: "currency", required: true },
    { key: "note", label: t("ui.partyNote"), maxLength: 300 },
  ];
  return (
    <MasterPanel<Contractor>
      path="contractors"
      newLabel={t("ui.contractorNew")}
      name={(c) => c.name}
      fields={fields}
      columns={[
        { header: t("ui.contractorName"), cell: (c) => <span className="font-medium">{c.name}</span> },
        { header: t("ui.contractorService"), cell: (c) => tk(`ui.contractorService_${c.service}`) },
        {
          header: t("ui.contractorRate"),
          right: true,
          cell: (c) => `${fmtMoney(c.rateAmount, c.currency)} ${tk(`ui.rateUnitPer_${c.rateUnit}`)}`,
        },
        { header: t("ui.contractorParty"), cell: (c) => parties.data?.find((p) => p.id === c.partyId)?.name ?? "" },
      ]}
    />
  );
}
