/** Tipo, columnas y campos de las compras y ventas de hacienda. */
import { CATTLE_DEAL_KINDS, CURRENCIES, localDate, type Currency } from "@yvy/shared";
import { fmtIsoDate, fmtNum } from "../../../lib/format";
import { t, tk } from "../../../lib/i18n";
import { fmtMoney } from "../../../lib/money";
import type { Column } from "../../ui";
import { PhotoRowMenu } from "../InvoicePhoto";
import type { FieldDef } from "../RowModal";

/** Compra o venta de hacienda. */
export interface Deal {
  id: string;
  kind: (typeof CATTLE_DEAL_KINDS)[number];
  date: string;
  partyId: string | null;
  category: string | null;
  heads: number;
  totalKg: number;
  amount: number;
  currency: Currency;
  guideNumber: string | null;
  pricePerKg: number | null;
  kgPerHead: number | null;
  photoPath: string | null;
}

type Option = { value: string; label: string };

/** Campos del alta; `parties`, `farms` y `seasons` son las opciones de cada lista. */
export function dealFields(parties: Option[], farms: Option[], seasons: Option[]): FieldDef[] {
  const blank = { value: "", label: "—" };
  return [
    { key: "kind", label: t("ui.cattle.kind"), type: "select", initial: "sell", options: CATTLE_DEAL_KINDS.map((k) => ({ value: k, label: tk(`ui.cattle.kind_${k}`) })) },
    { key: "date", label: t("ui.cost.date"), type: "date", required: true, initial: localDate(Date.now()) },
    { key: "partyId", label: t("ui.cattle.party"), type: "select", options: [blank, ...parties] },
    { key: "farmId", label: t("ui.cost.farm"), type: "select", options: [blank, ...farms] },
    { key: "category", label: t("ui.cattle.category"), maxLength: 60 },
    { key: "heads", label: t("ui.cattle.heads"), type: "number", required: true, min: 1, step: "1" },
    { key: "totalKg", label: t("ui.cattle.kg"), type: "number", required: true, min: 0 },
    { key: "currency", label: t("ui.common.currency"), type: "select", initial: "PYG", options: CURRENCIES.map((c) => ({ value: c, label: c })) },
    { key: "amount", label: t("ui.cattle.amount"), type: "money", required: true, currencyKey: "currency" },
    { key: "guideNumber", label: t("ui.cattle.guide"), maxLength: 40 },
    { key: "dueDate", label: t("ui.purch.dueLabel"), type: "date" },
    { key: "seasonId", label: t("ui.cost.season"), type: "select", options: [blank, ...seasons] },
  ];
}

/** Columnas de la tabla; la clase del trato es el título de la tarjeta en el celular. */
export function dealColumns(party: (id: string | null) => string, hasGuide: boolean, onRemove: (id: string) => void): Column<Deal>[] {
  const cols: Column<Deal>[] = [
    { id: "date", header: t("ui.cost.date"), cell: (d) => <span className="num">{fmtIsoDate(d.date)}</span>, sort: (a, b) => a.date.localeCompare(b.date) },
    {
      id: "kind",
      header: t("ui.cattle.kind"),
      mobile: "title",
      cell: (d) => (
        <>
          {tk(`ui.cattle.kind_${d.kind}`)}
          {d.category ? <span className="block text-meta font-normal text-tinta-2">{d.category}</span> : null}
        </>
      ),
    },
    { id: "party", header: t("ui.cattle.party"), hideBelow: "sm", cell: (d) => party(d.partyId) },
    { id: "heads", header: t("ui.cattle.heads"), align: "right", cell: (d) => d.heads },
    { id: "kg", header: t("ui.cattle.kg"), align: "right", hideBelow: "md", cell: (d) => fmtNum(d.totalKg) },
    { id: "pricePerKg", header: t("ui.cattle.pricePerKg"), align: "right", hideBelow: "lg", cell: (d) => (d.pricePerKg === null ? "" : fmtMoney(Math.round(d.pricePerKg), d.currency)) },
    { id: "amount", header: t("ui.cattle.amount"), align: "right", cell: (d) => <span className="font-medium">{fmtMoney(d.amount, d.currency)}</span> },
  ];
  if (hasGuide) cols.push({ id: "guide", header: t("ui.cattle.guide"), hideBelow: "lg", cell: (d) => <span className="text-tinta-2">{d.guideNumber ?? ""}</span> });
  cols.push({
    id: "menu",
    header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
    align: "right",
    width: "3rem",
    cell: (d) => <PhotoRowMenu kind="cattle-deals" id={d.id} hasPhoto={!!d.photoPath} name={fmtIsoDate(d.date)} onDelete={() => onRemove(d.id)} />,
  });
  return cols;
}
