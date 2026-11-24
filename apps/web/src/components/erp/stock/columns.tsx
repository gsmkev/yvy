/** Columnas de las tablas del inventario: existencias, movimientos y lotes por vencer. */
import { fmtIsoDate } from "../../../lib/format";
import { t, tk } from "../../../lib/i18n";
import { fmtGs, fmtMoney, fmtQty } from "../../../lib/money";
import type { Column } from "../../ui";
import { PhotoRowMenu } from "../InvoicePhoto";
import { RowMenu } from "../adminSlot";
import { dayOf, type ExpiringLot, type StockMove, type Summary } from "./types";

/** Nombres de productos y depósitos para rotular las filas. */
export interface StockLookup {
  prod: (id: string) => { name: string; unit?: string } | undefined;
  wh: (id: string) => string;
  unit: (id: string) => string;
}

/** Columnas de la tabla de existencias. */
export function stockColumns(lk: StockLookup, rows: Summary["rows"], list: Summary["products"]): Column<Summary["products"][number]>[] {
  const { prod, wh, unit } = lk;
  return [
    { id: "product", header: t("ui.stock.product"), cell: (p) => prod(p.productId)?.name ?? p.productId, sort: (a, b) => (prod(a.productId)?.name ?? "").localeCompare(prod(b.productId)?.name ?? "") },
    {
      id: "where",
      header: t("ui.stock.where"),
      hideBelow: "md",
      cell: (p) => (
        <span className="text-tinta-2">
          {rows
            .filter((r) => r.productId === p.productId && Math.abs(r.qty) > 1e-9)
            .map((r) => `${wh(r.warehouseId)}: ${fmtQty(r.qty)}`)
            .join(" · ")}
        </span>
      ),
    },
    { id: "qty", header: t("ui.stock.qty"), align: "right", cell: (p) => <span className={p.qty < 0 ? "text-peligro" : ""}>{fmtQty(p.qty, unit(p.productId))}</span>, sort: (a, b) => a.qty - b.qty },
    ...(list[0]?.avgCostPyg !== undefined ? [{ id: "avg", header: t("ui.stock.avgCost"), align: "right", hideBelow: "lg", cell: (p: Summary["products"][number]) => (p.avgCostPyg === undefined ? "" : fmtGs(p.avgCostPyg)) } satisfies Column<Summary["products"][number]>] : []),
    ...(list[0]?.valuePyg !== undefined ? [{ id: "value", header: t("ui.stock.value"), align: "right", hideBelow: "sm", cell: (p: Summary["products"][number]) => (p.valuePyg === undefined ? "" : fmtGs(p.valuePyg)), sort: (a: Summary["products"][number], b: Summary["products"][number]) => (a.valuePyg ?? 0) - (b.valuePyg ?? 0) } satisfies Column<Summary["products"][number]>] : []),
    ];
}

/**
 * Columnas de la tabla de movimientos.
 * @param onRemove se llama al quitar un movimiento.
 */
export function moveColumns(lk: StockLookup, moveRows: StockMove[], onRemove: (m: StockMove) => void): Column<StockMove>[] {
  const { prod, wh, unit } = lk;
  return [
    { id: "date", header: t("ui.cost.date"), cell: (m) => <span className="num whitespace-nowrap">{fmtIsoDate(dayOf(m.occurredAt))}</span> },
    {
      id: "origin",
      header: t("ui.stock.origin"),
      hideBelow: "sm",
      cell: (m) => (
        <>
          {tk(`ui.stock.origin_${m.origin}`)}
          {m.originId && m.origin === "consumption" && <span className="block text-xs text-tinta-2">{t("ui.cost.fromRecord")}</span>}
        </>
      ),
    },
    {
      id: "product",
      header: t("ui.stock.product"),
      cell: (m) => (
        <>
          {prod(m.productId)?.name}
          <span className="block text-xs font-normal text-tinta-2">{wh(m.warehouseId)}</span>
        </>
      ),
    },
    {
      id: "qty",
      header: t("ui.stock.qty"),
      align: "right",
      cell: (m) => (
        <span className={m.qty < 0 ? "" : "text-accion"}>
          {m.qty > 0 ? "+" : ""}
          {fmtQty(m.qty, unit(m.productId))}
        </span>
      ),
    },
    ...(moveRows.some((m) => m.valuePyg !== undefined)
      ? [
          {
            id: "value",
            header: t("ui.stock.value"),
            align: "right",
            hideBelow: "md",
            cell: (m: StockMove) =>
              m.valuePyg === undefined ? (
                ""
              ) : (
                <>
                  {m.amount != null && m.currency ? fmtMoney(m.amount, m.currency) : fmtGs(Math.abs(m.valuePyg))}
                  {m.currency === "USD" && <span className="block text-xs text-tinta-2">{fmtGs(m.valuePyg)}</span>}
                </>
              ),
          } satisfies Column<StockMove>,
        ]
      : []),
    {
      id: "menu",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      width: "3rem",
      cell: (m) =>
        m.valuePyg !== undefined && m.origin === "purchase" ? (
          <PhotoRowMenu kind="stock-moves" id={m.id} hasPhoto={!!m.photoPath} name={fmtIsoDate(dayOf(m.occurredAt))} onDelete={() => onRemove(m)} />
        ) : (
          <RowMenu name={fmtIsoDate(dayOf(m.occurredAt))} onDelete={m.origin === "consumption" && m.originId ? undefined : () => onRemove(m)} />
        ),
    },
    ];
}

/** Columnas de la tabla de lotes por vencer. */
export function expiringColumns(lk: StockLookup): Column<ExpiringLot>[] {
  const { prod, unit } = lk;
  return [
    { id: "product", header: t("ui.stock.product"), cell: (l) => prod(l.productId)?.name },
    { id: "lot", header: t("ui.stock.lot"), hideBelow: "sm", cell: (l) => <span className="text-tinta-2">{l.lot ?? ""}</span> },
    { id: "qty", header: t("ui.stock.qty"), align: "right", hideBelow: "sm", cell: (l) => fmtQty(l.remaining, unit(l.productId)) },
    { id: "date", header: t("ui.stock.expires"), align: "right", cell: (l) => fmtIsoDate(l.expiresOn) },
    {
      id: "left",
      header: t("ui.expiring.title"),
      align: "right",
      cell: (l) => <span className={l.daysLeft < 0 ? "text-peligro" : "text-trigo-texto"}>{l.daysLeft < 0 ? t("ui.expiring.expired", { n: -l.daysLeft }) : t("ui.expiring.in", { n: l.daysLeft })}</span>,
    },
    ];
}
