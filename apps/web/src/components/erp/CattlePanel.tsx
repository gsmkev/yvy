/** Compras y ventas de hacienda: cabezas, kilos, precio y guía de traslado. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CATTLE_DEAL_KINDS, CURRENCIES, localDate, type Currency } from "@yvy/shared";
import { del, get } from "../../lib/api";
import { fmtIsoDate, fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtMoney } from "../../lib/money";
import { useFarms } from "../../lib/queries";
import { Button, DataTable, EmptyState, ErrorBox, Spinner, toast, type Column } from "../ui";
import { useSeasonList } from "./costs/useCosts";
import { PhotoRowMenu } from "./InvoicePhoto";
import { HeaderActions, useTableExport } from "./adminSlot";
import { RowModal, type FieldDef } from "./RowModal";
import { useParties } from "./PartiesPanel";

interface Deal {
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

/** Compras y ventas de hacienda con guía de traslado. */
export function CattlePanel() {
  const q = useQuery({ queryKey: ["erp", "cattle-deals"], queryFn: () => get<Deal[]>("/org/erp/cattle-deals") });
  const parties = useParties();
  const farms = useFarms();
  const seasons = useSeasonList();
  const [creating, setCreating] = useState(false);
  const exp = useTableExport("ganado");
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/cattle-deals/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const fields: FieldDef[] = [
    { key: "kind", label: t("ui.cattle.kind"), type: "select", initial: "sell", options: CATTLE_DEAL_KINDS.map((k) => ({ value: k, label: tk(`ui.cattle.kind_${k}`) })) },
    { key: "date", label: t("ui.cost.date"), type: "date", required: true, initial: localDate(Date.now()) },
    { key: "partyId", label: t("ui.cattle.party"), type: "select", options: [{ value: "", label: "—" }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))] },
    { key: "farmId", label: t("ui.cost.farm"), type: "select", options: [{ value: "", label: "—" }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))] },
    { key: "category", label: t("ui.cattle.category"), maxLength: 60 },
    { key: "heads", label: t("ui.cattle.heads"), type: "number", required: true, min: 1, step: "1" },
    { key: "totalKg", label: t("ui.cattle.kg"), type: "number", required: true, min: 0 },
    { key: "currency", label: t("ui.common.currency"), type: "select", initial: "PYG", options: CURRENCIES.map((c) => ({ value: c, label: c })) },
    { key: "amount", label: t("ui.cattle.amount"), type: "money", required: true, currencyKey: "currency" },
    { key: "guideNumber", label: t("ui.cattle.guide"), maxLength: 40 },
    { key: "dueDate", label: t("ui.purch.dueLabel"), type: "date" },
    { key: "seasonId", label: t("ui.cost.season"), type: "select", options: [{ value: "", label: "—" }, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))] },
  ];
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "";
  const rows = q.data ?? [];
  const columns: Column<Deal>[] = [
    { id: "date", header: t("ui.cost.date"), cell: (d) => <span className="num">{fmtIsoDate(d.date)}</span>, sort: (a, b) => a.date.localeCompare(b.date) },
    {
      id: "kind",
      header: t("ui.cattle.kind"),
      cell: (d) => (
        <>
          {tk(`ui.cattle.kind_${d.kind}`)}
          {d.category ? <span className="text-tinta-2"> · {d.category}</span> : null}
        </>
      ),
    },
    { id: "party", header: t("ui.cattle.party"), hideBelow: "sm", cell: (d) => party(d.partyId) },
    { id: "heads", header: t("ui.cattle.heads"), align: "right", cell: (d) => d.heads },
    { id: "kg", header: t("ui.cattle.kg"), align: "right", hideBelow: "md", cell: (d) => fmtNum(d.totalKg) },
    { id: "pricePerKg", header: t("ui.cattle.pricePerKg"), align: "right", hideBelow: "lg", cell: (d) => (d.pricePerKg === null ? "" : fmtMoney(Math.round(d.pricePerKg), d.currency)) },
    { id: "amount", header: t("ui.cattle.amount"), align: "right", cell: (d) => <span className="font-medium">{fmtMoney(d.amount, d.currency)}</span> },
    ...(rows.some((d) => d.guideNumber) ? [{ id: "guide", header: t("ui.cattle.guide"), hideBelow: "lg", cell: (d: Deal) => <span className="text-tinta-2">{d.guideNumber ?? ""}</span> } satisfies Column<Deal>] : []),
    {
      id: "menu",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      align: "right",
      width: "3rem",
      cell: (d) => <PhotoRowMenu kind="cattle-deals" id={d.id} hasPhoto={!!d.photoPath} name={fmtIsoDate(d.date)} onDelete={() => remove.mutate(d.id)} />,
    },
  ];
  const newButton = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      {t("ui.cattle.new")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (
        <>
          <HeaderActions>{newButton}</HeaderActions>
          {exp.menu}
        </>
      )}
      {rows.length === 0 ? (
        <EmptyState title={t("ui.empty.cattleTitle")} action={newButton}>
          {t("ui.empty.cattleBody")}
        </EmptyState>
      ) : (
        <div ref={exp.ref}>
          <DataTable columns={columns} rows={rows} rowKey={(d) => d.id} caption={t("ui.admin.section_cattle")} />
        </div>
      )}
      {remove.error ? <ErrorBox error={remove.error} /> : null}
      {creating && <RowModal title={t("ui.cattle.new")} fields={fields} row={null} path="cattle-deals" onClose={() => setCreating(false)} />}
    </div>
  );
}
