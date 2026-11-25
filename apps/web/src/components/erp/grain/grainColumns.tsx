/** Columnas de las tablas de contratos, entregas y liquidaciones de granos. */
import { fmtIsoDate, fmtNum } from "../../../lib/format";
import { t, tk } from "../../../lib/i18n";
import { fmtGs, fmtMoney } from "../../../lib/money";
import { Button, type Column } from "../../ui";
import { RowMenu } from "../adminSlot";
import type { Contract, Delivery, Settlement } from "./useGrainData";

const actionsHeader = <span className="sr-only">{t("ui.row.actionsHeader")}</span>;

/** Columnas de contratos; `party` nombra al comprador y `onAction` abre el alta de entrega o liquidación. */
export function contractColumns(party: (id: string | null) => string, onAction: (kind: "delivery" | "settlement", c: Contract) => void): Column<Contract>[] {
  return [
    {
      id: "contract",
      header: t("ui.grain.contract"),
      cell: (c) => (
        <>
          <div className="font-medium">{[tk(`fields.crop.${c.crop}`), c.number].filter(Boolean).join(" ")}</div>
          <div className="text-meta font-normal text-tinta-2">{party(c.partyId)}</div>
        </>
      ),
    },
    { id: "tons", header: t("ui.grain.tons"), align: "right", cell: (c) => fmtNum(c.tons) },
    { id: "delivered", header: t("ui.grain.delivered"), align: "right", hideBelow: "sm", cell: (c) => t("ui.grain.of", { a: fmtNum(c.deliveredTons), b: fmtNum(c.toDeliverTons) }) },
    { id: "settled", header: t("ui.grain.settled"), align: "right", hideBelow: "md", cell: (c) => t("ui.grain.of", { a: fmtNum(c.settledTons), b: fmtNum(c.toSettleTons) }) },
    { id: "price", header: t("ui.grain.price"), align: "right", hideBelow: "sm", cell: (c) => fmtMoney(c.priceMinor, c.currency) },
    {
      id: "actions",
      header: actionsHeader,
      align: "right",
      cell: (c) => (
        <span className="inline-flex gap-1 whitespace-nowrap">
          <Button size="sm" variant="quiet" onClick={() => onAction("delivery", c)}>
            {t("ui.grain.addDelivery")}
          </Button>
          <Button size="sm" variant="quiet" onClick={() => onAction("settlement", c)}>
            {t("ui.grain.addSettlement")}
          </Button>
        </span>
      ),
    },
  ];
}

const contractName = (contracts: Contract[] | undefined) => (id: string) => {
  const c = contracts?.find((x) => x.id === id);
  return c ? (c.number ?? tk(`fields.crop.${c.crop}`)) : "?";
};

/** Columnas de entregas; el contrato es el título de la tarjeta en el celular. */
export function deliveryColumns(contracts: Contract[] | undefined, deliveries: Delivery[], onRemove: (id: string) => void): Column<Delivery>[] {
  const label = contractName(contracts);
  const cols: Column<Delivery>[] = [
    { id: "date", header: t("ui.cost.date"), cell: (d) => <span className="num">{fmtIsoDate(d.date)}</span>, sort: (a, b) => a.date.localeCompare(b.date) },
    { id: "contract", header: t("ui.grain.contract"), mobile: "title", cell: (d) => <span className="font-medium">{label(d.contractId)}</span> },
    { id: "tons", header: t("ui.grain.tons"), align: "right", cell: (d) => `${fmtNum(d.tons)} t` },
  ];
  if (deliveries.some((d) => d.ticket)) cols.push({ id: "ticket", header: t("ui.grain.ticket"), hideBelow: "sm", cell: (d) => <span className="text-tinta-2">{d.ticket ?? ""}</span> });
  if (deliveries.some((d) => d.moisturePct !== null)) cols.push({ id: "moisture", header: t("ui.grain.moisture"), align: "right", hideBelow: "md", cell: (d) => (d.moisturePct === null ? "" : `${d.moisturePct} %`) });
  cols.push({ id: "menu", header: actionsHeader, align: "right", width: "3rem", cell: (d) => <RowMenu name={fmtIsoDate(d.date)} onDelete={() => onRemove(d.id)} /> });
  return cols;
}

/** Columnas de liquidaciones; el contrato es el título de la tarjeta en el celular. */
export function settlementColumns(contracts: Contract[] | undefined, onRemove: (id: string) => void): Column<Settlement>[] {
  const label = contractName(contracts);
  return [
    { id: "date", header: t("ui.cost.date"), cell: (l) => <span className="num">{fmtIsoDate(l.date)}</span>, sort: (a, b) => a.date.localeCompare(b.date) },
    { id: "contract", header: t("ui.grain.contract"), mobile: "title", cell: (l) => <span className="font-medium">{label(l.contractId)}</span> },
    { id: "tons", header: t("ui.grain.tons"), align: "right", hideBelow: "sm", cell: (l) => `${fmtNum(l.tons)} t` },
    { id: "net", header: t("ui.grain.net"), align: "right", cell: (l) => fmtMoney(l.netAmount, l.currency) },
    { id: "netPyg", header: t("ui.grain.netPyg"), align: "right", hideBelow: "md", cell: (l) => <span className="text-tinta-2">{fmtGs(l.netPyg)}</span> },
    { id: "due", header: t("ui.purch.dueLabel"), hideBelow: "md", cell: (l) => <span className="text-tinta-2">{l.dueDate ? fmtIsoDate(l.dueDate) : ""}</span> },
    { id: "menu", header: actionsHeader, align: "right", width: "3rem", cell: (l) => <RowMenu name={fmtIsoDate(l.date)} onDelete={() => onRemove(l.id)} /> },
  ];
}
